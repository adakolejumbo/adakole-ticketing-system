import pool from '../db.js';

export const addMinutes = (date, mins) => new Date(new Date(date).getTime() + mins * 60_000);

/** Due dates for a ticket, given its priority, creation time and time spent paused (pending). */
export async function slaTargets(priority, createdAt, pausedMinutes = 0, db = pool) {
  const { rows } = await db.query('SELECT * FROM sla_policies WHERE priority = $1', [priority]);
  const policy = rows[0];
  if (!policy) return { first_response_due: null, resolution_due: null };
  return {
    first_response_due: addMinutes(createdAt, policy.first_response_minutes),
    resolution_due: addMinutes(createdAt, policy.resolution_minutes + pausedMinutes),
  };
}
