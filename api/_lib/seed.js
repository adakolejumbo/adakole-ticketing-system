import { hashPassword } from './auth.js';
import { createTicket, statusPatch, updateTicket, logActivity } from './tickets.js';

const ins = async (db, sql, params) => (await db.query(sql, params)).rows[0];

export async function seed(db) {
  const existing = (await db.query('select count(*)::int as n from users')).rows[0].n;
  if (existing) return { seeded: false, message: 'Database already has data; seed skipped.' };

  const team = {};
  for (const [name, description] of [
    ['Service Desk', 'Tier 1: first contact, accounts, end-user support'],
    ['Infrastructure', 'Servers, networking, cloud and backups'],
    ['Security', 'Incidents, phishing, endpoint protection'],
    ['Billing', 'Invoices, contracts, licensing'],
  ]) team[name] = (await ins(db, 'insert into teams (name, description) values ($1,$2) returning id', [name, description])).id;

  const org = {};
  for (const [name, domain, plan] of [
    ['Fraser Valley Dental', 'fvdental.ca', 'Managed Plus'],
    ['Summit Logistics', 'summitlogistics.ca', 'Managed'],
    ['Harbour Legal LLP', 'harbourlegal.ca', 'Co-managed'],
  ]) org[name] = (await ins(db, 'insert into organizations (name, domain, plan) values ($1,$2,$3) returning id', [name, domain, plan])).id;

  const pw = await hashPassword('Password123!');
  const adminPw = await hashPassword('Admin123!');
  const user = {};
  const people = [
    ['Adakole Jumbo-Ochigbo', 'admin@ats.local', 'admin', 'Service Desk', null, ['microsoft 365', 'active directory', 'entra id'], adminPw],
    ['Priya Sandhu', 'priya@ats.local', 'agent', 'Service Desk', null, ['account & access', 'email', 'software'], pw],
    ['Marcus Lee', 'marcus@ats.local', 'agent', 'Service Desk', null, ['hardware', 'printer', 'software'], pw],
    ['Elena Novak', 'elena@ats.local', 'agent', 'Infrastructure', null, ['network', 'vpn', 'server', 'backup'], pw],
    ['Tom Okafor', 'tom@ats.local', 'agent', 'Infrastructure', null, ['network', 'cloud', 'azure'], pw],
    ['Sara Kim', 'sara@ats.local', 'agent', 'Security', null, ['security', 'phishing', 'mfa'], pw],
    ['Dev Patel', 'dev@ats.local', 'agent', 'Billing', null, ['billing', 'licensing'], pw],
    ['Dr. Anna Chen', 'anna@fvdental.ca', 'customer', null, 'Fraser Valley Dental', [], pw],
    ['Jake Morrison', 'jake@summitlogistics.ca', 'customer', null, 'Summit Logistics', [], pw],
    ['Linda Park', 'linda@harbourlegal.ca', 'customer', null, 'Harbour Legal LLP', [], pw],
    ['Omar Haddad', 'omar@summitlogistics.ca', 'customer', null, 'Summit Logistics', [], pw],
  ];
  for (const [name, email, role, t, o, skills, hash] of people) {
    user[email] = (
      await ins(db, 'insert into users (name,email,role,team_id,org_id,skills,password_hash) values ($1,$2,$3,$4,$5,$6,$7) returning id', [
        name, email, role, t ? team[t] : null, o ? org[o] : null, skills, hash,
      ])
    ).id;
  }

  const cat = {};
  for (const [name, color, t] of [
    ['Hardware', '#6B7F3A', 'Service Desk'],
    ['Software', '#3D6FA8', 'Service Desk'],
    ['Account & Access', '#8A5A9E', 'Service Desk'],
    ['Email', '#2F8C8C', 'Service Desk'],
    ['Network', '#B4692A', 'Infrastructure'],
    ['Security', '#B23A2B', 'Security'],
    ['Billing', '#5B6470', 'Billing'],
  ]) cat[name] = (await ins(db, 'insert into categories (name,color,default_team_id) values ($1,$2,$3) returning id', [name, color, team[t]])).id;

  for (const [p, f, r] of [['urgent', 15, 240], ['high', 60, 480], ['normal', 240, 1440], ['low', 480, 4320]]) {
    await db.query('insert into sla_policies (priority, first_response_mins, resolution_mins) values ($1,$2,$3)', [p, f, r]);
  }

  const rules = [
    ['Security incidents go to Security as urgent', 10, ['phishing', 'ransomware', 'hacked', 'virus', 'malware', 'breach', 'suspicious'], null, null, cat.Security, 'urgent', team.Security, ['security-incident'], true],
    ['Outages are high priority', 20, ['outage', 'no internet', 'whole office', 'whole warehouse', 'everyone is down', 'server down'], null, null, cat.Network, 'high', team.Infrastructure, ['outage'], false],
    ['VPN and Wi-Fi to Infrastructure', 30, ['vpn', 'wifi', 'wi-fi', 'firewall', 'switch', 'router'], null, null, cat.Network, null, team.Infrastructure, ['network'], false],
    ['Password and MFA to Service Desk', 40, ['password', 'locked out', 'mfa', 'authenticator', 'login'], null, null, cat['Account & Access'], null, team['Service Desk'], ['access'], false],
    ['Invoices to Billing', 50, ['invoice', 'billing', 'charge', 'license renewal', 'quote'], null, null, cat.Billing, 'low', team.Billing, ['billing'], false],
    ['Printers to Hardware', 60, ['printer', 'toner', 'scanner', 'monitor', 'laptop'], null, null, cat.Hardware, null, team['Service Desk'], ['hardware'], false],
    ['Office apps to Software', 65, ['excel', 'word', 'teams', 'crash', 'install', 'update', 'adobe'], null, null, cat.Software, null, team['Service Desk'], ['software'], false],
    ['Outlook and mailbox to Email', 70, ['outlook', 'mailbox', 'shared mailbox', 'email'], null, null, cat.Email, null, team['Service Desk'], ['email'], false],
    ['Phone calls start at high priority', 80, [], null, 'phone', null, 'high', null, ['phone'], false],
  ];
  for (const r of rules) {
    await db.query(
      `insert into routing_rules (name, position, match_keywords, match_category_id, match_channel, set_category_id, set_priority, set_team_id, add_tags, stop_processing)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, r);
  }

  for (const [key, label, type, options, required, position] of [
    ['asset_tag', 'Asset tag', 'text', [], false, 10],
    ['site', 'Site', 'select', ['Head office', 'Branch', 'Remote'], false, 20],
    ['users_affected', 'Users affected', 'number', [], false, 30],
  ]) await db.query('insert into custom_fields (key,label,type,options,required,position) values ($1,$2,$3,$4,$5,$6)', [key, label, type, options, required, position]);

  for (const [name, body, set_status, set_priority, is_internal] of [
    ['Acknowledge and investigating', 'Hi {{requester}},\n\nThanks for reaching out. I have picked up ticket {{ticket}} and I am looking into it now. I will update you within the hour.\n\n{{agent}}', 'in_progress', null, false],
    ['Request more information', 'Hi {{requester}},\n\nTo keep this moving, could you send a screenshot of the error and the time it happened? I will pause this ticket until I hear back.\n\n{{agent}}', 'pending', null, false],
    ['Password reset complete', 'Hi {{requester}},\n\nYour password has been reset. You will be asked to choose a new one at your next sign-in. Our self-service guide is here if you need it again: Reset your Microsoft 365 password.\n\n{{agent}}', 'resolved', null, false],
    ['Escalate to Infrastructure', 'Escalating to Infrastructure. Tier 1 checks done: user rebooted, cable and Wi-Fi verified, issue reproduced.', null, 'high', true],
    ['Resolved: confirm with user', 'Hi {{requester}},\n\nThis should be fixed now. If anything still looks wrong, just reply and the ticket will reopen.\n\n{{agent}}', 'resolved', null, false],
  ]) await db.query('insert into macros (name, body, set_status, set_priority, is_internal) values ($1,$2,$3,$4,$5)', [name, body, set_status, set_priority, is_internal]);

  const admin = user['admin@ats.local'];
  const articles = [
    ['Reset your Microsoft 365 password', cat['Account & Access'], ['password', 'microsoft 365', 'self-service'],
      'If you are locked out or forgot your password, you can reset it yourself.\n\n1. Go to https://passwordreset.microsoftonline.com\n2. Enter your work email and the characters shown.\n3. Verify with your phone or authenticator app.\n4. Choose a new password with at least 12 characters.\n\nStill locked out after 15 minutes? Submit a request and choose Account & Access.'],
    ['Set up Microsoft Authenticator (MFA)', cat['Account & Access'], ['mfa', 'authenticator', 'login'],
      'Multi-factor authentication protects your account even if your password leaks.\n\n1. Install Microsoft Authenticator from the App Store or Google Play.\n2. Sign in at https://aka.ms/mfasetup.\n3. Choose Mobile app and scan the QR code.\n4. Approve the test notification.\n\nGot a new phone? Contact us before wiping the old one so we can move your MFA.'],
    ['Connect to the office VPN', cat.Network, ['vpn', 'remote', 'network'],
      'Use the VPN whenever you work away from the office.\n\n1. Open the VPN client from the system tray.\n2. Select your company profile and click Connect.\n3. Approve the MFA prompt.\n\nIf it says "cannot connect", check your home internet first, then restart the client. Hotel and airport Wi-Fi often block VPNs.'],
    ['Printer shows offline', cat.Hardware, ['printer', 'offline', 'hardware'],
      'Most offline printers come back with these steps.\n\n1. Check the printer is on and shows no error on its screen.\n2. Restart the printer and wait two minutes.\n3. On your PC, open Settings > Printers, select the printer and choose Open queue, then cancel stuck jobs.\n4. Restart your PC.\n\nStill offline? Submit a request with the printer name and a photo of its screen.'],
    ['How to report a phishing email', cat.Security, ['phishing', 'security', 'email'],
      'If an email looks suspicious, do not click links or open attachments.\n\n1. In Outlook, select the email and click Report > Phishing.\n2. Delete it.\n3. If you already clicked a link or entered your password, change your password now and submit an urgent request so Security can check your account.'],
    ['Add a shared mailbox in Outlook', cat.Email, ['outlook', 'shared mailbox', 'email'],
      'Once you have been granted access, shared mailboxes appear automatically in Outlook within an hour. To add one manually:\n\n1. In Outlook, right-click your name in the folder list.\n2. Choose Add shared folder or mailbox.\n3. Type the mailbox address and click OK.'],
  ];
  for (const [title, category_id, tags, body] of articles) {
    await db.query('insert into kb_articles (title, body, category_id, tags, author_id, views, helpful) values ($1,$2,$3,$4,$5,$6,$7)', [
      title, body, category_id, tags, admin, Math.floor(Math.random() * 180) + 20, Math.floor(Math.random() * 30) + 5,
    ]);
  }

  // Sample tickets spread over the last 30 days so reports have shape.
  const customers = ['anna@fvdental.ca', 'jake@summitlogistics.ca', 'linda@harbourlegal.ca', 'omar@summitlogistics.ca'];
  const samples = [
    ['Locked out of my account after password change', 'I changed my password this morning and now Outlook keeps asking for it and says locked out.', 'email'],
    ['Front desk printer offline again', 'The reception printer shows offline for everyone. We have patients checking in.', 'phone'],
    ['VPN cannot connect from home', 'Getting an error when I try to connect to the VPN since yesterday.', 'web'],
    ['Suspicious email asking to verify payroll', 'Got an email that looks like it came from our CEO asking me to verify payroll details. I clicked the link before I noticed.', 'email'],
    ['Question about this month\'s invoice', 'Our invoice has two charges for Microsoft 365 licenses. Can you check?', 'email'],
    ['Need a shared mailbox for accounts@', 'Please create a shared mailbox accounts@ and give access to Omar and Jake.', 'web'],
    ['Internet down at the warehouse', 'The whole warehouse has no internet. Scanners are offline and trucks are waiting.', 'phone'],
    ['New laptop setup for new hire', 'We have a new paralegal starting Monday. Need a laptop with our standard apps.', 'web'],
    ['MFA prompts not showing on new phone', 'I got a new phone and the authenticator app does not show my work account.', 'chat'],
    ['Excel crashes when opening large files', 'Excel closes itself when I open the monthly report file.', 'chat'],
    ['Wi-Fi keeps dropping in boardroom', 'Wi-Fi in the boardroom drops every 10 minutes during client calls.', 'web'],
    ['Can we get a quote for 5 more licenses?', 'We are hiring. Please send a quote for five more Business Premium licenses.', 'social'],
    ['Second monitor not detected', 'My second monitor stopped working after an update.', 'web'],
    ['Outlook search not returning results', 'Search in Outlook returns nothing for emails I know exist.', 'email'],
    ['Scanner to email not working', 'The scanner shows an error when sending scans to email.', 'phone'],
  ];
  const agents = ['priya@ats.local', 'marcus@ats.local', 'elena@ats.local', 'tom@ats.local', 'sara@ats.local', 'dev@ats.local'];
  const now = Date.now();
  for (let i = 0; i < 42; i++) {
    const [subject, description, channel] = samples[i % samples.length];
    const requester = user[customers[i % customers.length]];
    const fresh = i < 6;
    const daysAgo = fresh ? (i * 12 + 3) / 1440 : i < 16 ? Math.random() * 3 + 0.2 : Math.random() * 27 + 3;
    const created = new Date(now - daysAgo * 86400000);
    if (!fresh && daysAgo > 1) created.setHours(8 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));
    if (created.getTime() > now) created.setTime(now - 3600000);
    const t = await createTicket(db, { subject, description, channel, requester_id: requester, created_at: created, skipAi: true, custom_fields: i % 3 === 0 ? { site: 'Head office', users_affected: 1 + (i % 7) } : {} }, null);
    await db.query('insert into comments (ticket_id, author_id, body, channel, created_at) values ($1,$2,$3,$4,$5)', [t.id, requester, description, channel, created]);

    if (i < 6) continue; // leave the newest few untouched in the queue
    const agentId = t.assignee_id || user[agents[i % agents.length]];
    const respondMins = 5 + Math.random() * (i % 5 === 0 ? 400 : 120);
    const responded = new Date(created.getTime() + respondMins * 60000);
    await db.query('insert into comments (ticket_id, author_id, body, created_at) values ($1,$2,$3,$4)', [t.id, agentId, 'Thanks, I am on this now and will update you shortly.', responded]);
    await db.query('insert into comments (ticket_id, author_id, body, is_internal, created_at) values ($1,$2,$3,true,$4)', [t.id, agentId, 'Checked the logs and reproduced it. Likely a known issue; applying the standard fix.', new Date(responded.getTime() + 600000)]);
    let patch = { first_responded_at: responded, assignee_id: agentId, status: 'in_progress' };
    const roll = i % 7;
    if (roll <= 1 || daysAgo > 3) {
      const resolved = new Date(responded.getTime() + (30 + Math.random() * (i % 4 === 0 ? 2400 : 900)) * 60000);
      if (resolved.getTime() < now) patch = { ...patch, ...statusPatch({ ...t, status: 'in_progress' }, i % 5 === 0 ? 'closed' : 'resolved', resolved) };
    } else if (roll === 2 || roll === 5) {
      patch = { ...patch, ...statusPatch({ ...t, status: 'in_progress' }, 'pending', new Date(responded.getTime() + 1800000)) };
    }
    await updateTicket(db, t.id, patch);
    await logActivity(db, t.id, agentId, 'status', { from: 'new', to: patch.status });
  }
  return { seeded: true, message: 'Demo data created.' };
}
