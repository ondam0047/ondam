// 영상 촬영용 데모 데이터 시드 — 로컬 dev 환경 전용.
// 실행: npm run seed:demo
//
// 생성되는 것:
//   - 데모 계정 (demo@baroilji.com / demo1234, OWNER, 언어재활사)
//   - 센터 (꿈나라발달언어센터)
//   - 아동 12명 (가공 이름)
//   - 각 아동 1개 ChildService (요일·시간대 분산)
//   - 3개월치 일정표 (지난-지난달, 지난달, 이번달)
//   - 기록지 (지난-지난달 전부, 지난달 전부, 이번달 일부 — 대시보드 '미작성' 시연용)
//
// 같은 demo 계정 데이터를 통째로 지우고 재생성하므로 여러 번 실행 가능.

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");
const prisma = isPostgres
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  : new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

const DEMO_EMAIL = "demo@baroilji.com";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "김다온";
const CENTER_NAME = "꿈나라발달언어센터";

// 가공 아동 12명. 가나다 두 글자 이름 패턴.
const CHILDREN: Array<{
  name: string;
  birthDate: string;
  serviceType: string;
  defaultDays: string;   // "1,4" = 월·목
  defaultSlot: string;
  defaultUnit: number;
  defaultTarget: number;
  monthlyCopay: number;
}> = [
  { name: "김가나", birthDate: "19.05.12", serviceType: "언어재활",  defaultDays: "1,4", defaultSlot: "09:00~09:50", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 80000 },
  { name: "이다라", birthDate: "20.03.08", serviceType: "언어재활",  defaultDays: "1,4", defaultSlot: "09:50~10:40", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 70000 },
  { name: "박마바", birthDate: "18.11.22", serviceType: "언어재활",  defaultDays: "1,4", defaultSlot: "10:40~11:30", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 90000 },
  { name: "최사아", birthDate: "21.01.30", serviceType: "언어재활",  defaultDays: "2,5", defaultSlot: "09:00~09:50", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 60000 },
  { name: "정자차", birthDate: "20.07.14", serviceType: "언어재활",  defaultDays: "2,5", defaultSlot: "09:50~10:40", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 80000 },
  { name: "강카타", birthDate: "19.09.03", serviceType: "언어재활",  defaultDays: "2,5", defaultSlot: "10:40~11:30", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 70000 },
  { name: "윤파하", birthDate: "17.12.18", serviceType: "언어재활",  defaultDays: "3",   defaultSlot: "13:30~14:20", defaultUnit: 65000, defaultTarget: 4, monthlyCopay: 80000 },
  { name: "임가다", birthDate: "20.02.25", serviceType: "언어재활",  defaultDays: "1,4", defaultSlot: "13:30~14:20", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 70000 },
  { name: "송라마", birthDate: "21.06.07", serviceType: "언어재활",  defaultDays: "1,4", defaultSlot: "14:20~15:10", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 90000 },
  { name: "조바사", birthDate: "19.04.11", serviceType: "언어재활",  defaultDays: "2,5", defaultSlot: "13:30~14:20", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 60000 },
  { name: "한아자", birthDate: "20.10.21", serviceType: "놀이치료",  defaultDays: "2,5", defaultSlot: "15:10~16:00", defaultUnit: 65000, defaultTarget: 8, monthlyCopay: 80000 },
  { name: "백차카", birthDate: "18.08.05", serviceType: "놀이치료",  defaultDays: "3",   defaultSlot: "16:00~16:50", defaultUnit: 65000, defaultTarget: 4, monthlyCopay: 70000 },
];

function pad(n: number) { return String(n).padStart(2, "0"); }

