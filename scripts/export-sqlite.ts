// 로컬 SQLite 데이터를 JSON 으로 덤프.
// 실행: npm run db:export:sqlite
// 결과: prisma/dump.json

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const dump = {
    centers: await prisma.center.findMany(),
    users: await prisma.user.findMany(),
    authSessions: [] as unknown[],
    therapists: await prisma.therapist.findMany(),
    therapistBlocks: await prisma.therapistBlock.findMany(),
    children: await prisma.child.findMany(),
    schedules: await prisma.schedule.findMany(),
    scheduleSessions: await prisma.scheduleSession.findMany(),
    records: await prisma.record.findMany(),
    recordSessions: await prisma.recordSession.findMany(),
  };

  const outPath = join(process.cwd(), "prisma", "dump.json");
  writeFileSync(outPath, JSON.stringify(dump, null, 2));

  console.log(`✅ Dumped to ${outPath}`);
  console.log(`  centers: ${dump.centers.length}`);
  console.log(`  users: ${dump.users.length}`);
  console.log(`  therapists: ${dump.therapists.length}`);
  console.log(`  therapistBlocks: ${dump.therapistBlocks.length}`);
  console.log(`  children: ${dump.children.length}`);
  console.log(`  schedules: ${dump.schedules.length} (sessions: ${dump.scheduleSessions.length})`);
  console.log(`  records: ${dump.records.length} (sessions: ${dump.recordSessions.length})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
