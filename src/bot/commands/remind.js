// src/bot/commands/remind.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/database');
const { formatDateTime } = require('../../scheduler/engine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a one-time reminder')
    .addStringOption(o => o
      .setName('message')
      .setDescription('What to remind you about')
      .setRequired(true))
    .addStringOption(o => o
      .setName('time')
      .setDescription('When to remind you — e.g. "2024-12-25 09:00" or "tomorrow 14:30"')
      .setRequired(true)),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const timeStr = interaction.options.getString('time');

    // Parse the time string into a Date object
    const fireAt = parseTimeInput(timeStr);

    if (!fireAt || isNaN(fireAt.getTime())) {
      return interaction.reply({
        content: `❌ Couldn't parse that time. Try formats like:\n> \`2025-06-15 09:00\`\n> \`tomorrow 14:30\`\n> \`today 18:00\``,
        ephemeral: true,
      });
    }

    if (fireAt <= new Date()) {
      return interaction.reply({
        content: `❌ That time is in the past. Please pick a future time.`,
        ephemeral: true,
      });
    }

    db.addReminder(interaction.user.id, message, fireAt);

    await interaction.reply({
      content: `✅ Reminder set!\n> ⏰ **${message}**\n> 📅 ${formatDateTime(fireAt)}`,
      ephemeral: true,
    });
  },
};

// Flexible time parser — handles "today 14:00", "tomorrow 9:30", and "YYYY-MM-DD HH:MM"
function parseTimeInput(input) {
  const now = new Date();
  const lower = input.trim().toLowerCase();

  // "today HH:MM" or "tomorrow HH:MM"
  const relativeMatch = lower.match(/^(today|tomorrow)\s+(\d{1,2}):(\d{2})$/);
  if (relativeMatch) {
    const base = new Date(now);
    if (relativeMatch[1] === 'tomorrow') base.setDate(base.getDate() + 1);
    base.setHours(parseInt(relativeMatch[2]), parseInt(relativeMatch[3]), 0, 0);
    return base;
  }

  // "YYYY-MM-DD HH:MM"
  const absoluteMatch = input.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (absoluteMatch) {
    return new Date(`${absoluteMatch[1]}T${absoluteMatch[2].padStart(2, '0')}:${absoluteMatch[3]}:00`);
  }

  // "in X minutes/hours"
  const inMatch = lower.match(/^in\s+(\d+)\s+(minute|minutes|hour|hours)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].startsWith('hour') ? 'hour' : 'minute';
    const result = new Date(now);
    if (unit === 'hour') result.setHours(result.getHours() + amount);
    else result.setMinutes(result.getMinutes() + amount);
    return result;
  }

  return null;
}