// Loads demo data for an MSP. Run: npm run db:seed        (only seeds an empty database)
//                                  npm run db:seed -- --reset   (wipes everything first)
import bcrypt from 'bcryptjs';
import pool from '../server/db.js';

const reset = process.argv.includes('--reset');
const q = (text, params) => pool.query(text, params);

const { rows: existing } = await q('SELECT COUNT(*) AS n FROM users');
if (existing[0].n > 0 && !reset) {
  console.log('Database already has data. Run "npm run db:seed -- --reset" to wipe it and reload the demo.');
  await pool.end();
  process.exit(0);
}
if (reset) {
  await q(`TRUNCATE ticket_kb_links, ticket_events, ticket_comments, tickets, kb_articles, macros, routing_rules,
           custom_fields, sla_policies, categories, team_members, teams, users, organizations RESTART IDENTITY CASCADE`);
}

// Deterministic randomness so every seed looks the same.
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const insert = async (table, row) => {
  const cols = Object.keys(row);
  const { rows } = await q(
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    cols.map((c) => row[c]),
  );
  return rows[0];
};

// Organizations (the MSP's clients)
const orgs = {};
for (const [key, name, domain, phone] of [
  ['dental', 'Fraser Valley Dental Group', 'fvdental.ca', '604-555-0142'],
  ['harbour', 'Harbourline Logistics', 'harbourline.com', '604-555-0188'],
  ['law', 'Cedar & Pine Law LLP', 'cedarpinelaw.ca', '604-555-0110'],
  ['vet', 'Mission Veterinary Clinic', 'missionvet.ca', '604-555-0175'],
  ['acct', 'Northshore Accounting', 'northshoreacct.ca', '604-555-0133'],
]) orgs[key] = await insert('organizations', { name, domain, phone });

// Staff
const adminHash = await bcrypt.hash('Admin123!', 10);
const agentHash = await bcrypt.hash('Agent123!', 10);
const clientHash = await bcrypt.hash('Client123!', 10);

const admin = await insert('users', { name: 'Adakole Jumbo-Ochigbo', email: 'admin@ats.demo', password_hash: adminHash, role: 'admin' });
const agents = {};
for (const [key, name, email] of [
  ['priya', 'Priya Sandhu', 'priya@ats.demo'],
  ['marcus', 'Marcus Lee', 'marcus@ats.demo'],
  ['elena', 'Elena Novak', 'elena@ats.demo'],
  ['daniel', 'Daniel Okafor', 'daniel@ats.demo'],
  ['hannah', 'Hannah Brooks', 'hannah@ats.demo'],
]) agents[key] = await insert('users', { name, email, password_hash: agentHash, role: 'agent' });

// Client contacts
const clients = [];
for (const [org, name, email, login] of [
  ['dental', 'Dr. Sarah Mitchell', 'client@fvdental.ca', true],
  ['dental', 'Kevin Tran', 'kevin@fvdental.ca'],
  ['harbour', 'Rob Fennimore', 'rob@harbourline.com'],
  ['harbour', 'Amandeep Gill', 'amandeep@harbourline.com'],
  ['harbour', 'Lisa Chen', 'lisa@harbourline.com'],
  ['law', 'James Whitford', 'jwhitford@cedarpinelaw.ca'],
  ['law', 'Monica Alvarez', 'malvarez@cedarpinelaw.ca'],
  ['vet', 'Dr. Paul Hendricks', 'paul@missionvet.ca'],
  ['vet', 'Jess Moreau', 'reception@missionvet.ca'],
  ['acct', 'Olivia Grant', 'olivia@northshoreacct.ca'],
  ['acct', 'Tom Baker', 'tom@northshoreacct.ca'],
]) clients.push(await insert('users', { name, email, role: 'client', organization_id: orgs[org].id, password_hash: login ? clientHash : null }));

