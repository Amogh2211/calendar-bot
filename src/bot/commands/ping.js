// src/bot/commands/ping.js
// Each command file exports two things:
//   - data:    the command's name, description, and options (its "signature")
//   - execute: the async function that runs when the command is called
//
// This pattern is like a pure virtual interface in C++ — every command file
// must implement the same shape, and index.js calls them polymorphically.

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  // Define the command's metadata — this is what Discord registers
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is alive and see its response time'),

  // Execute is called by the central dispatcher in index.js
  async execute(interaction) {
    // interaction.createdTimestamp is when Discord received the command.
    // We reply first, then edit the reply with the actual measured latency —
    // because we can't know the round-trip time until after the reply is sent.
    const sent = await interaction.reply({
      content: '🏓 Pinging...',
      fetchReply: true,  // returns the message object so we can measure timing
    });

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    await interaction.editReply(
      `🏓 Pong!\n` +
      `> Round-trip latency: **${latency}ms**\n` +
      `> Discord API heartbeat: **${apiLatency}ms**`
    );
  },
};