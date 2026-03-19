# Offline CAS Database Expansion

## Current behavior
- Base snapshot file: `data/cas_index_ncbi.json`
- Master snapshot file (optional): `data/cas_index_master.json`
- Optional extension file: `data/cas_index_extended.json`
- Runtime CAS service loads snapshots in this order and merges them:
	1. `cas_index_ncbi.json`
	2. `cas_index_master.json`
	3. `cas_index_extended.json`
- If a CAS lookup misses locally, the service retries from disk once, then attempts a PubChem live lookup.
- Successful live lookups are cached into `data/cas_index_extended.json` so future lookups work offline.
- Normalized CAS records now include:
	- `primary_class`
	- `division`
	- `hazard_dna`
	- `ghs_auto_symbols`
	- `hazard_status`

## Remote fallback controls
Environment variables:

- `CAS_MASTER_LOOKUP` (default: `true`)
	- Set to `false` to skip loading `data/cas_index_master.json`.
- `CAS_REMOTE_LOOKUP` (default: `true`)
	- Set to `false` to disable live PubChem fallback.
- `CAS_REMOTE_TIMEOUT_MS` (default: `8000`)
	- Request timeout for live CAS lookup.

## Build a master offline pack
Build a hazard-qualified master snapshot from one or more public-source JSON/JSONL feeds:

```bash
node backend/scripts/build_cas_master_pack.js --input path/to/feed-1.json,path/to/feed-2.jsonl
```

Optional arguments:

- `--output <path>`: override output path (default: `data/cas_index_master.json`)
- `--limit <number>`: balanced record cap after dedupe/scoring (default: `25000`, `0` = unlimited)
- `--include-nonhazardous true|false`: include explicit non-hazardous records (default: `false`)
- `--name`, `--source`, `--provider`, `--version`, `--notes`: dataset metadata overrides

NPM shortcuts from the backend workspace:

```bash
npm --prefix backend run cas:master:build -- --input path/to/feed.json
npm --prefix backend run cas:master:build:unlimited -- --input path/to/feed.json
```

## Add records to extension cache
You can merge a feed into the extension layer:

```bash
node backend/scripts/merge_cas_extension.js path/to/your-cas-feed.json
```

Optional output path:

```bash
node backend/scripts/merge_cas_extension.js path/to/your-cas-feed.json path/to/output.json
```

Accepted input shapes:
- Array of records: `[ { cas_number, name, ghs_auto_symbols, risk, flags }, ... ]`
- Snapshot object: `{ dataset: {...}, records: [...] }`

## Recommended full offline strategy
For broad offline CAS coverage with class/division/hazard DNA support, use all three layers:

1. Curated base snapshot (`cas_index_ncbi.json`)
2. Bulk-built master snapshot (`cas_index_master.json`)
3. Live write-through extension cache (`cas_index_extended.json`)

Then choose runtime mode:

- Strict offline mode:
	- `CAS_REMOTE_LOOKUP=false`
- Hybrid seed mode:
	- `CAS_REMOTE_LOOKUP=true` to keep filling gaps from live lookups

Notes:
- Shipping every CAS directly in git is impractical because full datasets are very large.
- `data/` is typically git-ignored, so master/extension snapshots are intended to be managed locally.

## Current Master Snapshot: Defense & Electronics Manufacturing Chemicals

As of 2026-03-19, the master snapshot contains **74 hazard-qualified chemicals** focused on defense electronics (Leonardo DRS, L3Harris) and PCB manufacturing (Samsung-style applications).

### Dataset Details
- **Source**: Curated from IPC standards, MIL-SPECs, and open-source MSDS databases
- **Provider**: Leonardo DRS / L3Harris / PCB Industry
- **Total Records**: 74 (out of 75 input; 1 non-hazardous filtered)
- **File Size**: ~44 KB

### Record Segmentation by Primary Class
| Class | Name | Records | Examples |
|-------|------|---------|----------|
| 1 | Explosives | 1 | Methylhydrazine |
| 2 | Flammable Liquids/Gases | 25 | IPA, Acetone, Toluene, Ethanol, Methanol |
| 3 | Oxidizing Substances | 3 | Potassium Dichromate, Sodium Dichromate, Zinc |
| 4 | Gas Cylinders | 1 | Ammonia |
| 5 | Corrosive | 14 | Hydrochloric Acid, Sulfuric Acid, Nitric Acid, Sodium Hydroxide, Potassium Hydroxide |
| 6 | Toxic/Poisonous | 27 | Tin, Lead, Hydrazine, Formaldehyde, Cadmium Sulfate, Nickel, Chromium |
| 8 | Miscellaneous/Other | 1 | Citric Acid |
| 9 | Environmental Hazard | 2 | Copper, Mercury Chloride |
| **Total** | | **74** | |

### All Three Layers Runtime Totals
- Base (NCBI): 30 records
- Master (Defense/Electronics): 74 records
- Extended (Write-through cache): 13 records
- **Total after dedup**: 97 records

### Tested & Working Material Types
- **PCB Assembly Materials**: Solder (Tin, Lead), Flux (Rosin, Methyl Salicylate)
- **Cleaning Agents**: Isopropyl Alcohol, Acetone, Ethanol, Hydrochloric Acid, Citric Acid
- **Etching/Plating Chemicals**: Nitric Acid, Sulfuric Acid, Formic Acid
- **Solvents**: Toluene, Ethylbenzene, Xylene isomers, Methanol, N-Butanol
- **Epoxy/Polyurethane Components**: MDI, TDI, Hexamethylenetetramine
- **Specialty Materials**: Ceramic coating agents, conformal coating precursors, potting compounds

### Verification Status
✅ All 74 master records successfully load on runtime startup
✅ Offline lookups work without remote fallback (CAS_REMOTE_LOOKUP=false)
✅ Each record includes primary_class, division, hazard_dna, risk, flags
✅ Previously missing chemical (77-92-9 Citric Acid) now recognized and classified directly
