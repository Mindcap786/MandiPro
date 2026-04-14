#!/bin/bash

# ============================================================================
# MandiGrow ERP - Database Backup Script
# ============================================================================
# This script dumps the Supabase database and prepares it for storage.
# ============================================================================

# Configuration (Use env vars in CI/CD)
DB_URL=${DATABASE_URL}
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="mandigrow_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

echo "🚀 Starting Database Backup..."
echo "📅 Timestamp: ${TIMESTAMP}"

# 1. Dump the database using pg_dump
# We use -x to exclude privileges and -O to exclude owners for easier restoration
echo "💾 Exporting data..."
pg_dump "${DB_URL}" -x -O -f "${BACKUP_DIR}/${FILENAME}"

if [ $? -eq 0 ]; then
    echo "✅ Dump successful!"
else
    echo "❌ Error: pg_dump failed!"
    exit 1
fi

# 2. Compress the backup
echo "📦 Compressing backup..."
gzip "${BACKUP_DIR}/${FILENAME}"

if [ $? -eq 0 ]; then
    echo "✅ Compression successful: ${BACKUP_DIR}/${FILENAME}.gz"
else
    echo "❌ Error: Compression failed!"
    exit 1
fi

# 3. Cleanup old backups (keep last 7 days locally)
echo "🧹 Cleaning up old local backups..."
find ${BACKUP_DIR} -name "mandigrow_backup_*.sql.gz" -mtime +7 -delete

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ BACKUP COMPLETED: ${BACKUP_DIR}/${FILENAME}.gz"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next: Upload this file to S3 or secure cloud storage."
