// 범용 SMTP 메일러 (Resend/SendGrid/NCP Outbound Mailer 등 SMTP 제공자면 무엇이든).
// .env: SMTP_HOST, SMTP_PORT(기본587), SMTP_SECURE(true=465), SMTP_USER, SMTP_PASS, MAIL_FROM
import nodemailer from "nodemailer";

export function mailerReady(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  if (!mailerReady()) {
    // SMTP 미설정 시: 발송 건너뛰되 흐름은 깨지 않음(서버 로그에만 표시)
    console.warn("[mailer] SMTP 미설정 — 재설정 메일 미발송:", to);
    return;
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  const from = process.env.MAIL_FROM ?? "바로일지 <no-reply@baroilji.com>";
  await transport.sendMail({
    from,
    to,
    subject: "[바로일지] 비밀번호 재설정 안내",
    text: `비밀번호 재설정 링크 (1시간 이내 유효):\n${link}\n\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
    html: `<div style="font-family:'Apple SD Gothic Neo',sans-serif;line-height:1.7;color:#222">
      <p>안녕하세요, <b>바로일지</b>입니다.</p>
      <p>비밀번호 재설정을 요청하셨어요. 아래 버튼을 눌러 새 비밀번호를 설정하세요. <b>(1시간 이내 유효)</b></p>
      <p style="margin:20px 0"><a href="${link}" style="display:inline-block;padding:12px 22px;background:#5B8FCF;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">비밀번호 재설정</a></p>
      <p style="color:#888;font-size:13px">버튼이 안 되면 이 주소를 붙여넣으세요:<br>${link}</p>
      <p style="color:#888;font-size:13px">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
    </div>`,
  });
}
