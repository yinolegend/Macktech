#!/bin/bash

# Quick setup script for Mack Chat & Ticket System
# This script sets up and runs the application locally

set -e

echo "========================================="
echo "Mack Chat & Ticket System - Quick Setup"
echo "========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo "✓ NPM version: $(npm --version)"
echo ""

# Navigate to backend directory
cd "$(dirname "$0")/backend"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✓ Dependencies installed successfully!"
echo ""

# Create data directory if it doesn't exist
if [ ! -d "../data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p ../data
fi

echo "========================================="
echo "🚀 Starting the Mack application..."
echo "========================================="
echo ""
echo "The application will be available at:"
echo "👉 http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start
