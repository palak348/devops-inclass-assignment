#!/usr/bin/env bash
# End-to-end smoke test of a running CareSlot stack.
#   ./scripts/smoke-test.sh                       # docker compose (frontend on :3000)
#   ./scripts/smoke-test.sh http://careslot.local # Kubernetes Ingress
#   HOST_HEADER=careslot.local ./scripts/smoke-test.sh http://localhost:18080
#                                                 # Ingress via port-forward, no hosts-file entry
# Every request goes through the frontend URL, so this also proves the /api routing.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
pass=0
HOST_ARGS=()
[[ -n "${HOST_HEADER:-}" ]] && HOST_ARGS=(-H "Host: ${HOST_HEADER}")

check() { # check <description> <expected-status> <curl args...>
  local desc="$1" expected="$2"; shift 2
  local status
  status=$(curl -s -o "$OUT" -w '%{http_code}' "${HOST_ARGS[@]}" "$@")
  if [[ "$status" == "$expected" ]]; then
    echo "  PASS  $desc ($status)"; pass=$((pass + 1))
  else
    echo "  FAIL  $desc - expected $expected, got $status"; cat "$OUT"; echo; exit 1
  fi
}
# Top-level numeric field of the last response, e.g. `field id` (no jq/python needed).
field() { grep -oE "[{,]\"$1\":[0-9]+" "$OUT" | head -1 | cut -d: -f2; }

echo "Smoke testing $BASE"
check "frontend serves the SPA"     200 "$BASE/"
check "frontend probe"              200 "$BASE/healthz"
check "list doctors (seeded)"       200 "$BASE/api/doctors"
check "create patient"              201 -X POST "$BASE/api/patients" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test Patient","phone":"+91 90000 00000"}'
patient_id=$(field id)
check "create doctor"               201 -X POST "$BASE/api/doctors" -H 'Content-Type: application/json' \
  -d '{"name":"Dr. Smoke Test","specialty":"General Medicine","room":"999"}'
doctor_id=$(field id)
slot="2031-$(printf '%02d' $((RANDOM % 12 + 1)))-$(printf '%02d' $((RANDOM % 28 + 1)))T10:00:00Z"
check "book appointment"            201 -X POST "$BASE/api/appointments" -H 'Content-Type: application/json' \
  -d "{\"doctor_id\":$doctor_id,\"patient_id\":$patient_id,\"scheduled_at\":\"$slot\",\"reason\":\"smoke test\"}"
appt_id=$(field id)
check "double booking rejected"     409 -X POST "$BASE/api/appointments" -H 'Content-Type: application/json' \
  -d "{\"doctor_id\":$doctor_id,\"patient_id\":$patient_id,\"scheduled_at\":\"$slot\"}"
check "get appointment"             200 "$BASE/api/appointments/$appt_id"
check "check in (PATCH status)"     200 -X PATCH "$BASE/api/appointments/$appt_id/status" \
  -H 'Content-Type: application/json' -d '{"status":"CHECKED_IN"}'
check "reschedule (PUT)"            200 -X PUT "$BASE/api/appointments/$appt_id" \
  -H 'Content-Type: application/json' -d '{"reason":"smoke test - updated"}'
check "stats"                       200 "$BASE/api/stats"
check "delete appointment"          204 -X DELETE "$BASE/api/appointments/$appt_id"
check "deleted appointment is gone" 404 "$BASE/api/appointments/$appt_id"
check "delete test doctor"          204 -X DELETE "$BASE/api/doctors/$doctor_id"
check "delete test patient"         204 -X DELETE "$BASE/api/patients/$patient_id"

echo "All $pass checks passed."
