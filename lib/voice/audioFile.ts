// 업로드 오디오 파일(wav/mp3/m4a/webm 등)을 모노 Float32 PCM 으로 디코드.
// 브라우저 AudioContext.decodeAudioData 사용 — 서버 업로드 없음.
export interface DecodedAudio {
  data: Float32Array;
  sampleRate: number;
  duration: number; // sec
}

export async function decodeAudioFile(file: Blob): Promise<DecodedAudio> {
  const arrayBuf = await file.arrayBuffer();
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    const ch = audioBuf.getChannelData(0);
    const data = new Float32Array(ch.length);
    data.set(ch);
    return { data, sampleRate: audioBuf.sampleRate, duration: audioBuf.duration };
  } finally {
    ctx.close().catch(() => undefined);
  }
}
