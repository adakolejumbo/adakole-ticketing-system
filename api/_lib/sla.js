// SLA engine: computes due dates from policies, pauses the clock while a
// ticket is Pending (waiting on the customer), and reports breach state.

export async function policyFor(db, priority) {
  const r = await db.query('select * from sla_policies where priority = $1', [priority]);
  return r.rows[0] || null;
}

export function dueDates(policy, from, pausedMins = 0) {
  if (!policy) return { first_response_due: null, resolution_due: null };
  const base = new Date(from).getTime() + pausedMins * 60000;
  return {
    first_response_due: new Date(base + policy.first_response_mins * 60000),
    resolution_due: new Date(base + policy.resolution_mins * 60000),
  };
}

function clock(due, doneAt, pausedAt, startedAt, now) {
  if (!due) return null;
  const d = new Date(due).getTime();
  const start = new Date(startedAt).getTime();
  const total = Math.max(d - start, 1);
  if (doneAt) {
    const done = new Date(doneAt).getTime();
    return { due, done: true, paused: false, breached: done > d, remainingMins: Math.round((d - done) / 60000), used: Math.min((done - start) / total, 1.5) };
  }
  const ref = pausedAt ? new Date(pausedAt).getTime() : now;
  return { due, done: false, paused: !!pausedAt, breached: ref > d, remainingMins: Math.round((d - ref) / 60000), used: Math.min((ref - start) / total, 1.5) };
}

export function slaState(t, now = Date.now()) {
  const start = new Date(new Date(t.created_at).getTime() + (t.sla_paused_mins || 0) * 60000);
  const firstDone = t.first_responded_at || t.resolved_at;
  return {
    firstResponse: clock(t.first_response_due, firstDone, firstDone ? null : t.sla_paused_at, start, now),
    resolution: clock(t.resolution_due, t.resolved_at, t.sla_paused_at, start, now),
  };
}

export function withSla(t) {
  const sla = slaState(t);
  const active = sla.resolution && !sla.resolution.done ? sla.resolution : null;
  const atRisk = !!active && !active.paused && !active.breached && active.used >= 0.75;
  return { ...t, sla, sla_breached: !!(sla.firstResponse?.breached || sla.resolution?.breached), sla_at_risk: atRisk };
}
