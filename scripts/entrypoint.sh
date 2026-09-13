#!/bin/bash
set -e

# Restore database from S3 replica if local DB file does not exist
if [ ! -f /data/flarebase.db ]; then
  echo "🔍 Local database not found. Attempting Litestream restore from S3..."
  litestream restore -if-replica-exists -config /etc/litestream.yml /data/flarebase.db || true
fi

echo "🚀 Starting Litestream replication daemon with FlareBase..."
exec litestream replicate -config /etc/litestream.yml -exec "node dist/server.js"
