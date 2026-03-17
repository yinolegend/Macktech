# Command Center Architecture

## Runtime

- Root startup: `node server.js`
- Local API base: `http://localhost:3000/api/`
- Static frontend served locally from `frontend/`
- Persistent data stored in `data/`

## Structure

- `frontend/pages` contains the HTML entry points served by Express.
- `frontend/scripts` contains browser-side JavaScript.
- `frontend/styles` contains shared CSS.
- `frontend/assets` contains local vendor assets and static frontend files.
- `frontend/icons` contains the local SVG icon library used by the map editor.
- `api/routes` defines HTTP route registration.
- `api/controllers` holds request handlers.
- `api/middleware` contains reusable API middleware factories.
- `backend/services` contains file, map, handbook, and announcement services.
- `backend/database` contains the database access entrypoint.
- `backend/auth` contains directory and socket auth helpers.
- `backend/utils` contains startup and bootstrap utilities.
- `data` stores SQLite and JSON/file uploads.
- `config` contains runtime configuration and resolved paths.
- `backups` is reserved for manual or scheduled backups.

## Offline Notes

- Frontend pages use only relative/local API calls.
- Icons and Fabric.js are served from local files.
- Handbook PDFs, map assets, and announcement uploads are served from local filesystem data folders.
- Remote font imports were removed from the active shared theme.
