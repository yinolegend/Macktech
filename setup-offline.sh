#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PUBLIC_DIR="$ROOT_DIR/backend/public"
JS_DIR="$PUBLIC_DIR/js"
CSS_DIR="$PUBLIC_DIR/css"
SDS_DIR="$PUBLIC_DIR/sds"
CERTS_DIR="$PUBLIC_DIR/certs"

echo "Preparing offline Command Center structure..."
mkdir -p "$ROOT_DIR/models"
mkdir -p "$ROOT_DIR/api/routes"
mkdir -p "$JS_DIR"
mkdir -p "$CSS_DIR"
mkdir -p "$SDS_DIR"
mkdir -p "$CERTS_DIR"

TABULATOR_JS_URL="https://cdn.jsdelivr.net/npm/tabulator-tables@5.6.1/dist/js/tabulator.min.js"
TABULATOR_CSS_URL="https://cdn.jsdelivr.net/npm/tabulator-tables@5.6.1/dist/css/tabulator.min.css"
XLSX_URL="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
JSPDF_URL="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
LUXON_URL="https://cdn.jsdelivr.net/npm/luxon@3.4.4/build/global/luxon.min.js"
LUCIDE_URL="https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"

echo "Pinned offline asset URLs:"
echo "  tabulator.min.js  -> $TABULATOR_JS_URL"
echo "  tabulator.min.css -> $TABULATOR_CSS_URL"
echo "  xlsx.full.min.js  -> $XLSX_URL"
echo "  jspdf.min.js      -> $JSPDF_URL"
echo "  luxon.min.js      -> $LUXON_URL"
echo "  lucide.min.js     -> $LUCIDE_URL"

if command -v curl >/dev/null 2>&1; then
  echo "Downloading local browser dependencies..."
  curl -L "$TABULATOR_JS_URL" -o "$JS_DIR/tabulator.min.js"
  curl -L "$TABULATOR_CSS_URL" -o "$CSS_DIR/tabulator.min.css"
  curl -L "$XLSX_URL" -o "$JS_DIR/xlsx.full.min.js"
  curl -L "$JSPDF_URL" -o "$JS_DIR/jspdf.min.js"
  curl -L "$LUXON_URL" -o "$JS_DIR/luxon.min.js"
  curl -L "$LUCIDE_URL" -o "$JS_DIR/lucide.min.js"
  echo "Offline browser dependencies downloaded into backend/public."
else
  echo "curl was not found. Create the folders above and download the pinned URLs manually."
fi