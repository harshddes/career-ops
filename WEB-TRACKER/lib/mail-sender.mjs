import nodemailer from 'nodemailer';
import { digestRecipients } from './today-activity.mjs';

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseBoolean(value, fallback = false) {
  const text = cleanText(value).toLowerCase();
  if (!text) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(text);
}

export function smtpConfigFromEnv(env = process.env) {
  const port = Number.parseInt(env.SMTP_PORT || '587', 10);
  return {
    host: cleanText(env.SMTP_HOST),
    port: Number.isInteger(port) ? port : 587,
    secure: parseBoolean(env.SMTP_SECURE, false),
    requireTLS: parseBoolean(env.SMTP_REQUIRE_TLS, true),
    user: cleanText(env.SMTP_USER),
    pass: cleanText(env.SMTP_PASS),
    from: cleanText(env.SMTP_FROM || env.EMAIL_FROM || env.SMTP_USER),
    recipients: digestRecipients(env),
  };
}

export function validateSmtpConfig(config = smtpConfigFromEnv()) {
  const missing = [];
  for (const field of ['host', 'user', 'pass', 'from']) {
    if (!config[field]) missing.push(field);
  }
  if (!config.recipients?.length) missing.push('recipients');
  return {
    ok: missing.length === 0,
    missing,
  };
}

export function createTransporter(config = smtpConfigFromEnv()) {
  const validation = validateSmtpConfig(config);
  if (!validation.ok) {
    throw new Error(`missing SMTP configuration: ${validation.missing.join(', ')}`);
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });
}

export async function sendMail(message, { env = process.env, config = smtpConfigFromEnv(env) } = {}) {
  const transporter = createTransporter(config);
  return transporter.sendMail({
    from: config.from,
    to: config.recipients,
    ...message,
  });
}