// 회기 결과 텍스트 풀 — 임상 톤으로 다양하게.
const RESULT_TEXTS = [
  "고빈도 어휘 ‘사과·바나나·포도’ 명명 활동에서 시각 단서 제공 시 정반응. 자발 산출은 부분적.",
  "2어절 조합 ‘엄마 줘’ 발화 시도 적극적. 모방 후 자발 산출 비율 60% 도달.",
  "조음 /ㅅ/ 단어 수준에서 시각·청각 피드백 제공하자 정조음 7/10. 점진적 향상.",
  "이야기 듣고 ‘누가/무엇’ 질문 응답에서 보조 단서 없이 7/10 정답. 이해력 향상.",
  "조사 ‘이/가’ 변별 활동에서 모델링 후 정반응. 일반화 단계로 진행 예정.",
  "수용 어휘 ‘과일·동물·교통수단’ 분류 활동 적극 참여. 분류 정확도 8/10.",
  "감정 어휘 ‘기쁘다·슬프다·화나다’ 그림 매칭 정반응. 자발 산출은 모델링 필요.",
  "문장 따라 말하기 4어절 수준 완수. 단어 정확도 우수.",
];

// 부모 상담 의견 — 짧게.
const OPINIONS = [
  "가정에서 발화 시도가 늘어 부모님께서 만족스러워하심. 일관된 피드백 권장.",
  "수업 외 시간에도 학습 어휘 사용 빈도 증가. 다음 단계로 확장 예정.",
  "주의집중 시간이 이전 대비 길어짐. 활동 다양화로 동기 유지 가능.",
];

// (year, month, dim, dow) 로 그 달의 (요일들) 에 해당하는 day 들 반환.
function daysOfMonthByDow(year: number, month: number, dowList: number[]): number[] {
  const dim = new Date(year, month, 0).getDate();
  const result: number[] = [];
  for (let d = 1; d <= dim; d++) {
    if (dowList.includes(new Date(year, month - 1, d).getDay())) result.push(d);
  }
  return result;
}

// 12자리 가짜 승인번호 — 실제처럼 5009 로 시작.
let apprCounter = 1;
function genApprNum(): string {
  apprCounter += 1;
  const seq = String(apprCounter).padStart(8, "0");
  return `5009${seq}`;
}

