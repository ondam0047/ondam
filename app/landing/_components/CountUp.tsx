"use client";

import { useEffect, useRef, useState } from "react";

// 화면에 들어오면 0 → end 로 증가. prefers-reduced-motion 이면 즉시 end.
export default function CountUp({
  end,
  duration = 1400,
}: {
  end: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (reduce) {
          setVal(end);
          return;
        }
        let startTs = 0;
        const step = (t: number) => {
          if (!startTs) startTs = t;
          const p = Math.min((t - startTs) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(end * eased));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [end, duration]);

  return <span ref={ref}>{val}</span>;
}
