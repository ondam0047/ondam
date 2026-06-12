"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

type Role = "OWNER" | "ADMIN" | "THERAPIST";

// 사용자별로 한 번씩만 실행 — 환영 모달의 표시 기록과 동일한 패턴.
function tourKey(userId: number) {
  return `baroilji_tour_done_v1_${userId}`;
}

const COMMON_STEPS = [
  {
    selector: '[data-tour="dash"]',
    title: "대시보드",
    description: "오늘 회기·이번 달 진행률·미작성 기록지 등 본인 작업 현황을 한 눈에 봅니다.",
  },
  {
    selector: '[data-tour="sched"]',
    title: "일정표",
    description: "아동·요일 패턴을 골라 한 달치 회기를 자동 생성하고 한글파일(.hwpx)로 다운받아요.",
  },
  {
    selector: '[data-tour="rec"]',
    title: "기록지",
    description: "회기마다 결과를 입력. 전자바우처 엑셀을 올려 자동 채움도 가능해요.",
  },
  {
    selector: '[data-tour="appr"]',
    title: "결제 겹침 찾기",
    description: "지자체 점검 전 엑셀을 올려서 결제 시간 겹침을 자동 자가 점검.",
  },
  {
    selector: '[data-tour="month"]',
    title: "이번 달",
    description: "이 달 전 아동의 일정·기록지 상태를 한눈에 보고, 전체를 ZIP으로 한 번에 받아요.",
  },
  {
    selector: '[data-tour="child"]',
    title: "내 아동",
    description: "담당 아동을 등록·수정. 일정표에서 + 새 아동 으로도 즉시 등록할 수 있어요.",
  },
  {
    selector: '[data-tour="set"]',
    title: "내 설정",
    description: "이름·치료사 종류·소속 센터명·회기 시간대·수기 모드까지 — 가입 정보 전부 여기서 수정합니다.",
  },
  {
    selector: '[data-tour="help"]',
    title: "도움말",
    description: "이 투어 다시 보기, PDF 매뉴얼, 단계별 사용 안내 등.",
  },
];

export default function Tour({ userId, role }: { userId: number; role: Role }) {
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

    // 요소가 실제로 화면에 보이고 뷰포트 안에 있는지 검사 (숨겨진/화면 밖 타깃 배제).
    const isVisible = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.offsetParent === null) return false;
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 && r.height > 0 &&
        r.left >= 0 && r.top >= 0 &&
        r.right <= window.innerWidth && r.bottom <= window.innerHeight
      );
    };

    // 환영 모달이 열려있을 수 있으니 닫힐 때까지 잠시 기다림.
    const start = () => {
      const steps = COMMON_STEPS.filter((s) => isVisible(document.querySelector(s.selector)));
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
          element: s.selector,
          popover: {
            title: s.title,
            description: s.description,
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
    const wait = () => {
      // 환영 모달은 zIndex 50 modal-bg 형식이 아니고 inline style fixed inset:0 .
      // 간단 휴리스틱: body 의 첫 fixed 요소가 사라질 때까지.
      // 너무 정교하게 가지 말고, 500ms 후 그냥 시작.
      const t = window.setTimeout(start, 600);
      return () => window.clearTimeout(t);
    };
    const cleanup = wait();

    return () => {
      cleanup();
      drvRef.current?.destroy();
    };
  }, [userId, role]);

  return null;
}
