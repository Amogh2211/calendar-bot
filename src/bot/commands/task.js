// src/bot/commands/task.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Manage your task list')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a task to your list')
      .addStringOption(o => o
        .setName('title')
        .setDescription('What needs to be done')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('View your current tasks'))
    .addSubcommand(sub => sub
      .setName('done')
      .setDescription('Mark a task as complete')
      .addIntegerOption(o => o
        .setName('id')
        .setDescription('Task ID (shown in /task list)')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete a task permanently')
      .addIntegerOption(o => o
        .setName('id')
        .setDescription('Task ID')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Remove all completed tasks')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
      const title = interaction.options.getString('title');
      const result = db.addTask(userId, title);
      await interaction.reply({
        content: `✅ Task added: **${title}** \`id:${result.lastInsertRowid}\``,
        ephemeral: true,
      });

    } else if (sub === 'list') {
      const tasks = db.getTasks(userId, true); // include completed

      if (tasks.length === 0) {
        return interaction.reply({
          content: `📋 Your task list is empty.\nUse \`/task add\` to add something.`,
          ephemeral: true,
        });
      }

      const pending = tasks.filter(t => !t.done);
      const done = tasks.filter(t => t.done);

      let msg = `📋 **Your Tasks**\n\n`;

      if (pending.length > 0) {
        msg += `**Pending (${pending.length})**\n`;
        pending.forEach(t => {
          msg += `> ⬜ ${t.title}  \`id:${t.id}\`\n`;
        });
      }

      if (done.length > 0) {
        msg += `\n**Completed (${done.length})**\n`;
        done.forEach(t => {
          msg += `> ✅ ~~${t.title}~~  \`id:${t.id}\`\n`;
        });
        msg += `\n> Use \`/task clear\` to remove completed tasks`;
      }

      await interaction.reply({ content: msg, ephemeral: true });

    } else if (sub === 'done') {
      const id = interaction.options.getInteger('id');
      const result = db.completeTask(id, userId);

      if (result.changes === 0) {
        return interaction.reply({
          content: `❌ No task found with id \`${id}\`. Use \`/task list\` to see your tasks.`,
          ephemeral: true,
        });
      }
      await interaction.reply({ content: `✅ Task \`${id}\` marked as done!`, ephemeral: true });

    } else if (sub === 'delete') {
      const id = interaction.options.getInteger('id');
      const result = db.deleteTask(id, userId);

      if (result.changes === 0) {
        return interaction.reply({
          content: `❌ No task found with id \`${id}\`.`,
          ephemeral: true,
        });
      }
      await interaction.reply({ content: `🗑️ Task \`${id}\` deleted.`, ephemeral: true });

    } else if (sub === 'clear') {
      const result = db.clearCompletedTasks(userId);
      await interaction.reply({
        content: `🧹 Cleared ${result.changes} completed task(s).`,
        ephemeral: true,
      });
    }
  },
};