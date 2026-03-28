// src/bot/commands/recurring.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/database');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Build a human-readable description of a recurring reminder for display
function describeRecurring(r) {
  let freq = '';

  if (r.frequency === 'interval') {
    const hrs  = Math.floor(r.interval_min / 60);
    const mins = r.interval_min % 60;
    const parts = [];
    if (hrs)  parts.push(`${hrs}h`);
    if (mins) parts.push(`${mins}m`);
    freq = `every ${parts.join(' ')}`;
  } else if (r.frequency === 'daily') {
    const t = fmt(r.time_hour, r.time_minute);
    freq = `daily at ${t}`;
  } else if (r.frequency === 'weekdays') {
    const t = fmt(r.time_hour, r.time_minute);
    freq = `weekdays (Mon–Fri) at ${t}`;
  } else if (r.frequency === 'weekly') {
    const t = fmt(r.time_hour, r.time_minute);
    freq = `every ${DAYS[r.day_of_week]} at ${t}`;
  }

  // Append the active window if set
  if (r.window_start !== null && r.window_end !== null) {
    freq += ` · only between ${fmt(r.window_start, 0)} – ${fmt(r.window_end, 0)}`;
  }

  return freq;
}

function fmt(hour, minute) {
  const h = String(hour).padStart(2, '0');
  const m = String(minute ?? 0).padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recurring')
    .setDescription('Manage recurring reminders')

    // ── /recurring add ────────────────────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Create a recurring reminder')
      .addStringOption(o => o
        .setName('message')
        .setDescription('What to remind you')
        .setRequired(true))
      .addStringOption(o => o
        .setName('frequency')
        .setDescription('How often to fire')
        .setRequired(true)
        .addChoices(
          { name: 'Daily (set a specific time)',              value: 'daily'    },
          { name: 'Weekdays Mon–Fri (set a specific time)',   value: 'weekdays' },
          { name: 'Weekly (set a day + time)',                value: 'weekly'   },
          { name: 'Every X minutes/hours (set an interval)', value: 'interval' },
        ))

      // For daily / weekdays / weekly — the exact time to fire
      .addIntegerOption(o => o
        .setName('hour')
        .setDescription('Hour to fire (0–23) — required for daily/weekdays/weekly')
        .setMinValue(0).setMaxValue(23))
      .addIntegerOption(o => o
        .setName('minute')
        .setDescription('Minute to fire (0–59) — required for daily/weekdays/weekly')
        .setMinValue(0).setMaxValue(59))

      // For weekly — which day
      .addIntegerOption(o => o
        .setName('day')
        .setDescription('Day of week for weekly: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat')
        .setMinValue(0).setMaxValue(6))

      // For interval — how many minutes between fires
      .addIntegerOption(o => o
        .setName('interval_minutes')
        .setDescription('Minutes between each fire — e.g. 120 for every 2 hours')
        .setMinValue(1).setMaxValue(1440))

      // Time window — applies to ALL frequency types
      .addIntegerOption(o => o
        .setName('window_start')
        .setDescription('Earliest hour to fire (0–23) — e.g. 8 means not before 8am')
        .setMinValue(0).setMaxValue(23))
      .addIntegerOption(o => o
        .setName('window_end')
        .setDescription('Latest hour to fire (0–23) — e.g. 22 means not after 10pm')
        .setMinValue(0).setMaxValue(23)))

    // ── /recurring list ───────────────────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('View your active recurring reminders'))

    // ── /recurring delete ─────────────────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Remove a recurring reminder')
      .addIntegerOption(o => o
        .setName('id')
        .setDescription('ID shown in /recurring list')
        .setRequired(true))),

  async execute(interaction) {
    const sub    = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // ── add ───────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const message     = interaction.options.getString('message');
      const frequency   = interaction.options.getString('frequency');
      const hour        = interaction.options.getInteger('hour');
      const minute      = interaction.options.getInteger('minute') ?? 0;
      const day         = interaction.options.getInteger('day');
      const intervalMin = interaction.options.getInteger('interval_minutes');
      const windowStart = interaction.options.getInteger('window_start');
      const windowEnd   = interaction.options.getInteger('window_end');

      // ── Validation ────────────────────────────────────────────────────

      if (frequency === 'interval') {
        if (!intervalMin) {
          return interaction.reply({
            content: '❌ Interval frequency requires `interval_minutes` to be set.\nExample: `interval_minutes:120` for every 2 hours.',
            ephemeral: true,
          });
        }
      } else {
        // daily / weekdays / weekly all need an hour
        if (hour === null || hour === undefined) {
          return interaction.reply({
            content: `❌ \`${frequency}\` frequency requires an \`hour\` (0–23).`,
            ephemeral: true,
          });
        }
        if (frequency === 'weekly' && (day === null || day === undefined)) {
          return interaction.reply({
            content: '❌ Weekly frequency requires a `day` (0=Sun, 1=Mon … 6=Sat).',
            ephemeral: true,
          });
        }
      }

      if (windowStart !== null && windowEnd !== null && windowStart >= windowEnd) {
        return interaction.reply({
          content: '❌ `window_start` must be earlier than `window_end`.\nExample: `window_start:8 window_end:22` for 8am–10pm.',
          ephemeral: true,
        });
      }

      // ── Save ──────────────────────────────────────────────────────────

      const result = db.addRecurring({
        userId,
        message,
        frequency,
        timeHour:    frequency !== 'interval' ? hour   : null,
        timeMinute:  frequency !== 'interval' ? minute : null,
        dayOfWeek:   day         ?? null,
        intervalMin: intervalMin ?? null,
        windowStart: windowStart ?? null,
        windowEnd:   windowEnd   ?? null,
      });

      // Build a readable confirmation
      const saved = db.getAllActiveRecurring().find(r => r.id === result.lastInsertRowid);
      const description = describeRecurring(saved);

      await interaction.reply({
        content: `✅ Recurring reminder set!\n> 🔁 **${message}**\n> 🕐 ${description}  \`id:${result.lastInsertRowid}\``,
        ephemeral: true,
      });

    // ── list ──────────────────────────────────────────────────────────────
    } else if (sub === 'list') {
      const recurring = db.getRecurring(userId);

      if (recurring.length === 0) {
        return interaction.reply({
          content: '🔁 No recurring reminders set.\nUse `/recurring add` to create one.',
          ephemeral: true,
        });
      }

      let msg = `🔁 **Recurring Reminders (${recurring.length})**\n\n`;
      for (const r of recurring) {
        msg += `> **${r.message}**\n`;
        msg += `> 🕐 ${describeRecurring(r)}  \`id:${r.id}\`\n\n`;
      }

      await interaction.reply({ content: msg, ephemeral: true });

    // ── delete ────────────────────────────────────────────────────────────
    } else if (sub === 'delete') {
      const id     = interaction.options.getInteger('id');
      const result = db.deleteRecurring(id, userId);

      if (result.changes === 0) {
        return interaction.reply({
          content: `❌ No recurring reminder found with id \`${id}\`.`,
          ephemeral: true,
        });
      }
      await interaction.reply({
        content: `🗑️ Recurring reminder \`${id}\` removed.`,
        ephemeral: true,
      });
    }
  },
};