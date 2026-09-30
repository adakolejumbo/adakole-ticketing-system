import express from 'express';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import adminRoutes from './routes/admin.js';
import metaRoutes from './routes/meta.js';
import kbRoutes from './routes/kb.js';
import reportRoutes from './routes/reports.js';
import inboundRoutes from './routes/inbound.js';
import publicRoutes from './routes/public.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true })); // some email parsers post form data

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Adakole Ticketing System' }));
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/public', publicRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// Express 5 forwards rejected promises here.
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Try again.' : err.message });
});

export default app;
