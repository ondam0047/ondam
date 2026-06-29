import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isHwpConvert } from "@/lib/feature-flags";
import { normalizeHwpxZip } from "@/lib/hwpx";
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 양식 .hwp 는 보통 수백 KB — 20MB 면 충분히 넉넉
const JAR = process.env.HWP2HWPX_JAR || "/opt/baroilji/bin/hwp2hwpx-cli.jar";
const JAVA = process.env.JAVA_BIN || "java";
const TIMEOUT_MS = 30_000;

// 업로드한 한글 .hwp 를 .hwpx 로 변환해 돌려준다(우리 센터 양식 자동 변환용).
// hwp2hwpx(자바) 를 1회 실행 → 결과 zip 을 바로일지·한글이 읽는 표준형으로 정규화.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  // .hwp 자동 변환은 아직 베타 계정 전용 — 화이트리스트 밖이면 차단.
  if (!isHwpConvert(user.email)) {
    return Response.json({ error: "이 기능은 아직 베타 계정에서만 사용할 수 있어요." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "파일이 너무 커요(최대 20MB)." }, { status: 413 });

  const inBuf = Buffer.from(await file.arrayBuffer());
  // .hwp(한글 5.x)는 OLE2 복합문서 — 매직바이트로 빠르게 검증(엉뚱한 파일·이미 .hwpx 차단).
  const ole2 = inBuf.length > 8 && inBuf.readUInt32LE(0) === 0xe011cfd0 && inBuf.readUInt32LE(4) === 0xe11ab1a1;
  if (!ole2) {
    return Response.json(
      { error: "편집 가능한 한글 .hwp 파일이 아니에요. (.hwpx·이미지 한글·스캔본은 변환 대상이 아니에요)" },
      { status: 422 },
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "hwpconv-"));
  const inPath = join(dir, "in.hwp");
  const outPath = join(dir, "out.hwpx");
  try {
    await writeFile(inPath, inBuf);
    await runConverter(inPath, outPath);
    const rawHwpx = await readFile(outPath);
    const norm = normalizeHwpxZip(rawHwpx); // 데이터 디스크립터 zip → 바로일지/한글 표준 zip
    return new Response(new Uint8Array(norm), {
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": "attachment; filename=converted.hwpx",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "변환 중 문제가 생겼어요.";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runConverter(inPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(JAVA, ["-jar", JAR, inPath, outPath], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => { err += String(d); });
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("변환 시간이 초과됐어요. 파일이 너무 복잡할 수 있어요.")); }, TIMEOUT_MS);
    proc.on("error", (e) => {
      clearTimeout(timer);
      // ENOENT = java 또는 jar 없음 → 서버 환경 문제
      reject(new Error("변환기를 실행하지 못했어요(서버 변환 환경 미설정). 한글에서 .hwpx 로 저장해 올려주세요. [" + e.message + "]"));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error("변환에 실패했어요(손상되었거나 지원하지 않는 .hwp 일 수 있어요). 한글에서 .hwpx 로 저장해 올려주세요." + (err.trim() ? ` [${err.trim().slice(0, 200)}]` : "")));
    });
  });
}
