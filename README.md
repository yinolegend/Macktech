## Mack — Self-hosted Chat & Ticket System (Overview)

**🚀 New to this project? Check out the [Quick Start Guide](QUICKSTART.md) for the fastest way to get started!**

This repository contains a minimal, self-hostable web application that provides:

- A realtime chat powered by Socket.IO (no persistence in this minimal version)
- A simple ticket system persisted to SQLite (`data/app.db`)
- A small static frontend (no build step) located at `backend/public/`

The project is intentionally lightweight so you can self-host it on a small VPS, a Docker host, or run locally for testing.

## Running from GitHub

### Option 1: GitHub Codespaces (Easiest - Run in Browser)

The fastest way to run this application from GitHub is using Codespaces:

1. Click the **Code** button on the GitHub repository
2. Select the **Codespaces** tab
3. Click **Create codespace on main** (or your branch)
4. Wait for the environment to build (1-2 minutes)
5. Once ready, the app will automatically start and you'll see a notification to open it in your browser
6. Click the notification or go to the **Ports** tab and open port 3000

GitHub Codespaces gives you a full development environment in your browser with the app running automatically.

### Option 2: One-Command Setup Script

Clone the repository and run the setup script:

```bash
git clone https://github.com/yinolegend/Macktech.git
cd Macktech
./setup.sh
```

The setup script will:
- Check for Node.js installation
- Install all dependencies
- Create necessary directories
- Start the server on http://localhost:3000

### Option 3: Manual Setup (Traditional)

Quick start (local development)

1. Clone the repository:

```bash
git clone https://github.com/yinolegend/Macktech.git
cd Macktech
```

2. Install dependencies and start the server:

```bash
cd backend
npm install
npm start
```

3. Open the app in your browser:

```
http://localhost:3000
```

### Option 4: Run with Docker (Recommended for Production)

```bash
docker compose up --build
```

The compose file mounts `./data` into the container so the SQLite DB (`app.db`) persists between restarts. Port `3000` is exposed on the host.

Project layout and responsibilities

- `backend/server.js` — Express server, static file serving, Socket.IO chat, and REST API for tickets. This file wires everything together and documents the available endpoints.
- `backend/db.js` — Lightweight SQLite helpers and the `tickets` schema. Contains functions used by the REST API to create/list/get/update tickets.
- `backend/public/` — Static frontend: `index.html` and `app.js`.
- `Dockerfile`, `docker-compose.yml` — Quick container setup for self-hosting.

API details

- GET `/api/tickets` — returns JSON list of tickets (newest first)
- GET `/api/tickets/:id` — returns JSON for a single ticket
- POST `/api/tickets` — create a ticket; JSON body: `{ title, description?, requester? }` (requires authentication)
- PUT `/api/tickets/:id` — update ticket fields; JSON body can include: `title`, `description`, `requester`, `status` (requires authentication)

Authentication

- This scaffold now includes basic JWT authentication endpoints:
	- POST `/api/register` — create a local user: `{ username, password, display_name? }`
	- POST `/api/login` — sign in and receive a JWT: `{ username, password }` -> `{ token, user }`
	- GET `/api/me` — returns current user based on Bearer token in `Authorization` header

The client stores the JWT in `localStorage` and sends it with API requests and Socket.IO connections. For intranet/AD integration you can either:
- Use an LDAP/AD verifier (e.g. `passport-ldapauth` or `ldapjs`) on the server and issue JWTs for AD-authenticated users, or
- Sync AD users into the local `users` table and authenticate them against AD when logging in.

Creating an admin user

You can create an initial admin user locally with the helper script:

```bash
cd backend
node create_admin.js admin password "Admin Name"
```

Replace `admin` and `password` with your chosen credentials. Then login at the app and the token will be stored in the browser.

Handbook PDFs

- Drop PDF files into `backend/public/handbook/` on the server (or mount a network share at that path). The app exposes these files at `/handbook/<filename>` and lists them in the Handbook section of the app.
 - Drop PDF files into `backend/public/PDF handbook/` on the server (or mount a network share at that path). The app exposes these files at `/pdf-handbook/<filename>` and lists them in the Handbook section of the app. Files opened from the app will render inside the app using an embedded PDF viewer.

Socket / Realtime events

- The server emits and listens for `chat message` events over Socket.IO.
- Client -> Server: `socket.emit('chat message', { text, user })`
- Server -> Clients: `io.emit('chat message', message)` where `message` includes `{ id, text, user, ts }`.

Database schema (tickets table)

Columns:
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `title` (TEXT, required)
- `description` (TEXT)
- `requester` (TEXT)
- `status` (TEXT, default: 'open')
- `created_at` (TEXT)
- `updated_at` (TEXT)

Security and deployment notes

- This scaffold is intentionally simple and does not include authentication, authorization, or input rate-limiting. For production usage, add authentication (OAuth, session-based, or JWT), CSRF protections if needed, and input validation.
- When exposing to the internet, run the app behind a reverse proxy (nginx, Traefik) and use TLS certificates (Let's Encrypt).
- Consider migrating chat message persistence to the DB if you need message history.

## Deployment Options

### Deploy to Cloud Platforms

This application can be deployed to various cloud platforms:

**Heroku:**
```bash
# Install Heroku CLI, then:
heroku create your-app-name
git push heroku main
```

**Railway:**
1. Connect your GitHub repository to Railway
2. Railway will auto-detect the Node.js app
3. Set environment variables if needed
4. Deploy automatically on push

**DigitalOcean App Platform:**
1. Connect your GitHub repository
2. Select the repository and branch
3. Configure build settings (auto-detected)
4. Deploy

**AWS/Azure/GCP:**
- Use Docker deployment with the included `Dockerfile`
- Deploy to container services (ECS, Azure Container Instances, Cloud Run)
- Or use VM instances with the manual setup steps

### Continuous Integration

This repository includes GitHub Actions workflows for CI/CD:
- **`.github/workflows/ci.yml`** - Runs tests on push/PR to validate the build
- Tests both Node.js direct and Docker deployments
- Ensures the application starts successfully

You can extend the CI workflow to include automatic deployment to your hosting platform.

Extending the project (suggested next steps)

- Add user authentication and role-based access for ticket management.
- Add ticket comments, attachments, and assignment to agents.
- Add server-side validation and sanitize all inputs.
- Replace the static UI with a SPA (React/Vue) for a better UX.

Support and troubleshooting

- Logs: run `npm start` and watch stdout for errors. In Docker, use `docker compose logs -f`.
- If the DB file is missing, the server will create `data/app.db` automatically.
- For GitHub Codespaces: If the app doesn't start automatically, run `cd backend && npm start` in the terminal.
- Port issues: Ensure port 3000 is not already in use. You can change it by setting the `PORT` environment variable.
