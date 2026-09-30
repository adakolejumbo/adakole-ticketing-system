export const STATUS = {
  new: 'New',
  in_progress: 'In progress',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};
export const PRIORITY = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
export const CHANNEL = {
  web: 'Web form',
  portal: 'Portal',
  email: 'Email',
  chat: 'Chat',
  phone: 'Phone',
  social: 'Social',
  api: 'API',
};
export const OPEN = ['new', 'in_progress', 'pending'];

export const ref = (id) => `ATS-${id}`;

export function duration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function ago(date) {
  if (!date) return '';
  const mins = (Date.now() - new Date(date).getTime()) / 60000;
  if (mins < 1) return 'just now';
  return `${duration(mins)} ago`;
}

export const fullDate = (date) =>
  date ? new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

/**
 * Where a ticket stands against one SLA target.
 * state: met | breached | running | paused | none
 */
export function slaClock(ticket, kind) {
  const due = kind === 'first' ? ticket.first_response_due : ticket.resolution_due;
  const doneAt = kind === 'first' ? ticket.first_response_at : ticket.resolved_at;
  if (!due) return { state: 'none', fraction: 0, label: 'No target' };
  const start = new Date(ticket.created_at).getTime();
  const dueMs = new Date(due).getTime();
  const span = Math.max(1, dueMs - start);

  if (doneAt) {
    const took = new Date(doneAt).getTime();
    const met = took <= dueMs;
    return {
      state: met ? 'met' : 'breached',
      fraction: Math.min(1, (took - start) / span),
      label: met ? `Met in ${duration((took - start) / 60000)}` : `Missed by ${duration((took - dueMs) / 60000)}`,
    };
  }
  if (!OPEN.includes(ticket.status)) return { state: 'none', fraction: 0, label: 'Not measured' };
  const paused = kind === 'resolution' && ticket.status === 'pending';
  const nowMs = paused && ticket.sla_paused_at ? new Date(ticket.sla_paused_at).getTime() : Date.now();
  const left = (dueMs - nowMs) / 60000;
  const fraction = Math.min(1, Math.max(0, (nowMs - start) / span));
  if (left < 0) return { state: 'breached', fraction: 1, label: `Overdue by ${duration(-left)}` };
  return {
    state: paused ? 'paused' : fraction > 0.75 ? 'warning' : 'running',
    fraction,
    label: paused ? `Paused, ${duration(left)} left` : `${duration(left)} left`,
  };
}

/** The clock that matters most right now: first response until it's sent, then resolution. */
export const activeClock = (t) =>
  !t.first_response_at && OPEN.includes(t.status) ? { kind: 'Reply', ...slaClock(t, 'first') } : { kind: 'Resolve', ...slaClock(t, 'resolution') };

export const fillMacro = (body, { requester, agent }) =>
  body
    .replaceAll('{{requester}}', (requester || '').replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0] || 'there')
    .replaceAll('{{agent}}', agent || '');
