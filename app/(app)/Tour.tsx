"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

// 사용자별로 한 번씩만 실행 — 환영 모달의 표시 기록과 동일한 패턴.
function tourKey(userId: number) {
  return `baroilji_tour_done_v1_${userId}`;
}

// 탭별 설명 사전 — 사이드바의 data-tour 값을 키로 사용.
// ⚠️ 순서는 여기서 정하지 않는다. 실제 사이드바 DOM 순서를 그대로 따라가므로
//    탭이 추가·삭제·재정렬돼도 투어가 자동으로 사이드바와 일치한다.
//    새 탭을 만들면 Sidebar 항목에 data-tour 를 주고 여기에 한 줄만 추가하면 됨.
const TOUR_COPY: Record<string, { title: string; description: string }> = {
  dash:    { title: "대시보드",      description: "오늘 회기·이번 달 진행률·미작성 기록지 등 본인 작업 현황을 한 눈에 봅니다." },
  month:   { title: "이번 달",       description: "이 달 전 아동의 일정·기록지 상태를 한눈에 보고, 전체를 ZIP으로 한 번에 받아요." },
  sched:   { title: "일정표",        description: "아동·요일 패턴을 골라 한 달치 회기를 자동 생성하고 한글파일(.hwpx)로 다운받아요." },
  rec:     { title: "기록지",        description: "회기마다 결과를 입력. 전자바우처 엑셀을 올려 자동 채움도 가능해요." },
  child:   { title: "내 아동",       description: "담당 아동을 등록·수정. 일정표에서 + 새 아동 으로도 즉시 등록할 수 있어요." },
  appr:    { title: "결제 겹침 찾기", description: "지자체 점검 전 엑셀을 올려서 결제 시간 겹침을 자동 자가 점검." },
  tools:   { title: "바로툴",         description: "발음·말속도·조음 등 음성 학습 보조 도구 모음이에요." },
  support: { title: "기타지원사업",   description: "발달재활 바우처 외 지원사업 기록지도 바로일지에서 작성해 한글로 출력해요." },
  closed:  { title: "종결함",         description: "종결한 아동을 따로 보관해요. 필요하면 다시 되돌릴 수 있어요." },
  set:     { title: "내 설정",        description: "이름·치료사 종류·소속 센터명·회기 시간대·수기 모드까지 — 가입 정보 전부 여기서 수정합니다." },
  forms:   { title: "우리 센터 양식", description: "우리 센터 기록지·일정표(.hwpx)를 올리면 칸을 자동 인식해 출력 양식으로 써요." },
  help:    { title: "도움말",         description: "이 투어 다시 보기, PDF 매뉴얼, 단계별 사용 안내 등." },
};

export default function Tour({ userId }: { userId: number }) {
  const drvRef = useRef<Driver | null>(null);

  useEffect(() => {
    const KEY = tourKey(userId);
    try {
      if (localStorage.getItem(KEY)) return;
      // 환영 모달이 아직 안 닫혔으면(첫 방문) 이번엔 투어를 띄우지 않음 — 오버레이 겹침 방지.
      // 환영 모달을 닫은 뒤 다음 화면 이동 때 투어가 실행됨.
      if (!localStorage.getItem(`baroilji_welcome_seen_v1_${userId}`)) return;
    } catch { return; }

    // 좁은 화면(모바일)에선 사이드바가 화면 밖(translateX(-100%))으로 숨겨져 있어
    // 투어 타깃이 DOM 엔 있지만 보이지 않음 → 어두운 오버레이만 전체에 깔리고
    // 클릭이 막히는 "검은 화면" 버그가 됨. 좁은 화면에선 자동 투어를 아예 띄우지 않음.
    if (window.innerWidth <= 820) return;

    // 요소가 실제로 렌더되어 화면에 보이는지 검사.
    // (세로 위치는 보지 않음 — 항목이 많아 접힌(below-fold) 탭도 단계에 포함하고,
    //  driver.js 가 하이라이트 때 알아서 스크롤해 보여줌. left>=0 으로 화면 밖 사이드바만 배제.)
    const isVisible = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.offsetParent === null) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= 0;
    };

    const start = () => {
      // 사이드바에 실제로 렌더된 data-tour 요소들을 DOM 순서대로 수집 →
      // 단계 순서 = 사이드바 메뉴 순서. 설명 사전에 없거나 안 보이는 탭은 조용히 건너뜀.
      const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-tour]"))
        .filter(isVisible)
        .map((el) => ({ el, copy: TOUR_COPY[el.dataset.tour ?? ""] }))
        .filter((s): s is { el: HTMLElement; copy: { title: string; description: string } } => Boolean(s.copy));

      // 보이는 타깃이 하나도 없으면 투어를 띄우지 않음 — 빈 오버레이로 화면이 막히는 것 방지.
      if (steps.length === 0) return;

      const drv = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: "다음 →",
        prevBtnText: "← 이전",
        doneBtnText: "끝내기",
        progressText: "{{current}} / {{total}}",
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 8,
        popoverClass: "baroilji-tour",
        steps: steps.map((s) => ({
          element: s.el,
          popover: {
            title: s.copy.title,
            description: s.copy.description,
            side: "right",
            align: "start",
          },
        })),
        onDestroyed: () => {
          try { localStorage.setItem(KEY, "1"); } catch {}
        },
      });
      drvRef.current = drv;
      drv.drive();
    };

    // 환영 모달이 화면에 있는 동안엔 시작 미룸 (모달 사라지면 시작).
    const t = window.setTimeout(start, 600);

    return () => {
      window.clearTimeout(t);
      drvRef.current?.destroy();
    };
  }, [userId]);

  return null;
}
