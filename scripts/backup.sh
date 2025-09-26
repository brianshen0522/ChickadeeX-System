#!/bin/bash

# Database Backup Script for Medical Reports Platform
# This script creates compressed backups of the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="/backups"
DB_HOST="db"
DB_NAME="medical_reports"
DB_USER="postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/medical_reports_backup_$TIMESTAMP.sql.gz"
RETENTION_DAYS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log_info "Starting database backup..."

# Create backup
if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --verbose \
    --clean \
    --no-owner \
    --no-privileges | gzip > "$BACKUP_FILE"; then
    
    log_info "Backup created successfully: $BACKUP_FILE"
    log_info "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    log_error "Backup failed!"
    exit 1
fi

# Clean old backups
log_info "Cleaning old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "medical_reports_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# List current backups
log_info "Current backups:"
ls -lh "$BACKUP_DIR"/medical_reports_backup_*.sql.gz 2>/dev/null || log_warn "No backups found"

log_info "Backup process completed!"

# If running in cron, also log to syslog
if [ -t 1 ]; then
    # Running interactively
    :
else
    # Running in cron
    logger "Medical Reports DB backup completed: $BACKUP_FILE"
fi