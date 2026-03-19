#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ASSETS_DIR="$ROOT_DIR/frontend/assets"
VENDOR_DIR="$ASSETS_DIR/vendor"
ICONS_DIR="$ASSETS_DIR/icons"
UPLOADS_DIR="$ROOT_DIR/data/uploads"
UPLOADS_ANNOUNCEMENTS_DIR="$UPLOADS_DIR/announcements"
UPLOADS_MAPS_DIR="$UPLOADS_DIR/maps"
UPLOADS_HANDBOOK_DIR="$UPLOADS_DIR/handbook"
UPLOADS_CALIBRATION_DIR="$UPLOADS_DIR/calibration"
UPLOADS_SDS_DIR="$UPLOADS_DIR/sds"
UPLOADS_CERTS_DIR="$UPLOADS_DIR/certs"

LEGACY_PUBLIC_DIR="$ROOT_DIR/backend/public"
LEGACY_JS_DIR="$LEGACY_PUBLIC_DIR/js"
LEGACY_CSS_DIR="$LEGACY_PUBLIC_DIR/css"
LEGACY_ICONS_DIR="$LEGACY_PUBLIC_DIR/icons"
LEGACY_FRONTEND_ICONS_DIR="$ROOT_DIR/frontend/icons"

echo "Preparing offline Command Center structure..."
mkdir -p "$ROOT_DIR/models"
mkdir -p "$ROOT_DIR/api/routes"
mkdir -p "$VENDOR_DIR"
mkdir -p "$ICONS_DIR"
mkdir -p "$UPLOADS_ANNOUNCEMENTS_DIR"
mkdir -p "$UPLOADS_MAPS_DIR"
mkdir -p "$UPLOADS_HANDBOOK_DIR"
mkdir -p "$UPLOADS_CALIBRATION_DIR"
mkdir -p "$UPLOADS_SDS_DIR"
mkdir -p "$UPLOADS_CERTS_DIR"

copy_if_missing() {
  src="$1"
  dst="$2"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    echo "Copied: $src -> $dst"
  fi
}

copy_dir_if_missing() {
  src_dir="$1"
  dst_dir="$2"
  if [ ! -d "$src_dir" ]; then
    return 0
  fi

  find "$src_dir" -type f | while IFS= read -r src_file; do
    rel_path="${src_file#"$src_dir"/}"
    dst_file="$dst_dir/$rel_path"
    dst_parent="$(dirname "$dst_file")"
    mkdir -p "$dst_parent"
    copy_if_missing "$src_file" "$dst_file"
  done
}

echo "Seeding canonical local vendor assets from existing local copies (no network)..."
copy_if_missing "$LEGACY_JS_DIR/fabric.min.js" "$VENDOR_DIR/fabric.min.js"
copy_if_missing "$LEGACY_JS_DIR/tabulator.min.js" "$VENDOR_DIR/tabulator.min.js"
copy_if_missing "$LEGACY_JS_DIR/xlsx.full.min.js" "$VENDOR_DIR/xlsx.full.min.js"
copy_if_missing "$LEGACY_JS_DIR/luxon.min.js" "$VENDOR_DIR/luxon.min.js"
copy_if_missing "$LEGACY_JS_DIR/jspdf.min.js" "$VENDOR_DIR/jspdf.min.js"
copy_if_missing "$LEGACY_JS_DIR/lucide.min.js" "$VENDOR_DIR/lucide.min.js"
copy_if_missing "$LEGACY_JS_DIR/chart.umd.js" "$VENDOR_DIR/chart.umd.js"
copy_if_missing "$LEGACY_CSS_DIR/tabulator.min.css" "$VENDOR_DIR/tabulator.min.css"
copy_if_missing "$LEGACY_CSS_DIR/tabulator_midnight.min.css" "$VENDOR_DIR/tabulator_midnight.min.css"

copy_dir_if_missing "$LEGACY_ICONS_DIR" "$ICONS_DIR"
copy_dir_if_missing "$LEGACY_FRONTEND_ICONS_DIR" "$ICONS_DIR"

REQUIRED_FILES="
fabric.min.js
tabulator.min.js
xlsx.full.min.js
luxon.min.js
jspdf.min.js
"

MISSING_COUNT=0
echo "Verifying required offline vendor files in $VENDOR_DIR ..."
for file_name in $REQUIRED_FILES; do
  if [ ! -f "$VENDOR_DIR/$file_name" ]; then
    echo "MISSING: $VENDOR_DIR/$file_name"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  fi
done

if [ "$MISSING_COUNT" -gt 0 ]; then
  echo "Offline bootstrap incomplete: $MISSING_COUNT required vendor file(s) missing."
  echo "Provide local copies in $VENDOR_DIR and rerun this script."
  exit 1
fi

echo "Offline bootstrap complete."
echo "Canonical assets root: $ASSETS_DIR"
echo "Canonical uploads root: $UPLOADS_DIR"