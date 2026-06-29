// hwp→hwpx 변환은 요청마다 JVM(수백 MB RSS·CPU 점유)을 콜드스타트한다.
// 단일 서버(2 vCPU·스왑 없음)에서 동시 변환이 몰리면 메모리 압박 → OOM/과부하 위험.
// 전역 in-process 세마포어로 동시 실행 수를 제한하고, 초과 요청은 짧게 대기하다 거절(429)한다.
// ※ Next.js nodejs 런타임의 모듈은 프로세스당 싱글턴 → pm2 단일 프로세스에서 요청 간 상태 공유.
const MAX_CONCURRENT = Math.max(1, Number(process.env.HWP_CONVERT_CONCURRENCY || 2));
const MAX_QUEUE = Math.max(0, Number(process.env.HWP_CONVERT_MAX_QUEUE || 8));
const ACQUIRE_TIMEOUT_MS = Math.max(1000, Number(process.env.HWP_CONVERT_QUEUE_TIMEOUT_MS || 25_000));

let active = 0;
const waiters: Array<{ resolve: () => void; timer: ReturnType<typeof setTimeout> }> = [];

// 변환 슬롯이 꽉 차서 지금 받을 수 없을 때(큐 초과·대기 타임아웃). 라우트에서 429로 매핑.
export class GateBusyError extends Error {
  constructor() {
    super("지금 변환 요청이 많아요. 잠시 후 다시 시도해 주세요.");
    this.name = "GateBusyError";
  }
}

// 변환 슬롯 확보. 즉시 못 얻으면 큐에서 대기. 큐가 꽉 찼거나 대기 타임아웃이면 GateBusyError.
// ★ 성공 시 반드시 releaseConvertSlot() 으로 반납해야 한다(finally 권장).
export function acquireConvertSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  if (waiters.length >= MAX_QUEUE) return Promise.reject(new GateBusyError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = waiters.findIndex((w) => w.timer === timer);
      if (i >= 0) waiters.splice(i, 1);
      reject(new GateBusyError());
    }, ACQUIRE_TIMEOUT_MS);
    waiters.push({ resolve, timer });
  });
}

// 슬롯 반납. 대기자가 있으면 슬롯을 그대로 넘긴다(active 유지) — 그렇지 않으면 active 감소.
export function releaseConvertSlot(): void {
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  } else {
    active = Math.max(0, active - 1);
  }
}

// 관측/테스트용 — 현재 동시 실행·대기 수.
export function _gateStats() {
  return { active, queued: waiters.length, MAX_CONCURRENT, MAX_QUEUE };
}
