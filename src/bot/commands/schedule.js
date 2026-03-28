// src/bot/commands/schedule.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/database');
const { formatDateTime } = require('../../scheduler/engine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('View all your upcoming reminders')
    .addIntegerOption(o => o
      .setName('days')
      .setDescription('How many days ahead to show (default: 7)')
      .setMinValue(1)
      .setMaxValue(30)),

  async execute(interaction) {
    const userId = interaction.user.id;
    const days = interaction.options.getInteger('days') ?? 7;

    const reminders = db.getUpcomingReminders(userId);

    // Filter to the requested window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const filtered = reminders.filter(r => new Date(r.fire_at) <= cutoff);

    if (filtered.length === 0) {
      return interaction.reply({
        content: `📅 No reminders in the next ${days} day(s).\nUse \`/remind\` to set one.`,
        ephemeral: true,
      });
    }

    let msg = `📅 **Upcoming Reminders — next ${days} day(s)**\n\n`;
    filtered.forEach(r => {
      msg += `> ⏰ **${formatDateTime(r.fire_at)}**\n> ${r.message}  \`id:${r.id}\`\n\n`;
    });
    msg += `> Use \`/remind\` to add more, or \`/cancel\` to remove one.`;

    await interaction.reply({ content: msg, ephemeral: true });
  },
};