# Adakole Ticketing System (ATS)

A full-stack IT service desk for managed service providers, in the style of ServiceNow and Zendesk. Agents work every client's requests from one queue. Clients get a help center and portal. Admins configure routing, SLAs and fields without touching code.

**Stack:** React 18 + Vite, Node serverless API (one Vercel function), PostgreSQL, JWT auth, Recharts.

## Features

| Area | What it does |
|---|---|
| Omnichannel capture | Email, chat, social and phone post to `POST /api/inbound/:channel`. The portal has a web form and chat widget, and agents can log calls. Email replies with `[ATS-00012]` in the subject thread onto the existing ticket. New senders are matched to a client by email domain. |
| Triage | `ATS-00001` numbers, categories, tags, priority, client company, custom fields. |
| Automated routing | Ordered rules match whole-word keywords, category or channel, then set category, priority, team and tags. Optional AI triage (Anthropic API) runs when no rule matches. The agent is picked by best skill match, then lowest open workload. The routing reason is logged on each ticket. |
| Status tracking | New, In progress, Pending, Resolved, Closed. An agent reply moves New to In progress; a customer reply reopens Pending or Resolved tickets. |
| Internal collaboration | Internal notes hidden from customers at the API level, full activity log, reassignment across teams. |
| SLA management | First-reply and resolution targets per priority. The clock pauses while Pending and recalculates on priority change. Each ticket shows an SLA bar that fills and changes color as time runs out. |
| Knowledge base | Article editor, help center, suggestions while customers type (ticket deflection), suggested articles on each ticket, helpful votes and view counts. |
| Reporting | Received vs resolved per day, SLA compliance, average first reply and resolution time, issues by category, requests by channel, weekday-by-hour heatmap, agent performance, top tags. |
| Customization | People, teams, clients, categories, SLA policies, routing rules, macros (`{{requester}}`, `{{ticket}}`, `{{agent}}`), custom ticket fields. |

Roles: **admin** (everything), **agent** (work tickets, view settings), **customer** (portal: own requests only).

## Run locally (Windows PowerShell)

Requires Node 20.6+ and a Postgres database (a free Neon database works fine).

```powershell
Copy-Item .env.example .env      # then fill in DATABASE_URL, JWT_SECRET, SETUP_KEY, INBOUND_KEY
npm install
npm run db:setup                 # creates tables and demo data
npm run dev                      # web on http://localhost:5173, API on :3001
```

`npm run db:reset` wipes and recreates the demo data.

Demo sign-ins: `admin@ats.local` / `Admin123!`, agents such as `priya@ats.local` / `Password123!`, client `anna@fvdental.ca` / `Password123!`.

## Deploy to Vercel

1. Create a Postgres database (Neon, Supabase or Vercel Postgres) and copy the connection string.
2. Push this folder to GitHub and import the repo in Vercel. It detects Vite; `vercel.json` handles the API and page routing.
3. Add environment variables in Vercel: `DATABASE_URL`, `JWT_SECRET`, `SETUP_KEY`, `INBOUND_KEY`, and `APP_URL` (your site URL). Optional: `ANTHROPIC_API_KEY`, `RESEND_API_KEY` + `MAIL_FROM`, and `VITE_SHOW_DEMO=false` to hide the demo logins shown on the sign-in page. Demo accounts can work tickets but cannot change settings, people, passwords or knowledge base articles; set `DEMO_READONLY=false` to lift that.
4. Deploy, then create the tables once:
   ```powershell
   Invoke-RestMethod -Method Post -Uri "https://YOUR-APP.vercel.app/api/setup" -ContentType "application/json" -Body '{"key":"YOUR_SETUP_KEY"}'
   ```
5. To use the desk for real, set `DEMO_READONLY=false` and `VITE_SHOW_DEMO=false`, redeploy, then sign in as the admin and change the password under Settings → People.

## Connecting channels

Send JSON (or form data) to `https://YOUR-APP.vercel.app/api/inbound/{email|chat|social|phone}?key=YOUR_INBOUND_KEY`:

```json
{ "from": "Jane Doe <jane@client.com>", "subject": "Printer is offline", "text": "Floor 2 printer shows offline" }
```

Postmark field names (`From`, `Subject`, `TextBody`) also work. For email, point Postmark inbound, SendGrid Inbound Parse, or a Power Automate flow on a shared mailbox at the email URL. Zapier, Make or n8n can forward social messages.

## Project layout

```
api/index.js          all API routes (one serverless function)
api/_lib/             db, auth, SLA engine, routing engine, AI triage, KB scoring, schema, seed
src/pages/            Dashboard, Tickets, TicketDetail, NewTicket, KnowledgeBase, Reports, Settings, Portal
src/components/       Layout, shared UI (SLA bar, badges, inputs)
scripts/setup-db.js   local database setup
server/dev.js         local API server (Vite proxies /api to it)
```

## Ideas for next steps

Business-hours SLA calendars, file attachments (Vercel Blob), real-time updates, CSAT surveys after resolution, and an audit export.
