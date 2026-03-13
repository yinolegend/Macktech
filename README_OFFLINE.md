# Offline Asset Checklist

The Hazardous Material Tracking Portal is built to run fully offline at runtime. The browser-side vendor libraries must exist locally before opening `/portals/hazmat`.

Place these files in the workspace exactly as listed:

1. `backend/public/js/tabulator.min.js`
   Tabulator.js v5.x browser bundle.

2. `backend/public/css/tabulator_midnight.min.css`
   Tabulator.js v5.x stylesheet. The portal references the dark midnight theme, but another v5.x Tabulator CSS build can be substituted if you update the link in `backend/public/hazmat-portal.html`.

3. `backend/public/js/xlsx.full.min.js`
   SheetJS browser bundle used for Excel import and branded export.

4. `backend/public/js/luxon.min.js`
   Luxon browser bundle used by the expiration engine and timestamp formatting.

Server-side dependency:

1. `sequelize`
   Installed in `backend/package.json` and used with the local SQLite files at `data/hazmat.db` and `data/gages.db`.

Static paths exposed by the server:

1. `/public/js/*`
   Served from `backend/public/js`.

2. `/public/css/*`
   Served from `backend/public/css`.

Portal entry and role gate:

1. `/portals/hazmat`
   Protected route for users whose `role` is `Warehouse_Admin`.

Local role-management examples from `backend/`:

1. `npm.cmd run user:add -- hazmat_admin StrongPass123 "HAZMAT Admin" Warehouse_Admin`

2. `npm.cmd run user:role -- hazmat_admin Warehouse_Admin`

No CDN assets are referenced anywhere in the HAZMAT portal implementation.