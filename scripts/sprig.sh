#!/usr/bin/env bash
# Canopy Quest AI switch.
#   "Sprig, go to sleep"  -> ./scripts/sprig.sh off   (judges check every photo)
#   "Sprig, wake up"      -> ./scripts/sprig.sh on    (plant AI gives instant points)
#   ./scripts/sprig.sh status
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-status}" in
  off) sql="update settings set ai_enabled = false, updated_at = now() where id = 1 returning ai_enabled" ;;
  on)  sql="update settings set ai_enabled = true, updated_at = now() where id = 1 returning ai_enabled" ;;
  status) sql="select ai_enabled from settings where id = 1" ;;
  *) echo "usage: $0 on|off|status"; exit 1 ;;
esac
flag=(--yes); [ "${1:-status}" = status ] && flag=(--read-only)
out=$(npx supabase db query --remote "${flag[@]}" "$sql" 2>&1)
if echo "$out" | grep -q '"ai_enabled": true'; then echo "🤖 AI is ON (instant points)";
elif echo "$out" | grep -q '"ai_enabled": false'; then echo "🙋 AI is OFF (judges only)";
else echo "Could not read the switch:"; echo "$out" | tail -5; exit 1; fi
