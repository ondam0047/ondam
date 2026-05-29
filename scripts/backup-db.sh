#!/bin/bash
# 바로일지 PostgreSQL DB 자동 백업.
# - 매일 새벽 3시 cron 실행 권장
# - 30일치 보관, 그 이전 파일 자동 삭제
# 설치:
#   chmod +x /opt/baroilji/scripts/backup-db.sh
#   crontab -e
#   추가: 0 3 * * * /opt/baroilji/scripts/backup-db.sh >> /var/log/baroilji-backup.log 2>&1

set -e

BACKUP_DIR="/backup"
DB_USER="baroilji"
DB_NAME="baroilji"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d_%H%M)
OUT="$BACKUP_DIR/baroilji-$TS.sql.gz"

# .pgpass 가 있으면 비밀번호 자동 사용. 없으면 PGPASSWORD 환경변수 필요.
pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

# 권한 보호
chmod 600 "$OUT"

# 오래된 백업 삭제
find "$BACKUP_DIR" -name "baroilji-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[$(date)] OK: $OUT ($(du -h "$OUT" | cut -f1))"
