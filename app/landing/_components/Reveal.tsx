"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

// 화면에 들어오면 is-visible 클래스를 붙여 CSS 트랜지션/애니메이션을 트리거.
// className 에 bi-reveal(자기 페이드) 또는 bi-stagger(자식 순차)를 넘겨 사용.
export default function Reveal({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} ${visible ? "is-visible" : ""}`} style={style}>
      {children}
    </div>
  );
}
