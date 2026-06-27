#!/usr/bin/env bash
# 바로일지(ondam) 배포 — macOS/Linux 용. deploy.ps1 의 bash 판본.
#
# 워크플로:  로컬 수정 → git add/commit/push → 서버에서 git pull + build + pm2 restart
# 서버 접속 정보는 deploy.config.json 에 둔다(.gitignore 처리됨). 처음 한 번만
#   cp deploy.config.json.example deploy.config.json  후 값 입력.
#
# ⚠️ 대학/연구실 망은 아웃바운드 22번이 막혀 있어 sshPort 를 2222 로 둔다.
#    (서버 sshd 가 2222 도 listen 하도록 1회 설정 필요: /etc/ssh/sshd_config 에 `Port 2222`)
#
# 사용:
#   ./deploy.sh -m "소급 사유 + AI 자동매핑"      # 커밋·푸시·서버배포(마이그레이션 포함)
#   ./deploy.sh --skip-migrate -m "CSS만 수정"     # DB 마이그레이션 건너뜀
#   ./deploy.sh --local-only -m "..."             # 커밋·푸시만
#   ./deploy.sh --remote-only                     # 이미 푸시된 상태에서 서버 재배포만
#   ./deploy.sh --dry-run -m "..."                # 실행 명령만 출력
#   ./deploy.sh -m "버튼 수정" app/globals.css     # 특정 경로만 스테이징
set -euo pipefail
cd "$(dirname "$0")"

MESSAGE="" BRANCH="" LOCAL_ONLY=0 REMOTE_ONLY=0 SKIP_MIGRATE=0 DRY_RUN=0
PATHS=()
CONFIG="deploy.config.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)      MESSAGE="$2"; shift 2 ;;
    -b|--branch)       BRANCH="$2"; shift 2 ;;
    --local-only)      LOCAL_ONLY=1; shift ;;
    --remote-only)     REMOTE_ONLY=1; shift ;;
    --skip-migrate)    SKIP_MIGRATE=1; shift ;;
    --dry-run)         DRY_RUN=1; shift ;;
    -h|--help)         grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)                echo "✗ 알 수 없는 옵션: $1" >&2; exit 1 ;;
    *)                 PATHS+=("$1"); shift ;;
  esac
done

c()    { printf '\033[36m▶ %s\033[0m\n' "$1"; }            # info
ok()   { printf '\033[32m✓ %s\033[0m\n' "$1"; }            # ok
warn() { printf '\033[33m! %s\033[0m\n' "$1"; }            # warn
die()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
run()  { printf '\033[90m  $ %s\033[0m\n' "$*"; [[ $DRY_RUN -eq 1 ]] && return 0; "$@"; }

# ── config 읽기(node 로 파싱 — jq 의존 없음) ──────────────────
cfg() { node -e "try{const c=require('./$CONFIG');process.stdout.write(String(c['$1']??''))}catch{process.stdout.write('')}"; }
HAS_CFG=0; [[ -f "$CONFIG" ]] && HAS_CFG=1

if [[ -z "$BRANCH" ]]; then
  BRANCH="$( [[ $HAS_CFG -eq 1 ]] && cfg branch || true )"
  [[ -z "$BRANCH" ]] && BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi
c "대상 브랜치: $BRANCH"

# ── 1) 커밋 + 푸시 ───────────────────────────────────────────
if [[ $REMOTE_ONLY -eq 0 ]]; then
  c "변경사항 확인"; git status --short || true
  if [[ ${#PATHS[@]} -gt 0 ]]; then run git add "${PATHS[@]}"; else run git add -A; fi
  if git diff --cached --quiet; then
    warn "커밋할 변경사항이 없습니다. (커밋·푸시 건너뜀)"
  else
    [[ -z "$MESSAGE" ]] && MESSAGE="deploy: $(date '+%Y-%m-%d %H:%M')"
    run git commit -m "$MESSAGE"; ok "커밋 완료: $MESSAGE"
  fi
  c "GitHub 푸시 (origin → $BRANCH)"
  run git push origin "HEAD:$BRANCH"; ok "푸시 완료"
fi

[[ $LOCAL_ONLY -eq 1 ]] && { ok "local-only: 서버 재배포는 건너뜁니다."; exit 0; }

# ── 2) 서버 재배포 ───────────────────────────────────────────
[[ $HAS_CFG -eq 1 ]] || { warn "deploy.config.json 이 없어 서버 재배포를 건너뜁니다 (커밋·푸시는 완료)."; exit 0; }
SERVER_IP="$(cfg serverIp)"; REMOTE_PATH="$(cfg remotePath)"
[[ -n "$SERVER_IP" ]]   || die "deploy.config.json 에 serverIp 가 없습니다."
[[ -n "$REMOTE_PATH" ]] || die "deploy.config.json 에 remotePath 가 없습니다."
SSH_USER="$(cfg sshUser)"; [[ -n "$SSH_USER" ]] || SSH_USER="root"
SSH_PORT="$(cfg sshPort)"; [[ -n "$SSH_PORT" ]] || SSH_PORT="22"
SSH_KEY="$(cfg sshKey)"
PM2_NAME="$(cfg pm2Name)"; [[ -n "$PM2_NAME" ]] || PM2_NAME="baroilji"

# 서버 실행 단계(deploy.ps1 과 동일):
#  - git pull --ff-only: 충돌 없이 origin/branch 로만 전진(엉킨 상태 방지).
#  - npm install --include=dev: .env 의 NODE_ENV=production 때문에 devDep 도 강제 설치.
#  - db:gen:postgres: postinstall 이 sqlite 클라이언트로 덮으므로 매번 postgres 로 재생성.
#  - db:migrate:postgres: 스키마 변경 반영(--skip-migrate 면 생략).
#  - build && restart: 빌드 성공해야만 pm2 restart(.next 깨진 채 재시작 방지).
STEPS="cd $REMOTE_PATH && git pull --ff-only origin $BRANCH && npm install --include=dev --no-audit --no-fund && npm run db:gen:postgres"
[[ $SKIP_MIGRATE -eq 0 ]] && STEPS="$STEPS && npm run db:migrate:postgres"
STEPS="$STEPS && npm run build && pm2 restart $PM2_NAME"

SSH_ARGS=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_KEY" ]]; then
  [[ -f "$SSH_KEY" ]] || die "sshKey 경로를 찾을 수 없습니다: $SSH_KEY"
  SSH_ARGS+=(-i "$SSH_KEY")
fi

c "서버 재배포: $SSH_USER@$SERVER_IP:$SSH_PORT → $REMOTE_PATH  (branch=$BRANCH, migrate=$([[ $SKIP_MIGRATE -eq 0 ]] && echo true || echo false))"
run ssh "${SSH_ARGS[@]}" "$SSH_USER@$SERVER_IP" "set -e; $STEPS"
ok "배포 완료 — https://baroilji.com 확인"
