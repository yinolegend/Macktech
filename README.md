## Command Center Offline Portal

Command Center is a self-hosted portal that runs fully offline on a local Express API. The system serves a local HTML frontend, stores its operational data on disk, and keeps its client-side libraries and icon assets in the repository.

### Quick start

1. Install backend dependencies once.

```bash
npm install --prefix backend
```

Windows PowerShell note: if `npm` is blocked by execution policy, use `npm.cmd install --prefix backend` instead.

2. Start the full system from the project root.

```bash
node server.js
```

3. Open the local portal.

```text
http://127.0.0.1:3000
```

### Project structure

- `frontend/pages` contains the HTML entry points.
- `frontend/components` is reserved for shared frontend fragments.
- `frontend/scripts` contains browser-side JavaScript.
- `frontend/styles` contains shared CSS.
- `frontend/assets` contains local vendor files and static frontend assets.
- `frontend/assets/icons` contains the local SVG icon library.
- `api/routes` registers HTTP endpoints.
- `api/controllers` contains route handlers.
- `api/middleware` contains reusable API middleware factories.
- `backend/services` contains business logic for maps, handbook files, announcements, and uploads.
- `backend/database` exposes the SQLite access layer.
- `backend/auth` contains directory and socket authentication helpers.
- `backend/utils` contains startup and bootstrap utilities.
- `data` stores SQLite, JSON state, uploaded handbook PDFs, announcement files, and map assets.
- `config` contains resolved paths and runtime configuration.
- `backups` is reserved for local backup snapshots.
- `docs` contains architecture notes.

### Offline behavior

- Frontend pages call only the local API under `/api/`.
- Fabric.js is served locally from `frontend/assets/vendor`.
- SVG icons are served locally from `frontend/assets/icons`.
- Handbook PDFs, announcement uploads, and map assets are served from the local filesystem under `data/uploads/`.
- The active shared theme no longer depends on Google Fonts or any CDN-hosted resource.

### Local data

The application persists data in these locations:

- `data/app.db` for tickets and users.
- `data/hazmat.db` for hazardous material inventory and usage history.
- `data/gages.db` for gage/calibration assets and gage-side audit logs.
- `data/facility_maps.json` and `data/facility_map.json` for facility maps.
- `data/announcements.json` for announcements.
- `data/uploads/handbook` for local handbook PDFs.
- `data/uploads/announcements` for uploaded announcement media.
- `data/uploads/maps` for uploaded map backgrounds.
- `data/uploads/calibration` for calibration attachments.
- `data/uploads/sds` for local SDS files.
- `data/uploads/certs` for local certificate assets.

### Core API surface

- `POST /api/register`, `POST /api/login`, `GET /api/me`
- `GET /api/tickets`, `POST /api/tickets`, `PUT /api/tickets/:id`
- `GET /api/handbook`, `POST /api/handbook`, `PATCH /api/handbook/:filename`
- `GET /api/maps`, `GET /api/map`, `PUT /api/map`
- `GET /api/maps/:mapId/export.svg`, `GET /api/maps/:mapId/export.pdf`
- `POST /api/announcements`, `GET /api/announcements`, `PATCH /api/announcements/:id`

### Admin utilities

Create an admin user manually if needed:

```bash
node backend/create_admin.js admin password "Admin Name"
```

Manage users from the terminal:

```bash
npm --prefix backend run user:list
npm --prefix backend run user:add -- <username> <password> [display_name]
npm --prefix backend run user:passwd -- <username> <new_password>
```

### Docker

Run the offline stack with Docker:

```bash
docker compose up --build
```

The container exposes port `3000` and persists operational data through the `data/` volume.

### Deployment note

The repository still includes `render.yaml`, but the application is now documented and wired primarily for local or private-network execution with a root startup command of `node server.js`.
