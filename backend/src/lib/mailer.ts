import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

export type Mail = { to: string; subject: string; text: string };

/** MAIL_MODE=memory일 때 보낸 메일이 쌓인다 (테스트용) */
export const sentMails: Mail[] = [];

const transport =
  env.MAIL_MODE === "smtp"
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;

export async function sendMail(mail: Mail): Promise<void> {
  if (env.MAIL_MODE === "memory") {
    sentMails.push(mail);
    return;
  }
  if (!transport) {
    logger.info({ to: mail.to, subject: mail.subject, text: mail.text }, "메일 (MAIL_MODE=console, 실제 발송 안 함)");
    return;
  }
  try {
    await transport.sendMail({ from: env.MAIL_FROM, ...mail });
  } catch (err) {
    logger.error({ err, to: mail.to, subject: mail.subject }, "메일 발송 실패");
    throw err;
  }
}
