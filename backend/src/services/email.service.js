import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

const resendApiKey = process.env.RESENDEMAIL_API_KEY;
const senderEmail = process.env.RESEND_SENDER_EMAIL
  || (process.env.NODE_ENV === "production" ? "" : "Teamora@shubhamsah.com.np");
// Optional: reply-to address (helps trust/deliverability). Falls back to sender.
const replyToEmail = process.env.RESEND_REPLY_TO || senderEmail;
// Optional: if set, a "Open Teamora" button is shown in emails.
const appUrl = process.env.APP_URL || process.env.CLIENT_URL || "https://localhost:5173/";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

/* ---------- Design tokens ---------- */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BRAND = "#4f46e5";
const BRAND_DARK = "#594de3";
const ACCENT = "#14b8a6";
const INK = "#0f172a";
const BODY = "#475569";
const MUTED = "#94a3b8";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";

/* ---------- Reusable blocks ---------- */
const button = (label, url) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
    <tr>
       <td align="center" bgcolor="${BRAND}" style="border-radius:8px;background-color:${BRAND};">
        <a href="${escapeHtml(url)}" target="_blank"
         style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;

const badge = (label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
    <tr>
      <td style="padding:5px 9px;background-color:#f1f5f9;border-radius:5px;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BODY};">
        ${escapeHtml(label)}
      </td>
    </tr>
  </table>`;

const emailLayout = ({ preheader, content }) => `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Teamora</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:${FONT};color:${INK};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;color:#f8fafc;">
      ${escapeHtml(preheader)}${"&nbsp;&zwnj;".repeat(40)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
            <tr>
              <td align="left" style="padding:0 0 16px;font-family:${FONT};font-size:19px;font-weight:750;letter-spacing:-0.7px;color:${INK};">
                team<span style="color:${ACCENT};">o</span>ra
              </td>
            </tr>
            <tr>
              <td style="padding:32px;background-color:#ffffff;border:1px solid ${LINE};border-radius:12px;font-family:${FONT};">
                ${content}
                <p style="margin:30px 0 0;padding-top:18px;border-top:1px solid ${LINE};font-family:${FONT};color:${MUTED};font-size:12px;line-height:1.6;">
                  This is an account notification from Teamora. If you have questions, reply to this email.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 8px 0;font-family:${FONT};color:${MUTED};font-size:11px;line-height:1.5;">
                You're receiving this because of activity on your Teamora account.
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;

/* ---------- Sender (logic unchanged, plus replyTo) ---------- */
const sendTransactionalEmail = async ({ to, subject, text, html, logLabel }) => {
  if (!resend || !senderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    console.error("Email configuration missing: set RESENDEMAIL_API_KEY and RESEND_SENDER_EMAIL.");
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `Teamora <${senderEmail}>`,
      replyTo: replyToEmail,
      to,
      subject,
      text: text.trim(),
      html,
    });

    if (error) {
      console.error(`${logLabel} email error:`, error);
      return false;
    }

    console.log(`${logLabel} email sent:`, data?.id);
    return true;
  } catch (error) {
    console.error(`Failed to send ${logLabel.toLowerCase()} email:`, error);
    return false;
  }
};

/* ---------- Emails ---------- */
export async function regrestationEmail(userEmail, name) {
  const safeName = escapeHtml(name || "there");
  const safeEmail = escapeHtml(userEmail);
  const subject = "Your Teamora account is ready";
  const text = `Hi ${name || "there"},\n\nYour Teamora account (${userEmail}) is ready to use.\n\nYou can now sign in to Teamora.${appUrl ? `\n\nSign in: ${appUrl}` : ""}\n\nThe Teamora Team`;
  const html = emailLayout({
    preheader: "Your Teamora account is ready to use.",
    content: `
      ${badge("Account confirmed")}
      <h1 style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:800;letter-spacing:-0.5px;color:${INK};">Your account is ready, ${safeName}.</h1>
      <p style="margin:0 0 24px;font-family:${FONT};color:${BODY};font-size:15px;line-height:1.75;">Your Teamora account has been verified and is ready to use.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SOFT};border:1px solid ${LINE};border-radius:12px;">
        <tr><td style="padding:16px 18px 4px;font-family:${FONT};color:${MUTED};font-size:11px;font-weight:700;letter-spacing:1px;">ACCOUNT EMAIL</td></tr>
        <tr><td style="padding:0 18px 16px;font-family:${FONT};color:${INK};font-size:15px;font-weight:600;word-break:break-word;">${safeEmail}</td></tr>
      </table>
      <p style="margin:24px 0 0;font-family:${FONT};color:${BODY};font-size:14px;line-height:1.75;">You can sign in whenever you're ready.</p>
      ${appUrl ? button("Open Teamora", appUrl) : ""}
    `,
  });

  return sendTransactionalEmail({ to: userEmail, subject, text, html, logLabel: "Account confirmation" });
}

