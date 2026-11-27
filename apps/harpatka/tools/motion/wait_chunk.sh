#!/bin/sh
# wait until render_seq.py's log counts $1 finished ads, or a new problem or end line appears; then print the latest lines.
# The log is <motion root>/review/render-seq.log, the root as in tools/paths.py: env HARPATKA_MOTION_ROOT,
# default C:\Users\ofira\Desktop\harpatka\motion (as /c/Users/ofira/Desktop/harpatka/motion in Git Bash). Runs from any folder.
ROOT=${HARPATKA_MOTION_ROOT:-/c/Users/ofira/Desktop/harpatka/motion}
command -v cygpath >/dev/null 2>&1 && ROOT=$(cygpath -u "$ROOT")
L="$ROOT/review/render-seq.log"
[ -f "$L" ] || { echo "no log at $L"; exit 1; }
hb=$(grep -cE 'HOLD|FAILED|stopped|done' "$L")
until [ "$(grep -c ': ok render' "$L")" -ge "$1" ] || [ "$(grep -cE 'HOLD|FAILED|stopped|done' "$L")" -gt "$hb" ]; do sleep 60; done
tail -12 "$L" | cut -c1-230