async function main() {
  console.log("🌱 데모 데이터 시드 시작...");

  // 1. 기존 demo 계정 통째로 삭제 (재실행 가능하게)
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log("기존 demo 계정 삭제 중...");
    if (existing.centerId) {
      // cascade 로 모든 데이터 같이 삭제됨 (User → Therapist → ChildService → Schedule/Record)
      await prisma.center.delete({ where: { id: existing.centerId } }).catch(async () => {
        // user.centerId 만 끊고 강제 삭제 fallback
        await prisma.user.delete({ where: { id: existing.id } });
      });
    } else {
      await prisma.user.delete({ where: { id: existing.id } });
    }
  }

  // 2. 센터 + Therapist + User 생성
  const center = await prisma.center.create({
    data: {
      name: CENTER_NAME,
      approvalCode: `DEMO${Date.now().toString().slice(-4)}`,
      address: "서울시 마포구 데모로 1",
      phone: "02-1234-5678",
      serviceTypes: "언어재활,놀이치료,감각통합치료",
      defaultUnit: 65000,
    },
  });
  console.log(`✓ 센터 생성: ${center.name}`);

  const therapist = await prisma.therapist.create({
    data: { name: DEMO_NAME, centerId: center.id, active: true },
  });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: "OWNER",
      active: true,
      centerId: center.id,
      therapistId: therapist.id,
      therapistType: "언어재활사",
    },
  });
  console.log(`✓ 사용자 생성: ${user.email} / 비밀번호: ${DEMO_PASSWORD}`);

  // 3. 아동 + ChildService 생성
  const services: { id: number; childId: number; name: string; defaultDays: string; defaultSlot: string }[] = [];
  for (const c of CHILDREN) {
    const child = await prisma.child.create({
      data: {
        name: c.name,
        birthDate: c.birthDate,
        mgmtNumber: null,
        memo: null,
        active: true,
        waiting: false,
        centerId: center.id,
        services: {
          create: [{
            serviceType: c.serviceType,
            therapistId: therapist.id,
            defaultSlot: c.defaultSlot,
            defaultDays: c.defaultDays,
            defaultUnit: c.defaultUnit,
            defaultTarget: c.defaultTarget,
            monthlyCopay: c.monthlyCopay,
          }],
        },
      },
      include: { services: true },
    });
    services.push({
      id: child.services[0].id,
      childId: child.id,
      name: c.name,
      defaultDays: c.defaultDays,
      defaultSlot: c.defaultSlot,
    });
  }
  console.log(`✓ 아동 ${CHILDREN.length}명 등록`);

  // 4. 일정표·기록지 — 지난-지난달, 지난달, 이번달
  const now = new Date();
  const months: { year: number; month: number; label: string; recordRatio: number }[] = [];
  for (let offset = -2; offset <= 0; offset++) {
    const total = now.getFullYear() * 12 + now.getMonth() + offset;
    months.push({
      year: Math.floor(total / 12),
      month: (total % 12) + 1,
      label: offset === -2 ? "지난-지난달" : offset === -1 ? "지난달" : "이번달",
      recordRatio: offset === 0 ? 0.4 : 1.0, // 이번달은 40%만 작성 → '미작성 N건' 시연
    });
  }

  for (const m of months) {
    let schedCount = 0;
    let recCount = 0;
    for (let i = 0; i < services.length; i++) {
      const s = services[i];
      const cfg = CHILDREN[i];
      const dowList = cfg.defaultDays.split(",").map(Number);
      const days = daysOfMonthByDow(m.year, m.month, dowList).slice(0, cfg.defaultTarget);
      if (days.length === 0) continue;

      // Schedule
      const schedule = await prisma.schedule.create({
        data: {
          childServiceId: s.id,
          year: m.year,
          month: m.month,
          therapist: DEMO_NAME,
          serviceType: cfg.serviceType,
          target: cfg.defaultTarget,
          mgmtNumber: null,
          pvOrg: CENTER_NAME,
          pvTel: "02-1234-5678",
          pvCharge: DEMO_NAME,
          pvType: cfg.serviceType,
          costUnit: cfg.defaultUnit.toLocaleString("ko-KR"),
          costSelf: cfg.monthlyCopay.toLocaleString("ko-KR"),
          writeDate: `${String(m.year).slice(2)}.${pad(m.month)}.${pad(days[days.length - 1])}`,
          createdById: user.id,
          sessions: {
            create: days.map((d) => ({ day: d, time: cfg.defaultSlot, makeup: false })),
          },
        },
      });
      schedCount += 1;

      // Record — recordRatio 비율만큼만 작성
      if (Math.random() < m.recordRatio) {
        await prisma.record.create({
          data: {
            childServiceId: s.id,
            year: m.year,
            month: m.month,
            org: CENTER_NAME,
            childName: cfg.name,
            childBirth: cfg.birthDate,
            opinion: OPINIONS[i % OPINIONS.length],
            createdById: user.id,
            sessions: {
              create: days.map((d, idx) => {
                const [start, end] = cfg.defaultSlot.split("~");
                return {
                  ordinal: idx + 1,
                  date: `${m.month}/${d}`,
                  startTime: start,
                  endTime: end,
                  voucher: "40",
                  extra: "10",
                  amount: cfg.defaultUnit.toLocaleString("ko-KR"),
                  useDay: String(d),
                  payDay: String(d),
                  apprNumber: genApprNum(),
                  result: RESULT_TEXTS[(i + idx) % RESULT_TEXTS.length],
                  resultExtra: null,
                };
              }),
            },
          },
        });
        recCount += 1;
      }
    }
    console.log(`  ${m.year}년 ${m.month}월 (${m.label}): 일정표 ${schedCount}건 · 기록지 ${recCount}건`);
  }

  console.log("\n✅ 시드 완료!");
  console.log(`   로그인: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("   브라우저: http://localhost:3000");
}

main()
  .catch((e) => { console.error("❌ 시드 실패:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
