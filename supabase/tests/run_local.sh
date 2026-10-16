#!/usr/bin/env bash
# Runs the database tests on a LOCAL PostgreSQL 15+ (never on Supabase).
# Uses the standard PGHOST / PGPORT / PGUSER environment variables.
# Creates a throwaway database "pms_test", applies stubs + migrations, runs the tests.
set -euo pipefail
cd "$(dirname "$0")/.."
psql -d postgres -v ON_ERROR_STOP=1 -q -c "drop database if exists pms_test" -c "create database pms_test"
for f in tests/00_local_stubs.sql migrations/*.sql; do
  psql -d pms_test -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { echo "failed: $f"; psql -d pms_test -v ON_ERROR_STOP=1 -q -f "$f"; exit 1; }
done
cat tests/10_logic_test.sql tests/20_upgrade_test.sql | psql -d pms_test -v ON_ERROR_STOP=1 -q -At -o /dev/null 2>&1 | sed "s/^.*NOTICE:  //"
