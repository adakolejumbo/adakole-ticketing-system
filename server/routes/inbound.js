import { Router } from 'express';
import { one } from '../db.js';
import { HttpError } from '../auth.js';
import { createTicket, addComment, findOrCreateRequester, CHANNELS } from '../services/tickets.js';
import pool from '../db.js';

const r = Router();

/**
 * Omnichannel intake. Point email-parsing services (Postmark, SendGrid, Mailgun),
 * chat widgets, social inboxes or Zapier/Make at:
 *   POST /api/inbound/:channel   (channel = email | chat | social | phone | api)
 * Header:  x-inbound-secret: <INBOUND_SECRET>
 * Body:    { from_email, from_name?, subject?, body, priority?, tags? }
 * Emails whose subject contains [ATS-1234] are threaded onto that ticket.
 */
r.post('/:channel', async (req, res) => {
  const secret = req.get('x-inbound-secret') || req.query.secret;
  if (!process.env.INBOUND_SECRET || secret !== process.env.INBOUND_SECRET)
    throw new HttpError(401, 'Invalid inbound secret.');
  const channel = req.params.channel;
  if (!CHANNELS.includes(channel)) throw new HttpError(400, `Unknown channel. Use one of: ${CHANNELS.join(', ')}.`);

  const b = req.body || {};
  // Accept common field names from popular email parsers.
  const fromEmail = b.from_email || b.FromFull?.Email || b.sender || b.from;
  const fromName = b.from_name || b.FromFull?.Name || b.FromName;
  const subject = b.subject || b.Subject || `New ${channel} message`;
  const body = b.body || b.TextBody || b.text || b['stripped-text'] || b['body-plain'] || '';
  const emailMatch = String(fromEmail || '').match(/[^\s<>"]+@[^\s<>"]+/);
  if (!emailMatch) throw new HttpError(400, 'from_email is required.');

  const requester = await findOrCreateRequester(pool, { email: emailMatch[0], name: fromName });

  const ref = String(subject).match(/\[ATS-(\d+)\]/i);
  if (ref) {
    const existing = await one('SELECT id, requester_id FROM tickets WHERE id = $1', [Number(ref[1])]);
    if (existing && existing.requester_id === requester.id) {
      await addComment(existing.id, { body }, { ...requester, channel });
      return res.json({ threaded: true, ticket_id: existing.id });
    }
  }
  const ticket = await createTicket(
    { subject, description: body, channel, priority: b.priority, tags: b.tags, requester_email: requester.email, skip_required: true },
    null,
  );
  res.status(201).json({ created: true, ticket_id: ticket.id });
});

export default r;
