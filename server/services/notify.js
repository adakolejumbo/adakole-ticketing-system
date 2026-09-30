// Outbound email via Resend. If RESEND_API_KEY is not set, emails are logged instead.
export async function sendEmail({ to, subject, text }) {
  if (!to) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped: no RESEND_API_KEY] to=${to} subject="${subject}"`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Service Desk <onboarding@resend.dev>',
        to,
        subject,
        text,
      }),
    });
    if (!res.ok) console.error('Email failed', res.status, await res.text());
  } catch (err) {
    console.error('Email error', err.message);
  }
}

export const ticketRef = (id) => `ATS-${id}`;
export const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');
