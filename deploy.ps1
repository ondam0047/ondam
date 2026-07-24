<#
.SYNOPSIS
    바로일지(ondam) 수정사항을 커밋·푸시하고 NCP 서버에 재배포합니다.

.DESCRIPTION
    워크플로:  로컬 수정  →  git add/commit/push  →  서버에서 git pull + build + pm2 restart
    서버 접속 정보는 deploy.config.json 에 저장합니다(.gitignore 처리됨).
    처음 한 번만 deploy.config.json.example 를 복사해 값을 채우세요.

.PARAMETER Message
    커밋 메시지. 생략하면 "deploy: <날짜시각>" 자동 생성.

.PARAMETER Branch
    푸시·배포할 브랜치. 생략하면 config.branch → 없으면 현재 체크아웃된 브랜치.

.PARAMETER Paths
    스테이징할 경로(여러 개 가능). 생략하면 변경분 전체(git add -A).
    예) -Paths app/globals.css

.PARAMETER LocalOnly
    커밋·푸시만 하고 서버 재배포는 건너뜀.

.PARAMETER RemoteOnly
    git 작업 없이 서버 재배포만 실행(이미 푸시된 상태에서 다시 배포할 때).

.PARAMETER SkipMigrate
    서버에서 DB 마이그레이션(db:migrate:postgres)을 건너뜀. (CSS/프론트만 고쳤을 때 유용)

.PARAMETER DryRun
    실제 실행 없이 수행할 명령만 출력.

.EXAMPLE
    .\deploy.ps1 -Message "모바일 UI 수정(내 아동·대시보드)" -SkipMigrate

.EXAMPLE
    .\deploy.ps1 -Paths app/globals.css -Message "버튼 줄바꿈 수정" -SkipMigrate

.EXAMPLE
    .\deploy.ps1 -LocalOnly          # 커밋·푸시만
    .\deploy.ps1 -RemoteOnly         # 서버 재배포만
#>
[CmdletBinding()]
param(
    [string]$Message = "",
    [string]$Branch = "",
    [string[]]$Paths = @(),
    [string]$ConfigPath = "$PSScriptRoot\deploy.config.json",
    [switch]$LocalOnly,
    [switch]$RemoteOnly,
    [switch]$SkipMigrate,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Info($m)  { Write-Host "▶ $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "✓ $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "! $m" -ForegroundColor Yellow }
function Die($m)   { Write-Host "✗ $m" -ForegroundColor Red; exit 1 }

# native 명령 실행 + 실패 시 중단 (DryRun이면 출력만)
function Run($exe, $argList) {
    $pretty = "$exe $($argList -join ' ')"
    if ($DryRun) { Write-Host "  [dry-run] $pretty" -ForegroundColor DarkGray; return "" }
    Write-Host "  $ $pretty" -ForegroundColor DarkGray
    $out = & $exe @argList 2>&1
    if ($out) { $out | ForEach-Object { Write-Host "    $_" } }
    if ($LASTEXITCODE -ne 0) { Die "명령 실패(exit $LASTEXITCODE): $pretty" }
    return $out
}

# ── 브랜치 결정 ────────────────────────────────────────────────
$cfg = $null
if (Test-Path $ConfigPath) {
    try { $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json }
    catch { Die "deploy.config.json 파싱 실패: $_" }
}
if (-not $Branch) {
    if ($cfg -and $cfg.branch) { $Branch = $cfg.branch }
    else { $Branch = (& git rev-parse --abbrev-ref HEAD).Trim() }
}
Info "대상 브랜치: $Branch"

# ── 1) 커밋 + 푸시 ────────────────────────────────────────────
if (-not $RemoteOnly) {
    Info "변경사항 확인"
    & git status --short

    if ($Paths.Count -gt 0) { Run "git" (@("add") + $Paths) }
    else                    { Run "git" @("add", "-A") }

    # 스테이징된 게 있는지 확인
    & git diff --cached --quiet
    $hasStaged = ($LASTEXITCODE -ne 0)
    if (-not $hasStaged) {
        Warn "커밋할 변경사항이 없습니다. (커밋·푸시 건너뜀)"
    } else {
        if (-not $Message) { $Message = "deploy: " + (Get-Date -Format "yyyy-MM-dd HH:mm") }
        Run "git" @("commit", "-m", $Message)
        Ok "커밋 완료: $Message"
    }

    Info "GitHub 푸시 (origin → $Branch)"
    Run "git" @("push", "origin", "HEAD:$Branch")
    Ok "푸시 완료"
}

if ($LocalOnly) { Ok "LocalOnly: 서버 재배포는 건너뜁니다."; exit 0 }

# ── 2) 서버 재배포 ────────────────────────────────────────────
if (-not $cfg) {
    Warn "deploy.config.json 이 없어 서버 재배포를 건너뜁니다."
    Write-Host "  설정하려면:  Copy-Item deploy.config.json.example deploy.config.json  후 값 입력" -ForegroundColor DarkGray
    Write-Host "  (커밋·푸시는 이미 완료됐습니다.)" -ForegroundColor DarkGray
    exit 0
}
foreach ($k in @("serverIp","remotePath")) {
    if (-not $cfg.$k) { Die "deploy.config.json 에 '$k' 값이 없습니다." }
}
$sshUser    = if ($cfg.sshUser)   { $cfg.sshUser }   else { "root" }
$remotePath = $cfg.remotePath
$pm2Name    = if ($cfg.pm2Name)   { $cfg.pm2Name }   else { "baroilji" }
$target     = "$sshUser@$($cfg.serverIp)"

# 서버에서 실행할 bash 한 줄 (&&는 서버 bash이므로 OK)
# 주의(운영 함정 방지):
#  - .env 주입: prisma(7) + prisma.config.ts 는 .env 자동 로드 안 함 → 없으면 postgres:postgres 폴백 → P1000.
#  - db:gen:postgres: npm install 의 postinstall 이 sqlite 클라이언트로 덮어쓰므로 매번 postgres 로 재생성.
#  - build && restart: 빌드 성공해야만 pm2 restart (set -e + && 로 실패 시 중단 → .next 깨진 채 재시작 방지).
#  - npm install --include=dev: .env 의 NODE_ENV=production 때문에 devDep(@tailwindcss/postcss 등)이
#    빠지면 빌드가 깨짐 → 빌드에 필요한 devDep 을 항상 설치.
$steps = @(
    "cd $remotePath",
    "set -a && . ./.env && set +a",
    "git fetch --all --prune",
    "git checkout $Branch",
    "git pull --ff-only origin $Branch",
    "npm install --include=dev --no-audit --no-fund",
    "npm run db:gen:postgres"
)
if (-not $SkipMigrate) { $steps += "npm run db:migrate:postgres" }
$steps += "npm run build"
$steps += "pm2 restart $pm2Name"
$remoteCmd = "set -e; " + ($steps -join " && ")

$sshArgs = @()
if ($cfg.sshPort) { $sshArgs += @("-p", "$($cfg.sshPort)") }
if ($cfg.sshKey) {
    if (-not (Test-Path $cfg.sshKey)) { Die "sshKey 경로를 찾을 수 없습니다: $($cfg.sshKey)" }
    $sshArgs += @("-i", $cfg.sshKey)
}
$sshArgs += @("-o", "StrictHostKeyChecking=accept-new", $target, $remoteCmd)

Info "서버 재배포: $target : $remotePath  (branch=$Branch, migrate=$([bool](-not $SkipMigrate)))"
Run "ssh" $sshArgs
Ok "배포 완료 →  https://baroilji.com"
