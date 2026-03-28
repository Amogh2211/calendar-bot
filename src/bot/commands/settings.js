// src/bot/commands/settings.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure your bot preferences')
    .addSubcommand(sub => sub
      .setName('briefing')
      .setDescription('Set when your morning briefing arrives')
      .addIntegerOption(o => o
        .setName('hour')
        .setDescription('Hour (0–23, 24-hour format) — e.g. 8 for 8am')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(23))
      .addIntegerOption(o => o
        .setName('minute')
        .setDescription('Minute (0–59)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(59)))
    .addSubcommand(sub => sub
      .setName('toggle-briefing')
      .setDescription('Turn the morning briefing on or off')
      .addBooleanOption(o => o
        .setName('enabled')
        .setDescription('On or off')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('See your current settings')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'briefing') {
      const hour = interaction.options.getInteger('hour');
      const minute = interaction.options.getInteger('minute');
      db.updateSettings(userId, { briefing_hour: hour, briefing_minute: minute });

      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      await interaction.reply({
        content: `✅ Morning briefing set to **${timeStr}** daily.`,
        ephemeral: true,
      });

    } else if (sub === 'toggle-briefing') {
      const enabled = interaction.options.getBoolean('enabled');
      db.updateSettings(userId, { briefing_enabled: enabled ? 1 : 0 });
      await interaction.reply({
        content: `✅ Morning briefing **${enabled ? 'enabled' : 'disabled'}**.`,
        ephemeral: true,
      });

    } else if (sub === 'view') {
      const s = db.getSettings(userId);
      const timeStr = `${String(s.briefing_hour).padStart(2, '0')}:${String(s.briefing_minute).padStart(2, '0')}`;
      await interaction.reply({
        content: `⚙️ **Your Settings**\n> ☀️ Morning briefing: **${timeStr}** — ${s.briefing_enabled ? '✅ enabled' : '❌ disabled'}`,
        ephemeral: true,
      });
    }
  },
};