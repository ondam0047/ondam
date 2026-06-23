"use client";

// 서버 액션 form 안에서 제출 전 확인창을 띄우는 버튼. enabled=false면 그냥 제출.
export default function ConfirmSubmit({
  message,
  enabled = true,
  className,
  style,
  children,
}: {
  message: string;
  enabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      onClick={(e) => { if (enabled && !window.confirm(message)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