// Teams
const teams = {};
for (const [key, name, description, members] of [
  ['desk', 'Service Desk', 'Tier 1: first contact, how-to questions, printers and desktop support.', ['priya', 'hannah', 'daniel']],
  ['infra', 'Infrastructure', 'Networks, servers, backups, firewalls and cloud platforms.', ['marcus', 'daniel']],
  ['sec', 'Security', 'Phishing, malware, suspicious sign-ins and incident response.', ['elena']],
  ['iam', 'Identity & Access', 'Accounts, passwords, MFA, onboarding and offboarding.', ['hannah', 'priya']],
]) {
  teams[key] = await insert('teams', { name, description });
  for (const m of members) await q('INSERT INTO team_members VALUES ($1,$2)', [teams[key].id, agents[m].id]);
}

// Categories
const cats = {};
for (const [key, name, color] of [
  ['hardware', 'Hardware', '#8A5A44'],
  ['software', 'Software', '#4E6BA6'],
  ['network', 'Network', '#2F7F79'],
  ['m365', 'Email & Microsoft 365', '#3D78C9'],
  ['access', 'Accounts & Access', '#7A5AA8'],
  ['security', 'Security', '#B33A3A'],
  ['printing', 'Printing', '#6F7B4A'],
  ['billing', 'Billing', '#A07B1F'],
  ['onboarding', 'Onboarding & Offboarding', '#4B7F52'],
]) cats[key] = await insert('categories', { name, color });

// SLA policies (minutes)
const sla = { urgent: [30, 240], high: [60, 480], normal: [240, 1440], low: [480, 4320] };
for (const [priority, [fr, res]] of Object.entries(sla))
  await insert('sla_policies', { priority, first_response_minutes: fr, resolution_minutes: res });

// Custom fields
for (const f of [
  { key: 'asset_tag', label: 'Asset tag', type: 'text', position: 1 },
  { key: 'device_type', label: 'Device type', type: 'select', options: ['Laptop', 'Desktop', 'Phone', 'Printer', 'Server', 'Other'], position: 2 },
  { key: 'affected_users', label: 'People affected', type: 'number', position: 3 },
  { key: 'site', label: 'Site or office', type: 'text', position: 4 },
  { key: 'billable', label: 'Billable work', type: 'checkbox', visible_to_client: false, position: 5 },
]) await insert('custom_fields', f);

// Routing rules
const rules = [
  ['Security incidents go straight to Security', 'any', [{ field: 'text', op: 'contains', value: 'phishing, ransomware, malware, virus, suspicious, hacked, compromised' }],
    { team_id: teams.sec.id, priority: 'urgent', category_id: cats.security.id, add_tags: 'security-incident' }, true],
  ['Passwords, lockouts and MFA', 'any', [{ field: 'text', op: 'contains', value: 'password, locked out, mfa, authenticator, 2fa, sign in' }],
    { team_id: teams.iam.id, category_id: cats.access.id, add_tags: 'account-access' }, false],
  ['New hires and leavers', 'any', [{ field: 'text', op: 'contains', value: 'new hire, onboard, starting monday, offboard, leaving, last day' }],
    { team_id: teams.iam.id, category_id: cats.onboarding.id, add_tags: 'lifecycle' }, false],
  ['Network and connectivity', 'any', [{ field: 'text', op: 'contains', value: 'internet, vpn, wifi, wi-fi, network, firewall, server down' }],
    { team_id: teams.infra.id, category_id: cats.network.id }, false],
  ['Printers and scanners', 'any', [{ field: 'text', op: 'contains', value: 'printer, toner, scan, print' }],
    { team_id: teams.desk.id, category_id: cats.printing.id, add_tags: 'printer' }, false],
  ['Outlook, Teams and OneDrive', 'any', [{ field: 'text', op: 'contains', value: 'outlook, teams, onedrive, sharepoint, mailbox, email' }],
    { team_id: teams.desk.id, category_id: cats.m365.id, add_tags: 'm365' }, false],
  ['Billing questions go to the account owner', 'any', [{ field: 'text', op: 'contains', value: 'invoice, billing, quote, contract' }],
    { assignee_id: admin.id, category_id: cats.billing.id }, true],
  ['Harbourline is a 24/7 operation: raise priority', 'all', [
    { field: 'organization_id', op: 'equals', value: String(orgs.harbour.id) },
    { field: 'priority', op: 'equals', value: 'normal' }],
    { priority: 'high', add_tags: 'vip' }, false],
];
for (const [i, [name, match_type, conditions, actions, stop]] of rules.entries())
  await insert('routing_rules', { name, match_type, conditions: JSON.stringify(conditions), actions: JSON.stringify(actions), stop_processing: stop, position: i + 1 });

