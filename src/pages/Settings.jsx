import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { get, post, patch, del } from '../api.js';
import { useAuth, useMeta } from '../App.jsx';
import { CHANNELS, PRIORITIES, STATUSES, label, duration } from '../lib.js';
import { Field, Select, TagInput, Loading, ErrorNote, Empty, opts } from '../components/ui.jsx';

const ROLES = [{ value: 'admin', label: 'Administrator' }, { value: 'agent', label: 'Agent' }, { value: 'customer', label: 'Client user' }];
const FIELD_TYPES = [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'select', label: 'Dropdown' }];

// Each tab is described once; the generic editor renders list + form from it.
const TABS = (meta) => ({
  users: {
    title: 'People', res: 'users', blurb: 'Agents work tickets; client users can sign in to the portal. Deactivated people keep their history.',
    cols: [['name', 'Name'], ['email', 'Email'], ['role', 'Role', (v) => label(ROLES, v)], ['team_id', 'Team', (v) => name(meta?.teams, v)], ['org_id', 'Client', (v) => name(meta?.organizations, v)], ['active', 'Active', (v) => (v ? 'Yes' : 'No')]],
    fields: [
      ['name', 'Name', 'text', { required: true }], ['email', 'Email', 'email', { required: true }],
      ['role', 'Role', 'select', { options: ROLES, required: true }], ['team_id', 'Team', 'select', { options: opts(meta?.teams), empty: 'No team' }],
      ['org_id', 'Client company', 'select', { options: opts(meta?.organizations), empty: 'None' }],
      ['skills', 'Skills', 'tags', { hint: 'Used by routing to pick the best agent. Match category names or tags.' }],
      ['password', 'Password', 'password', { hint: 'Leave empty to keep the current password.' }], ['active', 'Active', 'bool'],
    ],
    defaults: { role: 'agent', active: true, skills: [] },
  },
  teams: {
    title: 'Teams', res: 'teams', blurb: 'Groups of agents. Categories and routing rules send tickets to a team, then to the best agent in it.',
    cols: [['name', 'Name'], ['description', 'Description']],
    fields: [['name', 'Name', 'text', { required: true }], ['description', 'Description', 'text']],
  },
  organizations: {
    title: 'Clients', res: 'organizations', blurb: 'The companies you support. New requesters are matched to a client by their email domain.',
    cols: [['name', 'Name'], ['domain', 'Email domain'], ['plan', 'Plan']],
    fields: [['name', 'Name', 'text', { required: true }], ['domain', 'Email domain', 'text', { hint: 'For example fvdental.ca' }], ['plan', 'Plan', 'text']],
  },
  categories: {
    title: 'Categories', res: 'categories', blurb: 'Issue types. Each can have a default team that receives its tickets.',
    cols: [['name', 'Name', null, 'color'], ['default_team_id', 'Default team', (v) => name(meta?.teams, v)]],
    fields: [['name', 'Name', 'text', { required: true }], ['color', 'Color', 'color'], ['default_team_id', 'Default team', 'select', { options: opts(meta?.teams), empty: 'None' }]],
    defaults: { color: '#1E6B5F' },
  },
  sla_policies: {
    title: 'SLA policies', res: 'sla_policies', blurb: 'Targets per priority. The clock pauses while a ticket is waiting on the customer.',
    cols: [['priority', 'Priority', (v) => label(PRIORITIES, v)], ['first_response_mins', 'First reply within', duration], ['resolution_mins', 'Resolve within', duration]],
    fields: [['priority', 'Priority', 'select', { options: PRIORITIES, required: true }], ['first_response_mins', 'First reply within (minutes)', 'number', { required: true }], ['resolution_mins', 'Resolve within (minutes)', 'number', { required: true }]],
  },
  routing_rules: {
    title: 'Routing rules', res: 'routing_rules', blurb: 'Checked in order on every new ticket. When no rule matches and AI triage is enabled, AI suggests the category and priority.',
    cols: [['position', 'Order'], ['name', 'Rule'], ['match_keywords', 'When text contains', (v) => (v || []).join(', ') || '—'], ['set_team_id', 'Send to', (v) => name(meta?.teams, v)], ['set_priority', 'Priority', (v) => (v ? label(PRIORITIES, v) : '—')], ['active', 'Active', (v) => (v ? 'Yes' : 'No')]],
    fields: [
      ['name', 'Rule name', 'text', { required: true }], ['position', 'Order', 'number', { hint: 'Lower numbers run first.' }],
      ['match_keywords', 'When subject or description contains any of', 'tags'],
      ['match_category_id', 'And category is', 'select', { options: opts(meta?.categories), empty: 'Any' }],
      ['match_channel', 'And channel is', 'select', { options: CHANNELS, empty: 'Any' }],
      ['set_category_id', 'Set category', 'select', { options: opts(meta?.categories), empty: 'Leave' }],
      ['set_priority', 'Set priority', 'select', { options: PRIORITIES, empty: 'Leave' }],
      ['set_team_id', 'Send to team', 'select', { options: opts(meta?.teams), empty: 'Leave' }],
      ['add_tags', 'Add tags', 'tags'], ['stop_processing', 'Stop checking later rules when this matches', 'bool'], ['active', 'Active', 'bool'],
    ],
    defaults: { position: 100, active: true, match_keywords: [], add_tags: [] },
  },
  macros: {
    title: 'Macros', res: 'macros', blurb: 'Saved replies. Use {{requester}}, {{ticket}} and {{agent}} as placeholders.',
    cols: [['name', 'Name'], ['set_status', 'Sets status', (v) => (v ? label(STATUSES, v) : '—')], ['is_internal', 'Type', (v) => (v ? 'Internal note' : 'Public reply')]],
    fields: [['name', 'Name', 'text', { required: true }], ['body', 'Text', 'textarea', { required: true }], ['set_status', 'Set status to', 'select', { options: STATUSES, empty: 'Leave' }], ['set_priority', 'Set priority to', 'select', { options: PRIORITIES, empty: 'Leave' }], ['is_internal', 'Add as internal note', 'bool']],
  },
  custom_fields: {
    title: 'Ticket fields', res: 'custom_fields', blurb: 'Extra fields shown on every ticket, such as asset tag or site.',
    cols: [['label', 'Label'], ['key', 'Key'], ['type', 'Type', (v) => label(FIELD_TYPES, v)], ['options', 'Options', (v) => (v || []).join(', ') || '—'], ['required', 'Required', (v) => (v ? 'Yes' : 'No')]],
    fields: [['label', 'Label', 'text', { required: true }], ['key', 'Key', 'text', { required: true, hint: 'Lowercase, no spaces. Used in the API.' }], ['type', 'Type', 'select', { options: FIELD_TYPES, required: true }], ['options', 'Dropdown options', 'tags'], ['required', 'Required when logging a ticket', 'bool'], ['position', 'Order', 'number']],
    defaults: { type: 'text', options: [], position: 100 },
  },
});

