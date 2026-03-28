// deploy-commands.js
// Run this script once whenever you ADD or CHANGE a slash command.
// Discord needs to be told about your commands before they appear in chat.
// Think of it as "registering function signatures" with Discord's servers.
//
// Usage: node deploy-commands.js

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'bot', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`📦 Queued: /${command.data.name}`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n🚀 Registering ${commands.length} slash command(s) with Discord...`);

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log('✅ All commands registered successfully!');
    console.log('💡 They may take up to 1 hour to appear globally,');
    console.log('   but usually show up within a few seconds.\n');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();