// Knowledge base
const kb = {};
for (const [key, title, cat, tags, body] of [
  ['sspr', 'Reset your Microsoft 365 password yourself', 'access', 'password, m365, sspr, locked out',
   `If you've forgotten your password or you're locked out, you can reset it without waiting for us.

1. Go to https://passwordreset.microsoftonline.com
2. Enter your work email and the characters shown, then choose Next.
3. Verify with your registered phone or the Microsoft Authenticator app.
4. Choose a new password: at least 12 characters, not one you've used before.
5. Sign in again on your phone and laptop. Outlook and Teams will ask for the new password.

If the reset page says you're not registered, reply to your ticket and we'll reset it for you after confirming your identity by phone.`],
  ['mfa', 'Set up Microsoft Authenticator on a new phone', 'access', 'mfa, authenticator, new phone, 2fa',
   `Moving to a new phone? Do this before you wipe the old one.

1. Install Microsoft Authenticator on the new phone.
2. On a computer, go to https://mysignins.microsoft.com/security-info
3. Choose Add sign-in method, pick Authenticator app and follow the QR code steps.
4. Approve the test notification on the new phone.
5. Delete the old phone from the list.

Lost the old phone already? Open a ticket marked high priority so we can issue a temporary access pass.`],
  ['vpn', 'Connect to the office VPN from home', 'network', 'vpn, remote, work from home',
   `1. Open the VPN client from the system tray (bottom right of your screen).
2. Choose your office connection and sign in with your work email.
3. Approve the Authenticator prompt.
4. When it shows Connected, open your mapped drives as usual.

It connects but drives don't open? Disconnect, restart your laptop, and connect again before opening File Explorer. Still stuck? Tell us your home internet provider and whether other sites load.`],
  ['phish', 'How to report a phishing email', 'security', 'phishing, scam, suspicious email, security',
   `Don't click links, open attachments or reply.

1. In Outlook, select the message.
2. Choose Report on the ribbon, then Report phishing.
3. If you already clicked a link or entered your password, call the service desk right away and change your password at https://passwordreset.microsoftonline.com

Reporting quickly lets us remove the same email from everyone else's inbox.`],
  ['printer', 'Printer shows "offline" in Windows 11', 'printing', 'printer, offline, windows 11, print',
   `1. Check the printer has power, paper, and no error on its screen.
2. On your computer, open Settings > Bluetooth & devices > Printers & scanners.
3. Select the printer and choose Open print queue. Cancel any stuck jobs.
4. Restart the printer, wait one minute, then restart your computer.
5. Print a test page from the same screen.

Other people can't print either? Tell us, so we check the printer and network instead of your laptop.`],
  ['outlook', "Outlook isn't syncing new email", 'm365', 'outlook, email, sync, mailbox',
   `1. Check the bottom bar of Outlook. If it says Working Offline, open the Send/Receive tab and turn Work Offline off.
2. Close Outlook fully, wait 10 seconds, reopen it.
3. Check email at https://outlook.office.com. If new mail appears there, the problem is on your computer. If not, tell us straight away.
4. Still stuck? Reply to your ticket and we'll rebuild your Outlook profile remotely (about 15 minutes).`],
  ['teams', 'Clear the Microsoft Teams cache', 'm365', 'teams, cache, slow, not loading',
   `Clearing the cache fixes most Teams freezing, blank screens and missing messages.

1. Right-click Teams in the taskbar and choose Quit.
2. Press Windows + R, paste %userprofile%\\appdata\\local\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams and press Enter.
3. Delete everything in that folder.
4. Open Teams and sign in again. Your chats and files are safe: they're stored in the cloud.`],
  ['onboard', 'Requesting setup for a new employee', 'onboarding', 'new hire, onboarding, account, laptop',
   `Give us 3 business days' notice so accounts and equipment are ready on day one. Include:

- Full name and preferred name
- Job title, manager and start date
- Which shared mailboxes, folders and apps they need (or "same as" an existing person)
- Whether they need a laptop, phone or building access card

For someone leaving, tell us their last day and who should receive their email and files.`],
  ['drive', 'Map a shared network drive', 'network', 'network drive, shared folder, file explorer',
   `1. Open File Explorer and select This PC.
2. Choose ... (See more) > Map network drive.
3. Pick a letter and enter the folder path your manager gave you, for example \\\\server\\shared
4. Tick Reconnect at sign-in, then Finish.

Working from home? Connect to the VPN first.`],
]) kb[key] = await insert('kb_articles', {
  title, body, category_id: cats[cat].id, tags: tags.split(',').map((t) => t.trim()), author_id: agents.priya.id,
  views: 20 + Math.floor(rand() * 300), helpful_count: Math.floor(rand() * 40), deflections: Math.floor(rand() * 25),
});

