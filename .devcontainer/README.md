# GitHub Codespaces Configuration

This directory contains the configuration for running the Mack Chat & Ticket System in GitHub Codespaces.

## What happens when you create a Codespace?

1. **Container Setup** (1-2 minutes)
   - A Node.js 20 development container is created
   - Docker-in-Docker is configured for container operations
   - VS Code extensions are installed (ESLint, Prettier)

2. **Dependency Installation**
   - `npm install` runs automatically in the `backend/` directory
   - All required packages are installed

3. **Server Startup**
   - The application server starts automatically
   - Port 3000 is forwarded to your browser
   - You'll see a notification to open the app

## Using Codespaces

Once your Codespace is ready:

- **Access the app:** Click the notification or go to the **Ports** tab and click the globe icon next to port 3000
- **View logs:** Check the terminal running the server
- **Stop the server:** Press `Ctrl+C` in the server terminal
- **Restart the server:** Run `./start-codespaces.sh` or `cd backend && npm start`

## Files in this directory

- **devcontainer.json** - Main configuration file
  - Defines the container image (Node.js 20)
  - Configures port forwarding (3000)
  - Sets up VS Code extensions
  - Runs setup scripts

## Manual Setup

If the server doesn't start automatically:

```bash
./start-codespaces.sh
```

Or manually:

```bash
cd backend
npm install
npm start
```

## Features Included

- ✅ Node.js 20 LTS
- ✅ Docker support
- ✅ Automatic dependency installation
- ✅ Port forwarding for web access
- ✅ VS Code extensions for development
- ✅ Automatic server startup

## Customization

You can modify `devcontainer.json` to:
- Change the Node.js version
- Add more VS Code extensions
- Install additional tools
- Change startup behavior

For more information, see the [Dev Containers documentation](https://containers.dev/).
