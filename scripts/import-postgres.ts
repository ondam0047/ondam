// dump.json 을 PostgreSQL 로 주입.
// 실행: npm run db:import:postgres (DATABASE_URL 은 postgres URL 이어야 함)
// 주의: 빈 DB 에만 실행. 기존 데이터가 있으면 PK 충돌.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith("postgres")) {
  console.error("❌ DATABASE_URL 에 postgres URL 을 설정하세요.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

type Dump = {
  centers: any[];
  users: any[];
  therapists: any[];
  therapistBlocks: any[];
  children: any[];
  schedules: any[];
  scheduleSessions: any[];
  records: any[];
  recordSessions: any[];
};

async function main() {
  const dumpPath = join(process.cwd(), "prisma", "dump.json");
  const dump: Dump = JSON.parse(readFileSync(dumpPath, "utf-8"));

  console.log("📥 Importing to PostgreSQL...");

  // 순서 중요 (FK 의존성)
  for (const c of dump.centers) {
    await prisma.center.create({ data: { ...c, createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt) } });
  }
  console.log(`  ✅ centers: ${dump.centers.length}`);

  for (const t of dump.therapists) {
    await prisma.therapist.create({ data: { ...t, createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt) } });
  }
  console.log(`  ✅ therapists: ${dump.therapists.length}`);

  for (const u of dump.users) {
    await prisma.user.create({ data: { ...u, createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt) } });
  }
  console.log(`  ✅ users: ${dump.users.length}`);

  for (const b of dump.therapistBlocks) {
    await prisma.therapistBlock.create({ data: { ...b, createdAt: new Date(b.createdAt) } });
  }
  console.log(`  ✅ therapistBlocks: ${dump.therapistBlocks.length}`);

  for (const ch of dump.children) {
    await prisma.child.create({ data: { ...ch, createdAt: new Date(ch.createdAt), updatedAt: new Date(ch.updatedAt) } });
  }
  console.log(`  ✅ children: ${dump.children.length}`);

  for (const s of dump.schedules) {
    await prisma.schedule.create({ data: { ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) } });
  }
  console.log(`  ✅ schedules: ${dump.schedules.length}`);

  for (const ss of dump.scheduleSessions) {
    await prisma.scheduleSession.create({ data: ss });
  }
  console.log(`  ✅ scheduleSessions: ${dump.scheduleSessions.length}`);

  for (const r of dump.records) {
    await prisma.record.create({ data: { ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) } });
  }
  console.log(`  ✅ records: ${dump.records.length}`);

  for (const rs of dump.recordSessions) {
    await prisma.recordSession.create({ data: rs });
  }
  console.log(`  ✅ recordSessions: ${dump.recordSessions.length}`);

  // PostgreSQL 시퀀스 리셋 (수동 ID 주입 후엔 시퀀스를 max(id)+1 로 맞춰줘야 다음 자동증가가 안 깨짐)
  console.log("🔧 시퀀스 리셋 중...");
  const tables = [
    "Center", "User", "AuthSession", "Therapist", "TherapistBlock",
    "Child", "Schedule", "ScheduleSession", "Record", "RecordSession",
  ];
  for (const tbl of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${tbl}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tbl}"), 0) + 1, false)`
    );
  }
  console.log("✅ 완료");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