// Macros (canned responses). {{requester}} and {{agent}} are filled in automatically.
for (const m of [
  { title: 'Acknowledge and start investigating', body: "Hi {{requester}},\n\nThanks for letting us know. I'm looking into this now and will update you within the hour.\n\n{{agent}}", set_status: 'in_progress' },
  { title: 'Ask for screenshots and details', body: "Hi {{requester}},\n\nTo move this forward, could you send:\n- a screenshot of the error\n- the approximate time it happened\n- the computer name (on the sticker, or Settings > System > About)\n\nI'll keep this ticket on hold until I hear back.\n\n{{agent}}", set_status: 'pending' },
  { title: 'Password reset complete', body: "Hi {{requester}},\n\nYour password has been reset. I'll send the temporary password to your phone by text. You'll be asked to choose a new one when you sign in.\n\nNext time you can do this yourself in a couple of minutes: see our guide on resetting your Microsoft 365 password.\n\n{{agent}}", set_status: 'resolved' },
  { title: 'Resolved: please confirm', body: "Hi {{requester}},\n\nThis should now be fixed. I've marked the ticket resolved. If anything still isn't right, just reply and it will reopen.\n\n{{agent}}", set_status: 'resolved' },
  { title: 'Escalate to Tier 2 (internal)', body: 'Escalating: Tier 1 checks done (restart, cache clear, remote session). Needs server or admin-level access. Customer is available after 2pm.', is_internal: true },
]) await insert('macros', m);

