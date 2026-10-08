#!/usr/bin/env bash
# Run the database tests against a local Postgres (with pgTAP) instead of the
# Supabase Docker stack: creates a scratch database, applies a Supabase shim and
# every migration, then runs supabase/tests/database with pg_prove.
#
# Usage: scripts/db-test-local.sh   (PG* env vars select the server; default: local socket)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
db="hfn_test_$$"

createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$root/scripts/db/supabase-shim.sql"
psql -q -v ON_ERROR_STOP=1 -d "$db" -c "create extension pgtap with schema extensions"
for f in "$root"/supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"
done

PGOPTIONS="-c search_path=public,extensions" pg_prove -d "$db" "$root"/supabase/tests/database/*.sql