export async function sendOtp(userEmail, name, otp) {
  const safeName = escapeHtml(name || "there");
  const safeOtp = escapeHtml(otp);
  const subject = "Your Teamora verification code";
  const text = `Hi ${name || "there"},\n\nYour Teamora verification code is ${otp}.\n\nIt expires in 5 minutes. If you didn't request this code, you can ignore this email.\n\nThe Teamora Team`;
  const html = emailLayout({
    preheader: "Your one-time code to verify your Teamora account.",
    content: `
      ${badge("Email verification")}
      <h1 style="margin:0 0 12px;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:800;letter-spacing:-0.5px;color:${INK};">Hi ${safeName},</h1>
      <p style="margin:0 0 24px;font-family:${FONT};color:${BODY};font-size:15px;line-height:1.75;">Enter this code to verify your Teamora account:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;">
        <tr><td align="center" style="padding:26px 12px;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:${BRAND_DARK};">${safeOtp}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-family:${FONT};color:${BODY};font-size:14px;line-height:1.75;">This code expires in <strong style="color:${INK};">5 minutes</strong>. Never share it with anyone.</p>
      <p style="margin:12px 0 0;font-family:${FONT};color:${MUTED};font-size:13px;line-height:1.7;">If you didn't request this code, you can ignore this email.</p>
    `,
  });

  return sendTransactionalEmail({ to: userEmail, subject, text, html, logLabel: "Verification" });
}
export async function sendTeamWelcomeEmail(userEmail, memberName, teamName, inviterName, acceptUrl) {
  const safeName = escapeHtml(memberName || "there");
  const safeTeamName = escapeHtml(teamName || "your team");
  const safeInviterName = escapeHtml(inviterName || "A team admin");
  const subject = "Team invitation to Teamora";
  const text = `Hi ${memberName || "there"},\n\n${inviterName || "A team admin"} invited you to join ${teamName || "a team"} on Teamora. Accept the invitation to join: ${acceptUrl}\n\nSign in or create an account using this email address, then accept the invitation. This link expires in 7 days.\n\nThe Teamora Team`;
  const html = emailLayout({
    preheader: `${inviterName || "A team admin"} invited you to join ${teamName} on Teamora.`,
    content: `
      ${badge("Team invitation")}
      <h1 style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:800;letter-spacing:-0.5px;color:${INK};">You're invited, ${safeName}.</h1>
      <p style="margin:0 0 20px;font-family:${FONT};color:${BODY};font-size:15px;line-height:1.75;"><strong style="color:${INK};">${safeInviterName}</strong> invited you to join <strong style="color:${INK};">${safeTeamName}</strong> on Teamora.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SOFT};border:1px solid ${LINE};border-radius:12px;">
        <tr><td style="padding:16px 18px 4px;font-family:${FONT};color:${MUTED};font-size:11px;font-weight:700;letter-spacing:1px;">TEAM</td></tr>
        <tr><td style="padding:0 18px 16px;font-family:${FONT};color:${INK};font-size:16px;font-weight:700;word-break:break-word;">${safeTeamName}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-family:${FONT};color:${BODY};font-size:14px;line-height:1.75;">Use the invited email address to sign in or create an account. You will join the team after accepting this invitation.</p>
      ${button("Accept invitation", acceptUrl)}
      <p style="margin:14px 0 0;font-family:${FONT};color:${MUTED};font-size:12px;line-height:1.6;">This invitation link expires in 7 days.</p>
    `,
  });

  return sendTransactionalEmail({ to: userEmail, subject, text, html, logLabel: "Team invitation" });
}
export async function sendTeamRemovalEmail(userEmail, memberName, teamName, removerName) {
  const safeName = escapeHtml(memberName || "there");
  const safeTeamName = escapeHtml(teamName || "your team");
  const safeRemoverName = escapeHtml(removerName || "A team admin");
  const subject = "Removed from Teamora team";
  const text = `Hi ${memberName || "there"},\n\n${removerName || "A team admin"} removed you from ${teamName} on Teamora. You no longer have access to the team's projects and tasks.${appUrl ? `\n\nOpen Teamora: ${appUrl}` : ""}\n\nThe Teamora Team`;
  const html = emailLayout({
    preheader: `${removerName || "A team admin"} removed you from ${teamName} on Teamora.`,
    content: `
      ${badge("Team removal")}
      <h1 style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:800;letter-spacing:-0.5px;color:${INK};">You're no longer on the team, ${safeName}.</h1>
      <p style="margin:0 0 20px;font-family:${FONT};color:${BODY};font-size:15px;line-height:1.75;"><strong style="color:${INK};">${safeRemoverName}</strong> removed you from <strong style="color:${INK};">${safeTeamName}</strong> on Teamora.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SOFT};border:1px solid ${LINE};border-radius:12px;">
        <tr><td style="padding:16px 18px 4px;font-family:${FONT};color:${MUTED};font-size:11px;font-weight:700;letter-spacing:1px;">TEAM</td></tr>
        <tr><td style="padding:0 18px 16px;font-family:${FONT};color:${INK};font-size:16px;font-weight:700;word-break:break-word;">${safeTeamName}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-family:${FONT};color:${BODY};font-size:14px;line-height:1.75;">You no longer have access to the team's projects and assigned tasks.</p>
      ${appUrl ? button("Open Teamora", appUrl) : ""}
    `,
  });

  return sendTransactionalEmail({ to: userEmail, subject, text, html, logLabel: "Team removal" });
}