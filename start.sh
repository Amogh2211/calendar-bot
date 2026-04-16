#!/bin/bash
# start.sh — run this to start the bot locally
# Usage: ./start.sh

set -e  # stop if any command fails

echo "🤖 Starting calendar bot..."

# Install dependencies if node_modules is missing or package.json changed
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Create data folder if it doesn't exist (for local SQLite fallback)
mkdir -p data

echo "🚀 Launching bot (Ctrl+C to stop)"
npm run dev