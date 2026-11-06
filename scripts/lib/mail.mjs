// Failure alert by email over SMTP (e.g. Gmail with an app password:
// SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=<gmail address>,
// SMTP_PASS=<16-character app password>). Never includes secrets.
import nodemailer from "nodemailer";

export const ALERT_EMAIL = process.env.ALERT_EMAIL || "pauljomy92@gmail.com";

export async function sendFailureEmail({ subject, error, topic, attempt }) {
  const { SMTP_HOST, SMTP_PORT = "465", SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error(`✖ Can't email ${ALERT_EMAIL}: SMTP_HOST, SMTP_USER and SMTP_PASS are not all set.`);
    return false;
  }
  const run = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "local run";
  const text = [
    "The daily Safety Index post could not be created.",
    "",
    `Topic: ${topic ? `#${topic.n} ${topic.title}` : "(not picked yet)"}`,
    `Failed attempts in a row: ${attempt ?? 1}`,
    `Run: ${run}`,
    "",
    "Error:",
    String(error?.stack ?? error).replace(/sk-ant-[\w-]+/g, "[redacted]").slice(0, 4000),
    "",
    "Nothing was published. The scheduler retries automatically in a few hours;",
    "if the API key, credits or model are the problem, fix them in the repository's secrets.",
  ].join("\n");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({ from: MAIL_FROM || SMTP_USER, to: ALERT_EMAIL, subject, text });
  console.log(`✉ Failure email sent to ${ALERT_EMAIL}`);
  return true;
}
