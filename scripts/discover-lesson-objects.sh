#!/usr/bin/env bash
set -euo pipefail
ORG="${1:-trg2--extuat}"
python3 "$(dirname "$0")/discover-lesson-objects.py" "$ORG"
