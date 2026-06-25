// 과거 기록지 '총이용금액' 일괄 교정 스크립트 (1회성 데이터 마이그레이션).
//
// 배경: 예전 버전에서 승인내역 엑셀을 넣으면 엑셀의 '결제금액'(=바우처 지원금 부분,
// 예 46,200)이 기록지 '총이용금액'으로 저장됐다. 총이용금액은 회당 단가(예 60,000)가
// 맞다. 이 스크립트는 과거 데이터와 무관하게 모든 RecordSession.amount 를 해당 아동
// 서비스의 회당단가(ChildService.defaultUnit)로 통일한다.
//
// 실행(서버/운영 postgres):
//   PRISMA_SCHEMA=postgres DATABASE_URL=<postgres-url> \
//     node --experimental-strip-types scripts/fix-record-amounts.ts
//   (npm run fix:record-amounts 로도 실행 가능 — DATABASE_URL 은 환경에 맞게)
//
// 미리보기(쓰기 없이 몇 건 바뀌는지만):
//   DRY_RUN=1 node --experimental-strip-types scripts/fix-record-amounts.ts

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");
const prisma = isPostgres
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  : new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

async function main() {
  const records = await prisma.record.findMany({
    select: {
      id: true,
      year: true,
      month: true,
      childName: true,
      childService: { select: { defaultUnit: true } },
      sessions: { select: { id: true, amount: true } },
    },
  });

  let recordsTouched = 0;
  let sessionsChanged = 0;

  for (const rec of records) {
    const unit = rec.childService?.defaultUnit ?? 0;
    if (!unit || unit <= 0) continue; // 단가 미설정이면 건드리지 않음
    const target = unit.toLocaleString("ko-KR"); // 앱이 저장하는 형식과 동일 (예 "60,000")

    const wrong = rec.sessions.filter((s) => s.amount !== target);
    if (wrong.length === 0) continue;

    console.log(
      `· ${rec.childName} ${rec.year}/${rec.month} (record ${rec.id}): ${wrong.length}회 → ${target}` +
        (wrong[0]?.amount ? ` (기존 예: ${wrong[0].amount})` : "")
    );
    recordsTouched += 1;
    sessionsChanged += wrong.length;

    if (!DRY_RUN) {
      await prisma.recordSession.updateMany({
        where: { recordId: rec.id, NOT: { amount: target } },
        data: { amount: target },
      });
    }
  }

  console.log(
    `\n${DRY_RUN ? "[DRY RUN] " : ""}완료: 기록 ${recordsTouched}건 / 회차 ${sessionsChanged}개 ${
      DRY_RUN ? "교정 예정" : "교정됨"
    }. (전체 기록 ${records.length}건 검사)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
