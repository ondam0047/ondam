import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma v7 은 config 파일이 있으면 .env 를 자동 로드하지 않는다. 그래서 운영 서버에서
// `npm run db:migrate:postgres` 가 .env 의 DATABASE_URL 을 못 읽고 잘못된 기본값
// (postgres:postgres)으로 접속해 P1000 인증실패가 났다(2026-06-27). 여기서 .env 를
// 직접 로드해 막는다. (dotenv 는 직접 의존성이 아니므로 fs 로 파싱. 이미 설정된 env 는 보존,
// 주석·빈 줄은 정규식상 무시, 로컬은 .env 가 없으면 무영향=sqlite 기본.)
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
    }
  }
}

// PRISMA_SCHEMA=postgres 일 때 PostgreSQL 스키마 사용 (배포용).
// 기본은 SQLite (로컬 개발).
const usePostgres = process.env.PRISMA_SCHEMA === "postgres";
const schemaFile = usePostgres ? "schema.postgres.prisma" : "schema.prisma";
const migrationsDir = usePostgres ? "migrations-postgres" : "migrations";

const defaultUrl = usePostgres
  ? "postgresql://postgres:postgres@localhost:5432/baroilji"
  : "file:./prisma/dev.db";
const url = process.env.DATABASE_URL ?? defaultUrl;

export default defineConfig({
  schema: path.join("prisma", schemaFile),
  migrations: {
    path: path.join("prisma", migrationsDir),
  },
  datasource: { url },
});
