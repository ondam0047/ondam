// 같은 아동·같은 달을 두 곳(같은 브라우저의 두 탭 등)에서 열어 두었을 때
// "나중에 저장한 쪽이 앞선 저장을 통째로 지우는" 사고를 막기 위한 낙관적 잠금(optimistic lock).
//
// 왜 필요한가: 기록지·일정표 저장은 '전부 지우고 다시 넣기'(deleteMany → createMany)라
// 병합이 아니라 교체다. 1계정 1기기(lib/auth.ts)라 다른 PC 는 401 로 막히지만,
// 같은 브라우저의 두 탭은 쿠키가 같아 둘 다 유효하다. 게다가 자동저장이 1.8초마다 돌기 때문에
// 한쪽은 열어 두기만 해도(그 탭에서 한 번이라도 편집했다면) 다른 쪽 내용을 지운다.
//
// 방식: 클라이언트가 '자기가 불러온 시점의 updatedAt'을 함께 보내고, 서버는 트랜잭션 안에서
// `UPDATE ... WHERE id=? AND updatedAt=?` 한 문장으로 대조+갱신(compare-and-swap)한다.
// 트랜잭션 밖에서 읽고 비교하면 검사 자체가 경합에 노출된다.
// (PostgreSQL READ COMMITTED 에서 이 UPDATE 는 앞선 트랜잭션의 커밋을 기다린 뒤 최신 행으로
//  조건을 다시 평가하므로, 진 쪽은 0 행이 갱신되어 확실히 충돌로 잡힌다.)
//
// 스키마 변경은 없다 — Record.updatedAt / Schedule.updatedAt 이 이미 @updatedAt 이다.

export const SAVE_CONFLICT_STATUS = 409;

/** 저장 요청에 실려 오는 낙관적 잠금 정보 */
export type SaveGuard = {
  /** true 면 서버가 updatedAt 을 대조한다 */
  active: boolean;
  /** 클라이언트가 알고 있는 마지막 저장 시각(없으면 '아직 저장본이 없다'는 뜻) */
  base: Date | null;
};

type GuardBody = { baseUpdatedAt?: string | null; overwrite?: boolean };

/**
 * 요청 본문에서 잠금 정보를 읽는다.
 *  - `baseUpdatedAt` 이 아예 없으면  → 검사하지 않음(옛 클라이언트·다른 호출자 호환).
 *  - `overwrite: true`               → 사용자가 충돌 안내에서 '이 창 내용으로 저장'을 고른 경우. 검사 생략.
 *  - `baseUpdatedAt: null`           → 이 창은 '저장본이 없다'고 알고 있다(첫 저장).
 *  - `baseUpdatedAt: "…ISO…"`        → 그 시각의 저장본 위에서만 쓴다.
 */
export function parseSaveGuard(body: unknown): { ok: true; guard: SaveGuard } | { ok: false } {
  const b = (body ?? {}) as GuardBody;
  const overwrite = b.overwrite === true;
  const has = Object.prototype.hasOwnProperty.call(b, "baseUpdatedAt") && b.baseUpdatedAt !== undefined;
  if (!has) return { ok: true, guard: { active: false, base: null } };
  const raw = b.baseUpdatedAt;
  if (raw === null) return { ok: true, guard: { active: !overwrite, base: null } };
  if (typeof raw !== "string") return { ok: false };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, guard: { active: !overwrite, base: d } };
}

/** 트랜잭션 안에서 "그 사이 다른 곳이 저장했다"를 알리는 신호 (롤백까지 함께 일어난다) */
export class StaleWriteError extends Error {
  readonly rowId: number;
  readonly serverUpdatedAt: Date | null;
  constructor(rowId: number, serverUpdatedAt: Date | null) {
    super("stale write");
    this.name = "StaleWriteError";
    this.rowId = rowId;
    this.serverUpdatedAt = serverUpdatedAt;
  }
}

