# 바로일지 NCP 배포 가이드

원장님이 직접 따라하실 수 있도록 단계별로 정리했습니다.

---

## 사전 준비 (이미 진행 중)

- [ ] 가비아에서 `baroilji.com` 구매 완료
- [ ] 네이버 클라우드(NCP) 가입 + 카드 등록 완료

---

## 1단계: NCP 서버 만들기

### 1-1. 서버 신청
1. https://console.ncloud.com 로그인
2. 좌측 메뉴 `Services` → `Compute` → `Server`
3. 상단 `+ 서버 생성` 클릭
4. 설정:
   - **이미지**: Ubuntu Server 22.04
   - **서버 타입**: Compact (또는 Standard)
   - **요금제**: 월요금제
   - **존(Zone)**: KR-1 (춘천)
   - **서버 이름**: `baroilji-prod`
5. `다음` → 인증키 생성 (다운받아서 안전하게 보관)
6. 네트워크 접근 설정(ACG):
   - SSH: `22` 포트, 내 IP 허용
   - HTTP: `80` 포트, 0.0.0.0/0
   - HTTPS: `443` 포트, 0.0.0.0/0
7. `생성` 완료 → 약 5분 후 서버 시작됨
8. 생성된 서버의 **공인 IP** 메모 (예: `223.130.xxx.xxx`)

### 1-2. 관리자 비밀번호 확인
- 서버 리스트에서 `관리자 비밀번호 확인` → 다운받은 `.pem` 키 업로드 → 비밀번호 표시

---

## 2단계: 서버 접속 + 기본 환경 세팅

### 2-1. SSH 접속
Mac/Linux:
```bash
ssh root@<공인IP>
# 비밀번호 입력
```

Windows: PuTTY 또는 PowerShell의 `ssh` 명령어.

### 2-2. 기본 패키지 설치
```bash
# 시스템 업데이트
apt update && apt upgrade -y

# 필수 도구
apt install -y curl git build-essential

# Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# PostgreSQL 16
apt install -y postgresql postgresql-contrib

# Nginx (리버스 프록시)
apt install -y nginx

# PM2 (Node 프로세스 매니저)
npm install -g pm2
```

### 2-3. PostgreSQL 설정
```bash
sudo -u postgres psql <<EOF
CREATE USER baroilji WITH PASSWORD '강력한_비밀번호_여기에';
CREATE DATABASE baroilji OWNER baroilji;
GRANT ALL PRIVILEGES ON DATABASE baroilji TO baroilji;
EOF
```

연결 테스트:
```bash
psql -U baroilji -d baroilji -h localhost -W
# 비밀번호 입력 → \q 로 종료
```

---

## 3단계: 코드 배포

### 3-1. 깃에서 받아오기
```bash
cd /opt
git clone https://github.com/ondam0047/ondam.git baroilji
cd baroilji
npm install
```

### 3-2. 환경변수 설정
```bash
cat > /opt/baroilji/.env <<EOF
DATABASE_URL="postgresql://baroilji:비밀번호@localhost:5432/baroilji"
NODE_ENV="production"
EOF
```

### 3-3. DB 스키마 적용
```bash
cd /opt/baroilji
npm run db:gen:postgres
npm run db:migrate:postgres
```

### 3-4. (선택) 기존 로컬 데이터 옮기기
로컬 컴퓨터에서:
```bash
npm run db:export:sqlite
# prisma/dump.json 생김 → 서버로 업로드
scp prisma/dump.json root@<공인IP>:/opt/baroilji/prisma/
```

서버에서:
```bash
cd /opt/baroilji
npm run db:import:postgres
```

### 3-5. 빌드 + 실행
```bash
cd /opt/baroilji
npm run build
pm2 start npm --name baroilji -- start
pm2 save
pm2 startup  # 재부팅 시 자동 시작
```

확인:
```bash
curl http://localhost:3000
# HTML 응답 나오면 성공
```

---

## 4단계: Nginx + HTTPS

### 4-1. Nginx 설정
```bash
cat > /etc/nginx/sites-available/baroilji <<'EOF'
server {
    listen 80;
    server_name baroilji.com www.baroilji.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/baroilji /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

### 4-2. 도메인 DNS 연결 (가비아)
1. 가비아 `My가비아` → `서비스 관리` → `baroilji.com`
2. `DNS 관리툴` → `DNS 설정`
3. 레코드 추가:
   - 타입 `A`, 호스트 `@`, 값 `<NCP 공인IP>`, TTL `3600`
   - 타입 `A`, 호스트 `www`, 값 `<NCP 공인IP>`, TTL `3600`
4. 저장 → 10분~1시간 후 전 세계 반영

확인:
```bash
# 서버에서
curl http://baroilji.com
```

### 4-3. HTTPS (Let's Encrypt 무료)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d baroilji.com -d www.baroilji.com
# 이메일 입력, 약관 동의, HTTPS 자동 리다이렉트 선택
```

이제 https://baroilji.com 으로 접속 가능!

---

## 5단계: 운영 명령어 모음

```bash
# 로그 확인
pm2 logs baroilji

# 재시작
pm2 restart baroilji

# 코드 업데이트
cd /opt/baroilji
git pull
npm install
npm run db:migrate:postgres
npm run build
pm2 restart baroilji

# DB 백업 (매일 권장)
pg_dump -U baroilji baroilji > /backup/baroilji-$(date +%Y%m%d).sql
```

### 자동 백업 (cron)

레포에 포함된 스크립트 사용:
```bash
# 권한 부여 (한 번만)
chmod +x /opt/baroilji/scripts/backup-db.sh

# 비밀번호 자동 입력 위한 .pgpass 만들기 (한 번만)
echo "localhost:5432:baroilji:baroilji:비밀번호" > /root/.pgpass
chmod 600 /root/.pgpass

# crontab 등록
crontab -e
# 추가:
0 3 * * * /opt/baroilji/scripts/backup-db.sh >> /var/log/baroilji-backup.log 2>&1
```

매일 새벽 3시 자동 실행, 30일치 보관, `.sql.gz` 압축본 `/backup/` 에 저장.

수동 테스트:
```bash
/opt/baroilji/scripts/backup-db.sh
ls -la /backup/
```

---

## 문제 해결

| 증상 | 확인 |
|---|---|
| `pm2 status` 에 errored | `pm2 logs baroilji` 로그 확인 |
| 502 Bad Gateway | `pm2 status` + Nginx 가 3000 으로 프록시 하는지 |
| DB 연결 실패 | `.env` 의 `DATABASE_URL` 비밀번호 + `psql` 직접 접속 |
| 도메인 안 떠요 | `dig baroilji.com` → 공인 IP 일치하는지 |
