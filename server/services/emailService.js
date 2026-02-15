/**
 * Send email via Gmail SMTP (nodemailer).
 * Requires EMAIL_USER and EMAIL_APP_PASSWORD in env.
 * Gmail: use an App Password (Google Account → Security → 2-Step Verification → App passwords).
 */
import nodemailer from "nodemailer";

const FROM_EMAIL = process.env.EMAIL_USER || "margo.joe708@gmail.com";

function getTransporter() {
  const user = process.env.EMAIL_USER || "margo.joe708@gmail.com";
  const pass = process.env.EMAIL_APP_PASSWORD;
  if (!pass) {
    throw new Error("EMAIL_APP_PASSWORD is not set. Use a Gmail App Password.");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

export function isEmailConfigured() {
  return !!process.env.EMAIL_APP_PASSWORD;
}

/**
 * Send an email.
 * @param {{ to: string, subject: string, text: string }} options
 */
export async function sendEmail({ to, subject, text }) {
  const transport = getTransporter();
  await transport.sendMail({
    from: FROM_EMAIL,
    to: to || FROM_EMAIL,
    subject: subject || "(No subject)",
    text: text || "",
  });
}