const name = (list, id) => list?.find((x) => x.id === id)?.name || '—';

export default function Settings() {
  const { tab = 'users' } = useParams();
  const { meta, reloadMeta } = useMeta();
  const { user } = useAuth();
  const tabs = TABS(meta);
  const admin = user.role === 'admin';
  return (
    <div className="page page-wide">
      <div className="page-head"><div><h1>Settings</h1><p className="muted">{admin ? 'Shape the desk around how your team works.' : 'You can view settings. Ask an administrator to change them.'}</p></div></div>
      <div className="settings">
        <nav className="settings-nav">
          {Object.entries(tabs).map(([k, t]) => <NavLink key={k} to={`/settings/${k}`} className={() => (k === tab ? 'active' : '')}>{t.title}</NavLink>)}
          <NavLink to="/settings/channels" className={() => (tab === 'channels' ? 'active' : '')}>Channels</NavLink>
        </nav>
        <div className="settings-body">
          {tab === 'channels' ? <Channels /> : tabs[tab] ? <Resource key={tab} cfg={tabs[tab]} admin={admin} onChange={reloadMeta} /> : <Empty title="Unknown settings page" />}
        </div>
      </div>
    </div>
  );
}

function Resource({ cfg, admin, onChange }) {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const load = () => get(`/admin/${cfg.res}`).then((d) => setRows(d.rows)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const save = async (form) => {
    setError('');
    try {
      const body = { ...form };
      delete body.id;
      if (editing.id) await patch(`/admin/${cfg.res}/${editing.id}`, body);
      else await post(`/admin/${cfg.res}`, body);
      setEditing(null);
      load();
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (row) => {
    if (!confirm(cfg.res === 'users' ? `Deactivate ${row.name}?` : 'Delete this item? Tickets that use it keep their history.')) return;
    try {
      await del(`/admin/${cfg.res}/${row.id}`);
      load();
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <div className="panel-head">
        <div><h2>{cfg.title}</h2><p className="muted small">{cfg.blurb}</p></div>
        {admin && !editing && <button className="btn btn-primary" onClick={() => setEditing({ ...(cfg.defaults || {}) })}>Add</button>}
      </div>
      <ErrorNote error={error} />
      {editing && <Editor cfg={cfg} initial={editing} onSave={save} onCancel={() => { setEditing(null); setError(''); }} />}
      {!rows ? <Loading /> : rows.length === 0 ? <Empty title={`No ${cfg.title.toLowerCase()} yet`} /> : (
        <div className="table-wrap">
          <table className="tickets">
            <thead><tr>{cfg.cols.map(([k, l]) => <th key={k}>{l}</th>)}{admin && <th />}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {cfg.cols.map(([k, , fmt, colorKey]) => (
                    <td key={k}>{colorKey && <i className="swatch" style={{ background: r[colorKey] }} />}{fmt ? fmt(r[k]) : r[k] ?? '—'}</td>
                  ))}
                  {admin && (
                    <td className="nowrap">
                      <div className="row-actions right">
                        <button className="link" onClick={() => { setEditing(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                        <button className="link danger" onClick={() => remove(r)}>{cfg.res === 'users' ? 'Deactivate' : 'Delete'}</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Editor({ cfg, initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="panel editor" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <h3>{initial.id ? 'Edit' : 'Add'}</h3>
      <div className="editor-grid">
        {cfg.fields.map(([k, l, type, o = {}]) => {
          if (type === 'bool') return <label key={k} className="check-row"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>;
          if (type === 'tags') return <div key={k} className="field"><span className="field-label">{l}</span><TagInput value={f[k] || []} onChange={(v) => set(k, v)} placeholder="Type and press Enter" />{o.hint && <span className="field-hint">{o.hint}</span>}</div>;
          let input;
          if (type === 'select') input = <Select value={f[k]} onChange={(v) => set(k, v === '' ? null : /^\d+$/.test(v) && k.endsWith('_id') ? Number(v) : v)} placeholder={o.required ? undefined : o.empty || '—'} options={o.options || []} required={o.required} />;
          else if (type === 'textarea') input = <textarea rows={6} value={f[k] || ''} required={o.required} onChange={(e) => set(k, e.target.value)} />;
          else if (type === 'number') input = <input type="number" value={f[k] ?? ''} required={o.required} onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))} />;
          else if (type === 'color') input = <input type="color" value={f[k] || '#1E6B5F'} onChange={(e) => set(k, e.target.value)} />;
          else input = <input type={type} value={f[k] || ''} required={o.required} autoComplete={type === 'password' ? 'new-password' : undefined} onChange={(e) => set(k, e.target.value)} />;
          return <Field key={k} label={l} hint={o.hint}>{input}</Field>;
        })}
      </div>
      <div className="editor-actions">
        <button className="btn btn-primary">Save</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Channels() {
  const base = `${location.origin}/api/inbound`;
  const rows = [
    ['Email', 'email', 'Point your inbound email provider (Postmark, SendGrid Inbound Parse, Mailgun routes, or a Power Automate flow on a shared mailbox) at this URL. Replies whose subject contains the ticket number, like [ATS-00012], are added to that ticket.'],
    ['Chat', 'chat', 'Send each new chat conversation from your chat widget or bot. The portal also has a built-in chat form.'],
    ['Social', 'social', 'Forward direct messages from social platforms through Zapier, Make or n8n.'],
    ['Phone', 'phone', 'Send call logs from your phone system, or have agents log calls with New ticket.'],
  ];
  return (
    <>
      <div className="panel-head"><div><h2>Channels</h2><p className="muted small">Every channel lands in the same queue. The web form lives in the customer portal.</p></div></div>
      <div className="panel">
        <h3>Web form and help center</h3>
        <p>Share <a className="link" href="/portal" target="_blank" rel="noreferrer">{location.origin}/portal</a> with clients. It searches the knowledge base before they submit, which deflects common requests.</p>
      </div>
      {rows.map(([title, ch, text]) => (
        <div className="panel" key={ch}>
          <h3>{title}</h3>
          <p>{text}</p>
          <code className="code">POST {base}/{ch}?key=YOUR_INBOUND_KEY</code>
        </div>
      ))}
      <div className="panel">
        <h3>Payload</h3>
        <p className="small muted">JSON or form-encoded. Postmark field names (From, Subject, TextBody) also work.</p>
        <pre className="code">{`{
  "from": "Jane Doe <jane@client.com>",
  "subject": "Printer is offline",
  "text": "The 2nd floor printer shows offline"
}`}</pre>
      </div>
    </>
  );
}
