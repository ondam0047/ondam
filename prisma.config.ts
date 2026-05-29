import path from "node:path";
import { defineConfig } from "prisma/config";

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
