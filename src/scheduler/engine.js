// src/scheduler/engine.js
const schedule = require('node-schedule');
const db = require('../db/database');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
}

function formatDateTime(date) {
    return new Date(date).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
}

async function sendDM(client, userId, content) {
    try {
        const user = await client.users.fetch(userId);
        await user.send(content);
        return true;
    } catch (err) {
        console.error(`❌ Could not DM user ${userId}:`, err.message);
        return false;
    }
}

// ── Window check ────────────────────────────────────────────────────────────
// Returns true if the current hour falls within the reminder's allowed window.
// If no window is set (both null), it always passes.
function withinWindow(rec) {
    if (rec.window_start === null || rec.window_end === null) return true;
    const hour = new Date().getHours();
    return hour >= rec.window_start && hour < rec.window_end;
}

// ── Recurring fire check ─────────────────────────────────────────────────────
// Called every minute. Returns true if this recurring entry should fire right now.
function shouldFireRecurring(rec) {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dow = now.getDay();

    // Window check applies to ALL frequency types
    if (!withinWindow(rec)) return false;

    if (rec.frequency === 'daily') {
        return rec.time_hour === hour && rec.time_minute === minute;
    }

    if (rec.frequency === 'weekdays') {
        return dow >= 1 && dow <= 5 && rec.time_hour === hour && rec.time_minute === minute;
    }

    if (rec.frequency === 'weekly') {
        return rec.day_of_week === dow && rec.time_hour === hour && rec.time_minute === minute;
    }

    if (rec.frequency === 'interval') {
        // Fire when the current minute count since midnight is divisible by the interval.
        // e.g. interval_min=120 fires at minute 0, 120, 240, 360... (every 2 hours)
        const minutesSinceMidnight = hour * 60 + minute;
        return minutesSinceMidnight % rec.interval_min === 0;
    }

    return false;
}

// ── Morning briefing ─────────────────────────────────────────────────────────
async function buildBriefing(userId) {
    const tasks = db.getTasks(userId, false);
    const reminders = db.getUpcomingReminders(userId);
    const today = new Date();

    const todayReminders = reminders.filter(r =>
        new Date(r.fire_at).toDateString() === today.toDateString()
    );

    const recurring = db.getRecurring(userId);

    let msg = `☀️ **Good morning! Here's your daily briefing**\n`;
    msg += `📅 ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n\n`;

    if (tasks.length === 0) {
        msg += `✅ **Tasks** — nothing on your list today\n\n`;
    } else {
        msg += `📋 **Tasks (${tasks.length})**\n`;
        tasks.forEach((t, i) => { msg += `> ${i + 1}. ${t.title}  \`id:${t.id}\`\n`; });
        msg += '\n';
    }

    if (todayReminders.length > 0) {
        msg += `⏰ **Reminders today (${todayReminders.length})**\n`;
        todayReminders.forEach(r => {
            msg += `> • ${formatTime(r.fire_at)} — ${r.message}  \`id:${r.id}\`\n`;
        });
        msg += '\n';
    }

    if (recurring.length > 0) {
        msg += `🔁 **Recurring (${recurring.length} active)**\n`;
        recurring.forEach(r => {
            let desc = '';
            if (r.frequency === 'interval') {
                const h = Math.floor(r.interval_min / 60);
                const m = r.interval_min % 60;
                desc = `every ${[h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ')}`;
            } else {
                const t = `${String(r.time_hour).padStart(2, '0')}:${String(r.time_minute).padStart(2, '0')}`;
                desc = r.frequency === 'weekly' ? `every ${DAYS[r.day_of_week]} at ${t}` : `${r.frequency} at ${t}`;
            }
            if (r.window_start !== null && r.window_end !== null) {
                desc += ` (${String(r.window_start).padStart(2, '0')}:00–${String(r.window_end).padStart(2, '0')}:00 only)`;
            }
            msg += `> • ${desc} — ${r.message}\n`;
        });
    }

    msg += `\n> Use \`/task done\` to check off tasks, \`/schedule\` to see all reminders.`;
    return msg;
}

// ── Main scheduler ───────────────────────────────────────────────────────────
function startScheduler(client) {
    console.log('⏱️  Scheduler started');

    schedule.scheduleJob('* * * * *', async () => {
        // 1. One-time reminders that are due
        const dueReminders = db.getDueReminders();

        // // Add this temporarily
        // console.log(`[tick] ${new Date().toISOString()} — checking ${dueReminders.length} due reminders`);
        // const all = db.db.prepare('SELECT * FROM reminders WHERE fired = 0').all();
        // console.log('[pending reminders]', all);

        for (const reminder of dueReminders) {
            const sent = await sendDM(client, reminder.user_id, `⏰ **Reminder:** ${reminder.message}`);
            if (sent) db.markReminderFired(reminder.id);
        }

        // 2. Recurring reminders
        const allRecurring = db.getAllActiveRecurring();
        for (const rec of allRecurring) {
            if (shouldFireRecurring(rec)) {
                await sendDM(client, rec.user_id, `🔁 **Recurring reminder:** ${rec.message}`);
            }
        }

        // 3. Morning briefings
        const users = db.db.prepare(
            'SELECT DISTINCT user_id FROM user_settings WHERE briefing_enabled = 1'
        ).all();

        for (const { user_id } of users) {
            const s = db.getSettings(user_id);
            const now = new Date();
            if (s.briefing_enabled && now.getHours() === s.briefing_hour && now.getMinutes() === s.briefing_minute) {
                const briefing = await buildBriefing(user_id);
                await sendDM(client, user_id, briefing);
            }
        }
    });
}

module.exports = { startScheduler, formatDateTime, formatTime, sendDM };