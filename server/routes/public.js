import { Router } from 'express';
import { HttpError } from '../auth.js';
import { createTicket } from '../services/tickets.js';
import { many } from '../db.js';

const r = Router();

r.get('/meta', async (_req, res) => {
  res.json({
    categories: await many('SELECT id, name FROM categories ORDER BY name'),
    custom_fields: await many('SELECT * FROM custom_fields WHERE visible_to_client = true ORDER BY position, id'),
  });
});

// Public web form: anyone can submit a request without an account.
r.post('/tickets', async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true }); // honeypot field — bots fill it, people never see it
  if (!b.email || !b.name) throw new HttpError(400, 'Add your name and email so we can reply.');
  const ticket = await createTicket(
    {
      subject: b.subject,
      description: b.description,
      category_id: b.category_id,
      channel: 'web',
      requester_email: b.email,
      requester_name: b.name,
      requester_phone: b.phone,
      custom_fields: b.custom_fields,
    },
    null,
  );
  res.status(201).json({ ok: true, reference: `ATS-${ticket.id}` });
});

export default r;
