#!/usr/bin/env bash
# Manual production deploy — the escape hatch.
#
# Normal deploys are automatic: push to main and Vercel builds it (git integration).
# Use this only to ship something that is NOT committed yet, e.g. testing a fix on
# the real URL before it lands. Vercel runs the build itself using vercel.json, so
# the export + assets/vendor rename happen the same way they do on a push.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .vercel/project.json ]; then
  echo "ERROR: .vercel is missing. Run: vercel link --project flipp --yes" >&2
  exit 1
fi

vercel deploy --prod --yes

echo
echo "Verify the live bundle changed:"
echo "  curl -sL https://flipp-theta-gilt.vercel.app/ | grep -o 'entry-[a-f0-9]*\.js'"
echo "Live at https://flipp-theta-gilt.vercel.app"
