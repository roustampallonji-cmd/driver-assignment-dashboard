#!/bin/bash
# Build configuration.json for MyGeotab Page Add-In
# Reads HTML, CSS, and JS source files and embeds them into configuration.json

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

HTML_FILE="driver-assignment-dashboard.html"
CSS_FILE="css/dad.css"
JS_FILE="js/dad.js"
OUTPUT="configuration.json"

# Verify source files exist
for f in "$HTML_FILE" "$CSS_FILE" "$JS_FILE"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: Missing source file: $f"
    exit 1
  fi
done

# Read file contents and JSON-escape them
escape_json() {
  python3 -c "
import sys, json
with open(sys.argv[1], 'r') as f:
    content = f.read()
print(json.dumps(content))
" "$1"
}

HTML_ESCAPED=$(escape_json "$HTML_FILE")
CSS_ESCAPED=$(escape_json "$CSS_FILE")
JS_ESCAPED=$(escape_json "$JS_FILE")

# Generate configuration.json
cat > "$OUTPUT" << JSONEOF
{
  "name": "Driver Assignment Dashboard",
  "supportEmail": "roustam.pallonji@geotab.com",
  "version": "1.0.0",
  "items": [
    {
      "url": "addin-driver-assignment-dashboard.html",
      "path": "ActivityLink",
      "menuName": {
        "en": "Driver Assignment Dashboard"
      },
      "icon": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI3IiB3aWR0aD0iMTgiIGhlaWdodD0iMTEiIHJ4PSIyIi8+PGNpcmNsZSBjeD0iNy41IiBjeT0iMTgiIHI9IjEuNSIvPjxjaXJjbGUgY3g9IjE2LjUiIGN5PSIxOCIgcj0iMS41Ii8+PHBhdGggZD0iTTUgN1Y1YTIgMiAwIDAxMi0yaDEwYTIgMiAwIDAxMiAydjIiLz48cGF0aCBkPSJNOSAxMWg2Ii8+PC9zdmc+"
    }
  ],
  "files": {
    "addin-driver-assignment-dashboard.html": ${HTML_ESCAPED},
    "css/dad.css": ${CSS_ESCAPED},
    "js/dad.js": ${JS_ESCAPED}
  },
  "isSigned": false
}
JSONEOF

echo "Built $OUTPUT successfully ($(wc -c < "$OUTPUT" | tr -d ' ') bytes)"
