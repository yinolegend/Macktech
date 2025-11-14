# Quick Start Guide - Running Mack from GitHub

This guide provides the fastest ways to get the Mack Chat & Ticket System running from GitHub.

## 🚀 Fastest Method: GitHub Codespaces (No Installation Required!)

**Perfect for:** Quick testing, development, or demo without installing anything on your computer.

**Steps:**
1. Go to https://github.com/yinolegend/Macktech
2. Click the green **Code** button
3. Click the **Codespaces** tab
4. Click **Create codespace on main**
5. Wait ~2 minutes for setup
6. The app will auto-start! Look for the notification to open it in your browser
7. Access at `http://localhost:3000` in the Codespace browser

**What you get:**
- ✅ Full development environment in your browser
- ✅ No local installation needed
- ✅ Automatic setup and startup
- ✅ All dependencies pre-installed

---

## 💻 Local Development - Quick Setup

**Perfect for:** Running on your own machine for development or self-hosting.

### One-Line Install (Linux/Mac):

```bash
git clone https://github.com/yinolegend/Macktech.git && cd Macktech && ./setup.sh
```

### Step-by-Step:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yinolegend/Macktech.git
   cd Macktech
   ```

2. **Run the setup script:**
   ```bash
   ./setup.sh
   ```
   
   Or manually:
   ```bash
   cd backend
   npm install
   npm start
   ```

3. **Open in browser:**
   ```
   http://localhost:3000
   ```

**Requirements:**
- Node.js 18+ ([download here](https://nodejs.org/))
- Git

---

## 🐳 Docker Deployment

**Perfect for:** Production deployment or containerized environments.

### Quick Start:

```bash
git clone https://github.com/yinolegend/Macktech.git
cd Macktech
docker compose up --build
```

The app will be available at `http://localhost:3000`

### Just Docker (without Docker Compose):

```bash
docker build -t mack-app .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data mack-app
```

---

## 🔐 First-Time Setup - Create Admin User

After the app is running, create an admin user:

```bash
cd backend
node create_admin.js admin YourPassword123 "Admin Name"
```

Then login at the web interface with:
- Username: `admin`
- Password: `YourPassword123`

---

## 🌐 Deploying to the Cloud

### Heroku
```bash
heroku create your-app-name
git push heroku main
```

### Railway
1. Go to [Railway](https://railway.app/)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your Macktech repository
4. Railway auto-detects and deploys!

### DigitalOcean App Platform
1. Go to [DigitalOcean Apps](https://cloud.digitalocean.com/apps)
2. Create New App → GitHub
3. Select Macktech repository
4. Click Deploy

### Other Platforms
- **AWS/Azure/GCP:** Use the included Dockerfile
- **VPS/Bare Metal:** Use the setup.sh script or Docker
- **Kubernetes:** Build and deploy the Docker image

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────┐
│  Frontend (Static Files)                │
│  - HTML/CSS/JavaScript                  │
│  - Socket.IO Client                     │
│  Located in: backend/public/            │
└─────────────────┬───────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│  Backend (Node.js + Express)            │
│  - REST API (/api/*)                    │
│  - Socket.IO Server (Real-time chat)    │
│  - JWT Authentication                   │
│  - Static file serving                  │
│  Located in: backend/server.js          │
└─────────────────┬───────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│  Database (SQLite)                      │
│  - Tickets storage                      │
│  - User accounts                        │
│  Located in: data/app.db                │
└─────────────────────────────────────────┘
```

**Port:** 3000 (default)  
**Data Persistence:** SQLite database in `./data/app.db`  
**Chat:** Real-time via Socket.IO (not persisted by default)

---

## ❓ Troubleshooting

### "Port 3000 already in use"
```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=8080 npm start
```

### "Cannot find module" errors
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Database not created
```bash
mkdir -p data
cd backend
npm start  # Will auto-create data/app.db
```

### Codespaces not starting
1. Go to the **Ports** tab in VS Code
2. Manually forward port 3000
3. In terminal: `cd backend && npm start`

---

## 📚 Next Steps

Once you have the app running:

1. **Create an admin user** (see above)
2. **Explore the UI** at http://localhost:3000
3. **Read the full README** for API documentation
4. **Customize** the app for your needs
5. **Deploy** to your preferred platform

---

## 🆘 Need Help?

- 📖 [Full README](README.md) - Complete documentation
- 🐛 [Issues](https://github.com/yinolegend/Macktech/issues) - Report bugs
- 💬 [Discussions](https://github.com/yinolegend/Macktech/discussions) - Ask questions

---

**Made with ❤️ - Happy hosting!**