// Tickets
const templates = [
  ['m365', "Outlook stopped receiving email since this morning", 'Nothing new since about 9am. Sending works. Phone still gets email.', 'normal', ['email', 'portal', 'phone']],
  ['m365', 'Teams keeps freezing during video calls', 'Teams goes white and stops responding when I share my screen.', 'normal', ['portal', 'chat']],
  ['m365', 'Need access to the Reception shared mailbox', 'Please add me to reception@ so I can cover front desk next week.', 'low', ['email', 'portal']],
  ['access', 'Locked out of my account', "I've entered my password wrong too many times and now I'm locked out.", 'high', ['phone', 'chat']],
  ['access', 'New phone, need to move Authenticator', "Got a new iPhone and MFA codes are on my old one.", 'normal', ['email', 'portal']],
  ['security', 'Suspicious email asking me to verify my password', 'Got an email that looks like Microsoft asking me to verify my password. I did NOT click it.', 'high', ['email']],
  ['security', 'Clicked a link in a phishing email', 'I clicked a link and entered my password before I realized. Please help.', 'urgent', ['phone']],
  ['network', 'Internet is down at the office', 'No one at the office can get online. Phones are also down.', 'urgent', ['phone']],
  ['network', 'VPN connects but shared drive will not open', 'VPN says connected but the S: drive shows a red X.', 'normal', ['portal', 'email']],
  ['network', 'Wi-Fi keeps dropping in the back office', 'The laptop in the back room loses wifi every 10 minutes.', 'low', ['portal']],
  ['printing', 'Front desk printer says offline', 'Printer shows offline. Tried turning it off and on.', 'normal', ['chat', 'portal']],
  ['printing', 'Need toner for the Brother printer', 'Low toner warning on the Brother in the hallway.', 'low', ['email']],
  ['hardware', 'Laptop will not turn on', 'Pressed the power button, nothing. Charger light is on.', 'high', ['phone', 'portal']],
  ['hardware', 'Second monitor not detected after update', 'After Windows update last night my second screen stays black.', 'normal', ['portal', 'chat']],
  ['software', 'QuickBooks crashes when opening company file', 'Crashes every time with error 6123.', 'high', ['email', 'portal']],
  ['software', 'Please install Adobe Acrobat Pro', 'Need to edit PDFs for client contracts.', 'low', ['portal', 'social']],
  ['onboarding', 'New hire starting Monday: Jordan Reyes', 'Jordan starts Monday as a hygienist. Needs email, practice software login and a laptop.', 'normal', ['email', 'portal']],
  ['onboarding', "Offboard Mark Stevens, last day Friday", 'Please disable his access Friday 5pm and forward email to his manager.', 'normal', ['email']],
  ['billing', 'Question about last month invoice', 'We were charged for 14 users but only have 12.', 'low', ['email']],
  ['hardware', 'Server room is beeping', 'Loud beeping from the server cupboard since the power flickered.', 'urgent', ['phone', 'social']],
];
const agentForCat = { m365: 'priya', access: 'hannah', security: 'elena', network: 'marcus', printing: 'daniel', hardware: 'daniel', software: 'priya', onboarding: 'hannah', billing: null };
const teamForCat = { m365: 'desk', access: 'iam', security: 'sec', network: 'infra', printing: 'desk', hardware: 'desk', software: 'desk', onboarding: 'iam', billing: null };
const replies = [
  "Thanks, I'm connecting remotely now to take a look.",
  "Can you confirm whether anyone else is affected?",
  "I've applied a fix. Could you try again and let me know?",
  "Found the cause. Updating the configuration now.",
  "That's done. Please restart and let me know if it's working.",
];
const clientReplies = ['Yes, still happening.', "It's working now, thank you!", 'Just me as far as I know.', 'Sent the screenshot.'];
const notes = [
  'Checked sign-in logs: nothing unusual.',
  'Same issue at this client last month. See linked article.',
  'Waiting on vendor. Case number in the custom fields.',
  'Needs onsite visit Thursday if remote fix fails.',
];

