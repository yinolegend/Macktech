## Mack — Self-hosted Chat & Ticket System (Overview)

This repository contains a minimal, self-hostable web application that provides:

- A realtime chat powered by Socket.IO (no persistence in this minimal version)
- A simple ticket system persisted to SQLite (`data/app.db`)
- A small static frontend (no build step) located at `backend/public/`

The project is intentionally lightweight so you can self-host it on a small VPS, a Docker host, or run locally for testing.

Quick start (local development)

1. Install dependencies and start the server:

```bash
cd "Mack Project"/backend
npm install
npm start
```

2. Open the app in your browser:

```
http://localhost:3000
```

Run with Docker (recommended for simple self-hosting)

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
cd "Mack Project"/backend
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

Extending the project (suggested next steps)

- Add user authentication and role-based access for ticket management.
- Add ticket comments, attachments, and assignment to agents.
- Add server-side validation and sanitize all inputs.
- Replace the static UI with a SPA (React/Vue) for a better UX.

Support and troubleshooting

- Logs: run `npm start` and watch stdout for errors. In Docker, use `docker compose logs -f`.
- If the DB file is missing, the server will create `data/app.db` automatically.

If you want, I can now:
- Run a local smoke test (install dependencies and start the server here).
- Convert the frontend to a React + Vite app and add basic auth.
- Add server-side persistence for chat messages.

## Deploying from GitHub (Render)

This repo includes a `render.yaml` blueprint so you can launch the site directly from GitHub without tunnels. Steps:

1. Push your latest changes to GitHub (already done if you're reading this there).
2. In Render, click **New** → **Blueprint** and connect the `yinolegend/Macktech` repository.
3. Accept the defaults from `render.yaml`:
	- Web service rooted at `backend/`
	- `npm install` build command
	- `npm start` start command
	- 1 GB persistent disk mounted at `/app/data` for SQLite persistence
4. Click **Apply** and wait for the build to finish. Render will output a public URL you can share for testing.
5. Future `git push` events to `main` will trigger automatic redeploys (you can toggle auto-deploy in Render if needed).

Need environment secrets (e.g., `JWT_SECRET`)? Add them in Render → **Environment** before deploying.
