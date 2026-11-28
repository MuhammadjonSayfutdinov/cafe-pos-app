#!/bin/bash
# supabase/*.sql ni mahalliy PostgreSQL'da Supabase'ga o'xshash muhitda sinash (faqat dasturchi uchun).
# Kerak: PostgreSQL 15+ va pgcrypto (Supabase'da bor). Bazani noldan yaratadi (PGDATABASE, standart: pos_sql_test).
#
#   PGHOST=/var/tmp/pgtest PGPORT=54329 PGUSER=postgres bash scripts/sql-test/run.sh
#   ... bash scripts/sql-test/run.sh twice   # SQL fayllarni ikki marta ishga tushirish ham xavfsizmi
#
# Natija oxirida "HAMMASI O'TDI" chiqishi kerak; "FAIL: ..." yoki ERROR - xato.
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
DB="${PGDATABASE:-pos_sql_test}"
P="psql -X -q -v ON_ERROR_STOP=1"

$P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
$P -d postgres -c "create database $DB" || exit 1
$P -d "$DB" -f "$DIR/supabase-stub.sql" 2>&1 | grep -v -i "wal_level\|NOTICE\|HINT"
for f in schema qr storage; do
  $P -d "$DB" -f "$ROOT/supabase/$f.sql" 2>&1 | grep -v NOTICE
done
node "$DIR/seed.mjs" | $P -d "$DB" 2>&1 | grep -v NOTICE
$P -d "$DB" -f "$ROOT/supabase/security.sql" 2>&1 | grep -v NOTICE
if [ "$1" = "twice" ]; then
  for f in schema qr storage security; do
    $P -d "$DB" -f "$ROOT/supabase/$f.sql" 2>&1 | grep -v NOTICE
  done
fi
psql -X -q -d "$DB" -f "$DIR/security-test.sql" 2>&1 \
  | sed 's/^psql:[^ ]*: //' | grep -E "^(NOTICE|ERROR|FAIL)|HAMMASI|LINE" | sed 's/NOTICE:  //'
