#!/bin/bash
# Codespaces startup script
# This script is automatically run when opening in GitHub Codespaces

echo "🚀 Starting Mack Chat & Ticket System..."
echo ""

cd backend

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Create data directory if needed
if [ ! -d "../data" ]; then
    mkdir -p ../data
fi

echo "✓ Ready to start!"
echo ""
echo "Starting server on http://localhost:3000"
echo "The browser will open automatically when ready."
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start
