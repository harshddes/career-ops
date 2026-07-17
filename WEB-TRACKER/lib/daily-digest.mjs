import { buildExportBuffer } from './dashboard-export.mjs';
import { writeDailyActivityCsv } from './daily-activity-csv.mjs';
import { digestRecipients, getTodayActivity } from './today-activity.mjs';
import { sendMail, smtpConfigFromEnv } from './mail-sender.mjs';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function summaryList(summary = {}) {
  return [
    ['All dashboard events today', summary.dashboard_events_today],
    ['U-M research events', summary.umich_research_events_today],
    ['Job events', summary.job_events_today],
    ['PhD option events', summary.phd_events_today],
    ['Applied today', summary.applied_today],
    ['Contacted today', summary.contacted_today],
    ['Followed today', summary.followed_today],
    ['Follow-ups due today', summary.followups_due_today],
    ['Overdue follow-ups', summary.overdue_followups],
  ];
}

function htmlTable(rows = []) {
  if (!rows.length) return '<p>No rows in this section.</p>';
  const previewRows = rows.slice(0, 12);
  const body = previewRows.map(row => `
    <tr>
      <td>${escapeHtml(row.company)}</td>
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.source)}</td>
    </tr>
  `).join('');
  const more = rows.length > previewRows.length
    ? `<p>${rows.length - previewRows.length} more row(s) are included in the attachments.</p>`
    : '';
  return `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr><th>Company / Institution</th><th>Title / Person</th><th>Status</th><th>Source</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${more}
  `;
}

export async function buildDailyDigest({ date = '', timeZone = process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ } = {}) {
  const activity = getTodayActivity({ date, timeZone });
  writeDailyActivityCsv(activity);
  const xlsx = await buildExportBuffer({ scope: 'today-activity', format: 'xlsx', date: activity.date, timeZone: activity.timeZone });
  const csv = await buildExportBuffer({ scope: 'today-activity', format: 'csv', date: activity.date, timeZone: activity.timeZone });
  const attachments = [
    {
      filename: xlsx.filename,
      content: xlsx.buffer,
      contentType: xlsx.contentType,
      contentDisposition: 'attachment',
    },
    {
      filename: csv.filename,
      content: csv.buffer,
      contentType: csv.contentType,
      contentDisposition: 'attachment',
    },
  ];
  const subject = `Career-Ops Daily Digest - ${activity.date}`;
  const recipientsLine = digestRecipients().join(', ');
  const summaryItems = summaryList(activity.summary);
  const summaryHtml = summaryItems
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${Number(value || 0)}</li>`)
    .join('');
  const summaryText = summaryItems
    .map(([label, value]) => `${label}: ${Number(value || 0)}`)
    .join('\n');

  return {
    activity,
    subject,
    text: [
      `Career-Ops Daily Digest - ${activity.date}`,
      `Timezone: ${activity.timeZone}`,
      `Automated from Career-Ops dashboard → ${recipientsLine}`,
      '',
      summaryText,
      '',
      'The XLSX and CSV attachments include today\'s applied, contacted, followed, and follow-up rows.',
    ].filter(Boolean).join('\n'),
    html: `
      <h2>Career-Ops Daily Digest - ${escapeHtml(activity.date)}</h2>
      <p>Timezone: ${escapeHtml(activity.timeZone)}</p>
      <p>Automated from the Career-Ops dashboard to: <strong>${escapeHtml(recipientsLine)}</strong></p>
      <ul>${summaryHtml}</ul>
      <h3>Applied Today</h3>
      ${htmlTable(activity.details.applied_today)}
      <h3>Contacted Today</h3>
      ${htmlTable(activity.details.contacted_today)}
      <h3>Followed Today</h3>
      ${htmlTable(activity.details.followed_today)}
      <h3>Follow-ups Due Today</h3>
      ${htmlTable(activity.details.followups_due_today)}
      <p>The full current-state detail is attached as XLSX and CSV.</p>
    `,
    attachments,
  };
}

export async function sendDailyDigest(options = {}) {
  const digest = await buildDailyDigest(options);
  const config = Array.isArray(options.recipients) && options.recipients.length
    ? { ...smtpConfigFromEnv(options.env || process.env), recipients: options.recipients }
    : undefined;
  const info = await sendMail({
    subject: digest.subject,
    text: digest.text,
    html: digest.html,
    attachments: digest.attachments,
  }, config ? { ...options, config } : options);
  return {
    sent: true,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    activity: digest.activity,
  };
}
