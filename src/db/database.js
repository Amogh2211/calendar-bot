// src/db/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');  // add this


class BotDatabase {
    constructor() {
        const dbDir = path.join(__dirname, '../../data');
        fs.mkdirSync(dbDir, { recursive: true });  // add this — creates the folder if missing
        this.db = new Database(path.join(dbDir, 'bot.db'));
        this.db = new Database(path.join(__dirname, '../../data/bot.db'));
        this.db.pragma('journal_mode = WAL');
        this.init();
    }

    init() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT    NOT NULL,
        message     TEXT    NOT NULL,
        fire_at     TEXT    NOT NULL,
        fired       INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT    NOT NULL,
        title       TEXT    NOT NULL,
        done        INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now')),
        done_at     TEXT    DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS recurring (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      TEXT    NOT NULL,
        message      TEXT    NOT NULL,
        frequency    TEXT    NOT NULL,  -- 'daily', 'weekdays', 'weekly', 'interval'
        time_hour    INTEGER,           -- exact hour for daily/weekdays/weekly
        time_minute  INTEGER,           -- exact minute for daily/weekdays/weekly
        day_of_week  INTEGER,           -- 0=Sun..6=Sat, only for 'weekly'
        interval_min INTEGER,           -- minutes between fires, only for 'interval'
        window_start INTEGER,           -- earliest hour allowed to fire (0-23)
        window_end   INTEGER,           -- latest hour allowed to fire (0-23)
        active       INTEGER DEFAULT 1,
        created_at   TEXT    DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id          TEXT PRIMARY KEY,
        briefing_hour    INTEGER DEFAULT 8,
        briefing_minute  INTEGER DEFAULT 0,
        briefing_enabled INTEGER DEFAULT 1,
        timezone_offset  INTEGER DEFAULT 0
      );
    `);

        // Safe migration: add new columns to existing databases without losing data.
        // SQLite doesn't support IF NOT EXISTS on ALTER TABLE, so we check manually.
        const cols = this.db.prepare('PRAGMA table_info(recurring)').all().map(c => c.name);
        for (const [col, type] of [
            ['interval_min', 'INTEGER'],
            ['window_start', 'INTEGER'],
            ['window_end', 'INTEGER'],
        ]) {
            if (!cols.includes(col)) {
                this.db.exec(`ALTER TABLE recurring ADD COLUMN ${col} ${type}`);
                console.log(`✅ Migrated DB: added column '${col}'`);
            }
        }

        console.log('✅ Database initialized');
    }

    // ─── Reminders ────────────────────────────────────────────────────────────

    addReminder(userId, message, fireAt) {
        return this.db.prepare(
            'INSERT INTO reminders (user_id, message, fire_at) VALUES (?, ?, ?)'
        ).run(userId, message, fireAt.toISOString());
    }

    getDueReminders() {
        return this.db.prepare(`
    SELECT * FROM reminders
    WHERE fired = 0 AND datetime(fire_at) <= datetime('now')
  `).all();
    }

    getUpcomingReminders(userId) {
        return this.db.prepare(`
    SELECT * FROM reminders
    WHERE user_id = ? AND fired = 0 AND datetime(fire_at) > datetime('now')
    ORDER BY fire_at ASC
  `).all(userId);
    }

    markReminderFired(id) {
        this.db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(id);
    }

    deleteReminder(id, userId) {
        return this.db.prepare(
            'DELETE FROM reminders WHERE id = ? AND user_id = ?'
        ).run(id, userId);
    }

    // ─── Tasks ────────────────────────────────────────────────────────────────

    addTask(userId, title) {
        return this.db.prepare(
            'INSERT INTO tasks (user_id, title) VALUES (?, ?)'
        ).run(userId, title);
    }

    getTasks(userId, includeCompleted = false) {
        const sql = includeCompleted
            ? 'SELECT * FROM tasks WHERE user_id = ? ORDER BY done ASC, created_at ASC'
            : 'SELECT * FROM tasks WHERE user_id = ? AND done = 0 ORDER BY created_at ASC';
        return this.db.prepare(sql).all(userId);
    }

    completeTask(id, userId) {
        return this.db.prepare(`
      UPDATE tasks SET done = 1, done_at = datetime('now') WHERE id = ? AND user_id = ?
    `).run(id, userId);
    }

    deleteTask(id, userId) {
        return this.db.prepare(
            'DELETE FROM tasks WHERE id = ? AND user_id = ?'
        ).run(id, userId);
    }

    clearCompletedTasks(userId) {
        return this.db.prepare(
            'DELETE FROM tasks WHERE user_id = ? AND done = 1'
        ).run(userId);
    }

    // ─── Recurring ────────────────────────────────────────────────────────────

    // windowStart and windowEnd are hour integers (0-23) or null for no restriction
    addRecurring({ userId, message, frequency, timeHour, timeMinute, dayOfWeek, intervalMin, windowStart, windowEnd }) {
        return this.db.prepare(`
      INSERT INTO recurring
        (user_id, message, frequency, time_hour, time_minute, day_of_week, interval_min, window_start, window_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, message, frequency,
            timeHour ?? null,
            timeMinute ?? null,
            dayOfWeek ?? null,
            intervalMin ?? null,
            windowStart ?? null,
            windowEnd ?? null);
    }

    getRecurring(userId) {
        return this.db.prepare(
            'SELECT * FROM recurring WHERE user_id = ? AND active = 1 ORDER BY time_hour, time_minute, interval_min'
        ).all(userId);
    }

    getAllActiveRecurring() {
        return this.db.prepare('SELECT * FROM recurring WHERE active = 1').all();
    }

    deleteRecurring(id, userId) {
        return this.db.prepare(
            'UPDATE recurring SET active = 0 WHERE id = ? AND user_id = ?'
        ).run(id, userId);
    }

    // ─── Settings ─────────────────────────────────────────────────────────────

    getSettings(userId) {
        let s = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
        if (!s) {
            this.db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId);
            s = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
        }
        return s;
    }

    updateSettings(userId, fields) {
        this.getSettings(userId);
        const keys = Object.keys(fields);
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        this.db.prepare(
            `UPDATE user_settings SET ${setClause} WHERE user_id = ?`
        ).run(...keys.map(k => fields[k]), userId);
    }
}

module.exports = new BotDatabase();