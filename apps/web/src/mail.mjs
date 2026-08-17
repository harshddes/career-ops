export async function sendResendEmail(env, { to, subject, text }) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'resend_unconfigured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Career OS <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: body.slice(0, 300), status: response.status };
  }
  return { ok: true };
}

export const DIGEST_DAILY_CAP = 100;