const now = Date.now();
const HOUR = 3_600_000;
for (let i = 0; i < 110; i++) {
  const [cat, subject, description, basePriority, channels] = pick(templates);
  const requester = pick(clients);
  const ageHours = Math.floor(Math.pow(rand(), 1.3) * 30 * 24); // more recent tickets than old ones
  let created = new Date(now - ageHours * HOUR);
  const hour = [7, 8, 9, 9, 10, 10, 10, 11, 11, 13, 13, 14, 14, 15, 16, 17][Math.floor(rand() * 16)];
  created.setHours(hour, Math.floor(rand() * 60), 0, 0);
  if (created > new Date(now)) created = new Date(now - Math.floor(rand() * 3 + 1) * HOUR);
  if ([0, 6].includes(created.getDay()) && rand() < 0.7) created = new Date(created.getTime() - 2 * 24 * HOUR);

  let priority = basePriority;
  const tags = [];
  if (requester.organization_id === orgs.harbour.id && priority === 'normal') { priority = 'high'; tags.push('vip'); }
  if (cat === 'security') tags.push('security-incident');
  if (cat === 'printing') tags.push('printer');
  if (cat === 'm365') tags.push('m365');
  if (cat === 'access') tags.push('account-access');

  const [frMin, resMin] = sla[priority];
  const frDue = new Date(created.getTime() + frMin * 60_000);
  const resDue = new Date(created.getTime() + resMin * 60_000);
  const ageMin = (now - created.getTime()) / 60_000;

  // Older tickets are much more likely to be finished.
  const r = rand();
  let status;
  if (ageMin < 60) status = r < 0.6 ? 'new' : 'in_progress';
  else if (ageMin < 24 * 60) status = r < 0.15 ? 'new' : r < 0.55 ? 'in_progress' : r < 0.7 ? 'pending' : 'resolved';
  else status = r < 0.05 ? 'in_progress' : r < 0.1 ? 'pending' : r < 0.55 ? 'resolved' : 'closed';

  const assigneeKey = status === 'new' && rand() < 0.5 ? null : agentForCat[cat];
  const assignee = assigneeKey ? agents[assigneeKey] : cat === 'billing' ? admin : null;
  const frDelay = frMin * (rand() < 0.85 ? rand() * 0.9 : 1 + rand() * 1.5);
  const firstResponse = status === 'new' ? null : new Date(Math.min(created.getTime() + frDelay * 60_000, now - 60_000));
  const resDelay = resMin * (rand() < 0.8 ? 0.1 + rand() * 0.8 : 1 + rand());
  const resolved = ['resolved', 'closed'].includes(status) ? new Date(Math.min(created.getTime() + resDelay * 60_000, now - 30_000)) : null;
  const closed = status === 'closed' ? new Date(Math.min(resolved.getTime() + 48 * HOUR, now)) : null;

  const t = await insert('tickets', {
    subject, description, status, priority, channel: pick(channels), category_id: cats[cat].id,
    requester_id: requester.id, organization_id: requester.organization_id,
    assignee_id: assignee?.id || null, team_id: teamForCat[cat] ? teams[teamForCat[cat]].id : null, tags,
    custom_fields: JSON.stringify({
      ...(cat === 'hardware' ? { device_type: pick(['Laptop', 'Desktop', 'Server']), asset_tag: `FV-${1000 + Math.floor(rand() * 900)}` } : {}),
      ...(cat === 'printing' ? { device_type: 'Printer' } : {}),
      ...(rand() < 0.3 ? { affected_users: 1 + Math.floor(rand() * 12) } : {}),
      billable: rand() < 0.4,
    }),
    first_response_due: frDue, resolution_due: resDue, first_response_at: firstResponse,
    sla_paused_at: status === 'pending' ? new Date(now - rand() * 5 * HOUR) : null,
    resolved_at: resolved, closed_at: closed, created_at: created,
    updated_at: closed || resolved || firstResponse || created,
  });
  await insert('ticket_events', { ticket_id: t.id, actor_id: null, type: 'created', detail: JSON.stringify({ channel: t.channel }), created_at: created });

  if (firstResponse && assignee) {
    await insert('ticket_comments', { ticket_id: t.id, author_id: assignee.id, body: pick(replies), created_at: firstResponse });
    if (rand() < 0.5)
      await insert('ticket_comments', { ticket_id: t.id, author_id: assignee.id, body: pick(notes), is_internal: true, created_at: new Date(firstResponse.getTime() + 5 * 60_000) });
    if (rand() < 0.6 && resolved)
      await insert('ticket_comments', { ticket_id: t.id, author_id: requester.id, body: pick(clientReplies), created_at: new Date((firstResponse.getTime() + resolved.getTime()) / 2) });
  }
  const linkable = { access: ['sspr', 'mfa'], security: ['phish'], printing: ['printer'], m365: ['outlook', 'teams'], network: ['vpn', 'drive'], onboarding: ['onboard'] }[cat];
  if (linkable && rand() < 0.4) await q('INSERT INTO ticket_kb_links VALUES ($1,$2) ON CONFLICT DO NOTHING', [t.id, kb[pick(linkable)].id]);
}

console.log(`Demo data loaded.

  Admin   admin@ats.demo       / Admin123!
  Agent   priya@ats.demo       / Agent123!   (also marcus, elena, daniel, hannah)
  Client  client@fvdental.ca   / Client123!
`);
await pool.end();