/**
 * 같은 (아동, 연, 월) 을 두 곳이 동시에 '처음' 저장해 create 가 진 경우.
 * ⚠ P2002 를 통째로 충돌로 보면 안 된다 — 회기 unique(recordId, ordinal)/(scheduleId, day) 위반은
 *   payload 가 깨진 것이라 '다른 창에서 먼저 저장'이 아니고, 덮어쓰기로도 못 피해 막다른 길이 된다.
 *   그래서 create 문장에서 난 P2002 만 여기로 승격시키고 나머지는 500 으로 흘린다.
 */
export class RacedCreateError extends Error {
  constructor() {
    super("raced create");
    this.name = "RacedCreateError";
  }
}

/** Prisma unique 제약 위반(P2002). create 문장을 감쌀 때만 쓴다(위 주석 참고). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * 충돌 응답(409). 작성분을 버리는 결정이므로 화면이 사용자에게 선택지를 주려면
 * '서버 저장본이 무엇인지'(id)와 '지금 서버 시각'(serverUpdatedAt)이 필요하다.
 */
export function saveConflictResponse(e: unknown): Response | null {
  if (e instanceof StaleWriteError) {
    return Response.json(
      {
        error: "conflict",
        code: "stale",
        id: e.rowId,
        serverUpdatedAt: e.serverUpdatedAt ? e.serverUpdatedAt.toISOString() : null,
      },
      { status: SAVE_CONFLICT_STATUS },
    );
  }
  if (e instanceof RacedCreateError) {
    // 같은 (아동, 연, 월) 을 두 곳이 동시에 처음 저장 → 한쪽만 성공한다.
    return Response.json({ error: "conflict", code: "raced", id: null, serverUpdatedAt: null }, { status: SAVE_CONFLICT_STATUS });
  }
  return null;
}

// ─── 클라이언트 쪽 ───────────────────────────────────────────────────────────

/**
 * 화면이 들고 있는 기준시각. **어느 (아동, 연, 월) 것인지까지** 함께 기억한다.
 * 값의 출처는 오직 서버 응답(불러오기 / 저장) 뿐이다 — 목록·임시본 같은 2차 자료로 세우지 않는다.
 *  - `null`            = **모른다**(아직 못 읽었거나 조회가 실패했다)
 *  - `{ stamp: null }` = 서버에 이 달 저장본이 **없음을 확인**했다(첫 저장)
 *  - `{ stamp: "…" }`  = 그 시각의 저장본 위에서 편집 중이다
 */
export type SaveBase = { csId: number; y: number; m: number; stamp: string | null };

/** 지금 편집 중인 (아동, 연, 월) 의 기준시각을 알고 있는가 */
export function baseMatches(b: SaveBase | null, csId: number, y: number, m: number): boolean {
  return b !== null && b.csId === csId && b.y === y && b.m === m;
}

/**
 * 저장 payload 에 넣을 조각.
 * ⚠ **모르면 키를 아예 넣지 않는다** — `baseUpdatedAt: null` 은 '저장본이 없다고 확신한다'는 뜻이라
 *   조회 한 번 실패한 것을 충돌로 단정해 저장을 멈춰버린다(저장 정지가 덮어쓰기보다 피해가 크다).
 */
export function baseField(b: SaveBase | null, csId: number, y: number, m: number): { baseUpdatedAt?: string | null } {
  return baseMatches(b, csId, y, m) ? { baseUpdatedAt: (b as SaveBase).stamp } : {};
}

/**
 * 저장 성공 응답에서 '다음 저장에 쓸 기준시각'을 뽑는다.
 * ⚠ 이걸 갱신하지 않으면 두 번째 저장부터 자기 자신과 충돌해 저장이 완전히 멈춘다(가장 큰 함정).
 */
export function stampFromSaveResponse(json: unknown): string | null {
  const v = (json as { updatedAt?: unknown } | null)?.updatedAt;
  return typeof v === "string" ? v : null;
}

/** 불러오기 응답(Record·Schedule 원본)에서 기준시각을 뽑는다 */
export function stampFromLoaded(row: unknown): string | null {
  const v = (row as { updatedAt?: unknown } | null)?.updatedAt;
  return typeof v === "string" ? v : null;
}
