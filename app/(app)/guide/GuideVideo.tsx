"use client";

// 도움말 섹션 상단에 기능별 사용법 영상을 넣는 플레이어.
// 포스터(썸네일) → 클릭하면 재생. 나레이션이 있어 자동재생은 하지 않음.
// 영상은 NCP Object Storage 공개 버킷에서 서빙 (NEXT_PUBLIC_GUIDE_MEDIA_BASE).
// 환경변수가 없으면 아무것도 렌더하지 않아 업로드 전에도 페이지가 안전하게 동작.

import { useState } from "react";

const BASE = process.env.NEXT_PUBLIC_GUIDE_MEDIA_BASE || "";

export default function GuideVideo({ slug, title }: { slug: string; title: string }) {
  const [play, setPlay] = useState(false);
  if (!BASE) return null;

  const src = `${BASE}/${slug}.mp4`;
  const poster = `${BASE}/${slug}.jpg`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "#000",
        marginBottom: 18,
      }}
    >
      {play ? (
        <video
          src={src}
          poster={poster}
          controls
          autoPlay
          playsInline
          preload="auto"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlay(true)}
          aria-label={`${title} 사용법 영상 재생`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            padding: 0,
            cursor: "pointer",
            backgroundImage: `url(${poster})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(0,0,0,.55)",
              boxShadow: "0 6px 20px rgba(0,0,0,.35)",
            }}
          >
            <span
              style={{
                marginLeft: 4,
                borderStyle: "solid",
                borderWidth: "12px 0 12px 20px",
                borderColor: "transparent transparent transparent #fff",
              }}
            />
          </span>
          <span
            style={{
              position: "absolute",
              left: 12,
              bottom: 10,
              background: "rgba(0,0,0,.6)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 999,
            }}
          >
            ▶ 사용법 영상
          </span>
        </button>
      )}
    </div>
  );
}
