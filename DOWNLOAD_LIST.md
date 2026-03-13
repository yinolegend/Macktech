# Download List

No CDN assets are allowed for Command Center. Place each browser dependency in the local path shown below.

## Offline Browser Assets

| File | Local path | Purpose | Current repo status |
| --- | --- | --- | --- |
| `tabulator.min.js` | `backend/public/js/tabulator.min.js` | Interactive grid engine for inventory, templates, and calibration tables | Present |
| `tabulator.min.css` | `backend/public/css/tabulator.min.css` | Local table styling for Tabulator | Present |
| `xlsx.full.min.js` | `backend/public/js/xlsx.full.min.js` | Excel import/export with SheetJS | Present |
| `jspdf.min.js` | `backend/public/js/jspdf.min.js` | Local PDF generation engine | Present |
| `jspdf.plugin.autotable.js` | `backend/public/js/jspdf.plugin.autotable.js` | Professional certificate tables for jsPDF | Present |
| `luxon.min.js` | `backend/public/js/luxon.min.js` | Date math for calibration windows and timestamps | Present |
| `lucide.min.js` | `backend/public/js/lucide.min.js` | Local SVG icon set | Present |

## Served Runtime Paths

- `/public/js/tabulator.min.js`
- `/public/css/tabulator.min.css`
- `/public/js/xlsx.full.min.js`
- `/public/js/jspdf.min.js`
- `/public/js/jspdf.plugin.autotable.js`
- `/public/js/luxon.min.js`
- `/public/js/lucide.min.js`

## Smart Calibration Template Engine

### SQLite / Sequelize Tables

`templates`

- `id`
- `template_name`
- `category` (`Mechanical`, `Electrical`, `Pressure`)
- `cal_interval_days`
- `alert_lead_days`
- `grace_period_days`
- `unit_of_measure`
- `assigned_department`

`calibration` (assets)

- `id`
- `template_id`
- `tool_name`
- `serial_number`
- `last_cal`
- `next_cal`
- `status` (`SAFE`, `WARNING`, `EXPIRED`, `LOCKED`)
- inherited template rule fields persisted onto each asset for runtime safety:
  - `category`
  - `cal_frequency`
  - `alert_lead_days`
  - `grace_period_days`
  - `unit_of_measure`
  - `assigned_department`

### Traffic-Light Logic

- `SAFE` / Green: `current_date < (next_cal_date - alert_lead_days)`
- `WARNING` / Yellow: `current_date` is inside the alert lead window and not yet past `next_cal_date`
- `EXPIRED` / Orange: `current_date > next_cal_date` but still inside `grace_period_days`
- `LOCKED` / Red: `current_date > (next_cal_date + grace_period_days)`

### Portal Behavior

- Check-out stays enabled during `SAFE`, `WARNING`, and `EXPIRED`.
- Check-out is disabled only when an asset reaches `LOCKED`.
- Template updates propagate inherited rule fields to assigned assets.
- Legacy calibration rows are backfilled into templates automatically on startup.

### Local API Touchpoints

- `GET /api/command-center/calibration/templates`
- `POST /api/command-center/calibration/templates`
- `PUT /api/command-center/calibration/templates/:id`
- `DELETE /api/command-center/calibration/templates/:id`
- `GET /api/command-center/calibration`
- `POST /api/command-center/calibration`
- `PUT /api/command-center/calibration/:id`
- `POST /api/command-center/calibration/:id/check-out`
- `POST /api/command-center/calibration/:id/certificate`