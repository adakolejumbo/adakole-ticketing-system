// Optional outbound email via Resend. Silently skipped if not configured.
export async function emailRequester({ to, subject, text }) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
    });
  } catch {
    /* delivery failures must not block the agent */
  }
}
