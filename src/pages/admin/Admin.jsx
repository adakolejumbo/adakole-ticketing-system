import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorBox, Field, Loading, Modal, Priority, Tag } from '../../components/ui.jsx';
import { PRIORITY, STATUS, duration } from '../../lib/format.js';

const TABS = [
  ['users', 'People'],
  ['teams', 'Teams'],
  ['organizations', 'Clients'],
  ['categories', 'Categories'],
  ['sla', 'SLA targets'],
  ['routing', 'Routing rules'],
  ['fields', 'Ticket fields'],
  ['macros', 'Shared replies'],
  ['channels', 'Channels'],
];

export default function Admin() {
  const { tab } = useParams();
  const { admin } = useAuth();
  if (!admin && tab !== 'macros') return <Navigate to="/admin/macros" replace />;
  const Section = { users: Users, teams: Teams, organizations: Orgs, categories: Categories, sla: Sla, routing: Routing, fields: Fields, macros: Macros, channels: Channels }[tab];
  if (!Section) return <Navigate to="/admin/users" replace />;
  return (
    <div className="page">
      <div className="page-head"><div><h1>{admin ? 'Settings' : 'Shared replies'}</h1>
        <p>{admin ? 'Shape the desk around how your MSP works.' : 'Reusable replies the whole team can insert into tickets.'}</p></div></div>
      {admin && <nav className="tabs">{TABS.map(([k, l]) => <NavLink key={k} to={`/admin/${k}`}>{l}</NavLink>)}</nav>}
      <Section />
    </div>
  );
}

/* ---------- shared helpers ---------- */
function useList(path) {
  const [rows, setRows] = useState(null);
  const reload = useCallback(() => api(path).then(setRows), [path]);
  useEffect(() => { reload(); }, [reload]);
  return [rows, reload];
}

function EditModal({ title, initial, onClose, onSave, onDelete, children }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave(f);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose} footer={<>
      {onDelete && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { if (confirm('Delete this? This cannot be undone.')) { await onDelete(); onClose(); } }}>Delete</button>}
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <ErrorBox error={error} />
      {children(f, (k, v) => setF((x) => ({ ...x, [k]: v })))}
    </Modal>
  );
}

const save = (path, f) => api(f.id ? `${path}/${f.id}` : path, { method: f.id ? 'PUT' : 'POST', body: f });
const Head = ({ title, onAdd, addLabel, children }) => (
  <div className="card-head"><div><h2>{title}</h2>{children && <p className="small muted" style={{ margin: '2px 0 0' }}>{children}</p>}</div>
    {onAdd && <button className="btn primary small" onClick={onAdd}><Plus size={14} /> {addLabel}</button>}</div>
);

/* ---------- People ---------- */
function Users() {
  const { meta, reloadMeta } = useAuth();
  const [rows, reload] = useList('/admin/users');
  const [edit, setEdit] = useState(null);
  const [role, setRole] = useState('');
  if (!rows) return <Loading />;
  const shown = role ? rows.filter((u) => u.role === role) : rows;
  return (
    <section className="card">
      <Head title="People" onAdd={() => setEdit({ role: 'agent', active: true })} addLabel="Add person">
        Agents and admins work tickets. Clients sign in to the portal. Contacts without a password are created automatically when they email in.
      </Head>
      <div className="toolbar">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">Everyone ({rows.length})</option><option value="admin">Admins</option><option value="agent">Agents</option><option value="client">Clients</option>
        </select>
      </div>
      <div className="table-wrap"><table className="plain">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Client</th><th className="right">Open tickets</th><th>Sign-in</th><th /></tr></thead>
        <tbody>{shown.map((u) => (
          <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
            <td><strong>{u.name}</strong></td><td>{u.email}</td><td style={{ textTransform: 'capitalize' }}>{u.role}</td>
            <td>{u.organization_name || '—'}</td><td className="right">{u.role === 'client' ? '' : u.open_load}</td>
            <td className="small muted">{!u.active ? 'Deactivated' : u.can_sign_in ? 'Can sign in' : 'Contact only'}</td>
            <td className="right"><button className="btn small" onClick={() => setEdit(u)}>Edit</button></td>
          </tr>))}</tbody>
      </table></div>
      {edit && (
        <EditModal title={edit.id ? `Edit ${edit.name}` : 'Add a person'} initial={{ ...edit, password: '' }} onClose={() => setEdit(null)}
          onSave={async (f) => { await save('/admin/users', f); await reload(); await reloadMeta(); }}>
          {(f, set) => <>
            <div className="grid-2">
              <Field label="Name"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
            </div>
            <div className="grid-2">
              <Field label="Role"><select className="input" value={f.role} onChange={(e) => set('role', e.target.value)}>
                <option value="agent">Agent</option><option value="admin">Admin</option><option value="client">Client</option></select></Field>
              <Field label="Client organization"><select className="input" value={f.organization_id || ''} onChange={(e) => set('organization_id', e.target.value)}>
                <option value="">None</option>{meta.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            </div>
            <Field label={f.id ? 'Set a new password' : 'Password'} hint={f.id ? 'Leave blank to keep the current one' : 'Leave blank for a contact who cannot sign in'}>
              <input className="input" type="text" autoComplete="off" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={f.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active</label>
          </>}
        </EditModal>
      )}
    </section>
  );
}

/* ---------- Teams ---------- */
function Teams() {
  const { reloadMeta } = useAuth();
  const [rows, reload] = useList('/admin/teams');
  const [agents] = useList('/admin/users?role=agent,admin');
  const [edit, setEdit] = useState(null);
  if (!rows || !agents) return <Loading />;
  const nameOf = (id) => agents.find((a) => a.id === id)?.name;
  return (
    <section className="card">
      <Head title="Teams" onAdd={() => setEdit({ auto_assign: true, member_ids: [] })} addLabel="Add team">
        With auto-assign on, tickets routed to a team go to the member with the fewest open tickets.
      </Head>
      {rows.map((t) => (
        <div className="rule spread" key={t.id}>
          <div><h3>{t.name}</h3><p className="small muted" style={{ margin: '2px 0 6px' }}>{t.description}</p>
            <div className="row wrap" style={{ gap: 4 }}>{t.member_ids.map((id) => <Tag key={id}>{nameOf(id)}</Tag>)}{!t.member_ids.length && <span className="small muted">No members yet</span>}</div></div>
          <div className="row"><span className="small muted">{t.auto_assign ? 'Auto-assign on' : 'Manual assignment'}</span><button className="btn small" onClick={() => setEdit(t)}>Edit</button></div>
        </div>
      ))}
      {edit && (
        <EditModal title={edit.id ? `Edit ${edit.name}` : 'Add a team'} initial={edit} onClose={() => setEdit(null)}
          onSave={async (f) => { await save('/admin/teams', f); await reload(); await reloadMeta(); }}
          onDelete={edit.id && (async () => { await api(`/admin/teams/${edit.id}`, { method: 'DELETE' }); await reload(); await reloadMeta(); })}>
          {(f, set) => <>
            <Field label="Name"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="What this team handles"><input className="input" value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={f.auto_assign} onChange={(e) => set('auto_assign', e.target.checked)} /> Auto-assign to the least busy member</label>
            <Field label="Members"><div className="grid-2">{agents.map((a) => (
              <label className="check" key={a.id}><input type="checkbox" checked={f.member_ids.includes(a.id)}
                onChange={(e) => set('member_ids', e.target.checked ? [...f.member_ids, a.id] : f.member_ids.filter((x) => x !== a.id))} /> {a.name}</label>))}
            </div></Field>
          </>}
        </EditModal>
      )}
    </section>
  );
}

/* ---------- Simple lists ---------- */
function SimpleList({ path, title, blurb, addLabel, columns, blank, form }) {
  const { reloadMeta } = useAuth();
  const [rows, reload] = useList(path);
  const [edit, setEdit] = useState(null);
  if (!rows) return <Loading />;
  return (
    <section className="card">
      <Head title={title} onAdd={() => setEdit(blank)} addLabel={addLabel}>{blurb}</Head>
      <div className="table-wrap"><table className="plain">
        <thead><tr>{columns.map(([l]) => <th key={l}>{l}</th>)}<th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>{columns.map(([l, render]) => <td key={l}>{render(r)}</td>)}
            <td className="right"><button className="btn small" onClick={() => setEdit(r)}>Edit</button></td></tr>))}
        </tbody>
      </table></div>
      {edit && (
        <EditModal title={edit.id ? 'Edit' : addLabel} initial={edit} onClose={() => setEdit(null)}
          onSave={async (f) => { await save(path, f); await reload(); await reloadMeta(); }}
          onDelete={edit.id && (async () => { await api(`${path}/${edit.id}`, { method: 'DELETE' }); await reload(); await reloadMeta(); })}>
          {form}
        </EditModal>
      )}
    </section>
  );
}

const Orgs = () => (
  <SimpleList path="/admin/organizations" title="Clients" addLabel="Add client" blank={{}}
    blurb="The businesses you support. Email from a client's domain is filed under that client automatically."
    columns={[['Name', (r) => <strong>{r.name}</strong>], ['Email domain', (r) => r.domain || '—'], ['Phone', (r) => r.phone || '—'], ['Notes', (r) => <span className="small muted">{r.notes}</span>]]}
    form={(f, set) => <>
      <Field label="Name"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="Email domain" hint="For example acme.com"><input className="input" value={f.domain || ''} onChange={(e) => set('domain', e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      <Field label="Notes for technicians" hint="Contract level, site access, key contacts"><textarea className="input" value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
    </>} />
);

const Categories = () => (
  <SimpleList path="/admin/categories" title="Categories" addLabel="Add category" blank={{ color: '#3f6fb5' }}
    blurb="Used for triage, routing and reporting."
    columns={[['Name', (r) => <span className="cat" style={{ '--c': r.color }}>{r.name}</span>], ['Color', (r) => <span className="mono">{r.color}</span>]]}
    form={(f, set) => <div className="grid-2">
      <Field label="Name"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Color"><input className="input" type="color" style={{ height: 36, padding: 3 }} value={f.color} onChange={(e) => set('color', e.target.value)} /></Field>
    </div>} />
);

const Macros = () => (
  <SimpleList path="/admin/macros" title="Shared replies" addLabel="Add shared reply" blank={{ is_internal: false }}
    blurb="{{requester}} becomes the requester's first name and {{agent}} your name. A reply can also change the ticket's status."
    columns={[['Title', (r) => <strong>{r.title}</strong>], ['Type', (r) => (r.is_internal ? 'Internal note' : 'Reply')], ['Sets status', (r) => STATUS[r.set_status] || '—'],
      ['Preview', (r) => <span className="small muted">{r.body.slice(0, 80)}…</span>]]}
    form={(f, set) => <>
      <Field label="Title"><input className="input" value={f.title || ''} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Message"><textarea className="input" rows={8} value={f.body || ''} onChange={(e) => set('body', e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="After sending, set status"><select className="input" value={f.set_status || ''} onChange={(e) => set('set_status', e.target.value)}>
          <option value="">Don't change</option>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={f.is_internal} onChange={(e) => set('is_internal', e.target.checked)} /> Internal note</label>
      </div>
    </>} />
);

const Fields = () => (
  <SimpleList path="/admin/custom-fields" title="Ticket fields" addLabel="Add field" blank={{ type: 'text', options: [], visible_to_client: true, required: false, position: 10 }}
    blurb="Extra details to capture on every ticket. Required fields must be filled in on the portal and web form."
    columns={[['Label', (r) => <strong>{r.label}</strong>], ['Key', (r) => <span className="mono">{r.key}</span>], ['Type', (r) => r.type],
      ['Options', (r) => r.options.join(', ') || '—'], ['Visible to clients', (r) => (r.visible_to_client ? 'Yes' : 'No')], ['Required', (r) => (r.required ? 'Yes' : 'No')]]}
    form={(f, set) => <>
      <div className="grid-2">
        <Field label="Label"><input className="input" value={f.label || ''} onChange={(e) => { set('label', e.target.value); if (!f.id) set('key', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_')); }} /></Field>
        <Field label="Key" hint="Used in the API"><input className="input mono" value={f.key || ''} onChange={(e) => set('key', e.target.value)} disabled={Boolean(f.id)} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Type"><select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}>
          <option value="text">Text</option><option value="number">Number</option><option value="select">Dropdown</option><option value="date">Date</option><option value="checkbox">Checkbox</option></select></Field>
        <Field label="Order"><input className="input" type="number" value={f.position} onChange={(e) => set('position', Number(e.target.value))} /></Field>
      </div>
      {f.type === 'select' && <Field label="Dropdown options" hint="Comma separated"><input className="input" value={Array.isArray(f.options) ? f.options.join(', ') : f.options} onChange={(e) => set('options', e.target.value)} /></Field>}
      <label className="check"><input type="checkbox" checked={f.visible_to_client} onChange={(e) => set('visible_to_client', e.target.checked)} /> Clients can see and fill this in</label>
      <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => set('required', e.target.checked)} /> Required</label>
    </>} />
);

/* ---------- SLA ---------- */
function Sla() {
  const [rows, reload] = useList('/admin/sla');
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (rows) setDraft(rows.map((r) => ({ ...r, fr_h: r.first_response_minutes / 60, res_h: r.resolution_minutes / 60 }))); }, [rows]);
  if (!draft) return <Loading />;
  const upd = (i, k, v) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const saveAll = async () => {
    await api('/admin/sla', { method: 'PUT', body: { policies: draft.map((r) => ({ priority: r.priority, first_response_minutes: Math.round(r.fr_h * 60), resolution_minutes: Math.round(r.res_h * 60) })) } });
    setMsg('SLA targets saved. They apply to new tickets and to tickets whose priority changes.');
    reload();
  };
  return (
    <section className="card">
      <Head title="SLA targets">Clocks run in calendar time from when a ticket is opened. The resolution clock pauses while a ticket is Pending.</Head>
      <div className="card-pad stack">
        {msg && <div className="notice">{msg}</div>}
        <table className="plain">
          <thead><tr><th>Priority</th><th>First response within (hours)</th><th>Resolve within (hours)</th><th /></tr></thead>
          <tbody>{draft.map((r, i) => (
            <tr key={r.priority}><td><Priority value={r.priority} /></td>
              <td><input className="input" style={{ maxWidth: 140 }} type="number" min="0.25" step="0.25" value={r.fr_h} onChange={(e) => upd(i, 'fr_h', e.target.value)} /></td>
              <td><input className="input" style={{ maxWidth: 140 }} type="number" min="0.25" step="0.25" value={r.res_h} onChange={(e) => upd(i, 'res_h', e.target.value)} /></td>
              <td className="small muted">{duration(r.fr_h * 60)} / {duration(r.res_h * 60)}</td></tr>))}
          </tbody>
        </table>
        <div><button className="btn primary" onClick={saveAll}>Save SLA targets</button></div>
      </div>
    </section>
  );
}

/* ---------- Routing ---------- */
const FIELDS = [
  ['text', 'Subject or description'], ['subject', 'Subject'], ['description', 'Description'], ['requester_email', 'Requester email'],
  ['channel', 'Channel'], ['priority', 'Priority'], ['organization_id', 'Client'], ['category_id', 'Category'],
];
const OPS = [['contains', 'contains any of'], ['not_contains', 'contains none of'], ['equals', 'is'], ['not_equals', 'is not'], ['starts_with', 'starts with'], ['ends_with', 'ends with']];

function Routing() {
  const { meta } = useAuth();
  const [rows, reload] = useList('/admin/routing-rules');
  const [edit, setEdit] = useState(null);
  if (!rows || !meta) return <Loading />;
  const nm = (list, id) => list.find((x) => String(x.id) === String(id))?.name || id;
  const fieldLabel = (f) => FIELDS.find(([k]) => k === f)?.[1] || f;
  const opLabel = (o) => OPS.find(([k]) => k === o)?.[1] || o;
  const valueLabel = (c) => (c.field === 'organization_id' ? nm(meta.organizations, c.value) : c.field === 'category_id' ? nm(meta.categories, c.value) : `"${c.value}"`);
  const actionText = (a) => [
    a.team_id && `send to ${nm(meta.teams, a.team_id)}`, a.assignee_id && `assign to ${nm(meta.agents, a.assignee_id)}`,
    a.priority && `set priority ${PRIORITY[a.priority]}`, a.category_id && `categorize as ${nm(meta.categories, a.category_id)}`,
    a.add_tags && `tag ${a.add_tags}`].filter(Boolean).join(', ');

  const valueInput = (c, onChange) => {
    const opts = { organization_id: meta.organizations, category_id: meta.categories }[c.field]
      || (c.field === 'priority' && Object.entries(PRIORITY).map(([id, name]) => ({ id, name })))
      || (c.field === 'channel' && ['web', 'portal', 'email', 'chat', 'phone', 'social', 'api'].map((id) => ({ id, name: id })));
    if (opts) return <select className="input" value={c.value} onChange={(e) => onChange(e.target.value)}><option value="">Choose…</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
    return <input className="input" value={c.value} onChange={(e) => onChange(e.target.value)} placeholder="Comma-separated keywords" />;
  };

  return (
    <section className="card">
      <Head title="Routing rules" onAdd={() => setEdit({ match_type: 'any', active: true, stop_processing: false, position: rows.length + 1, conditions: [{ field: 'text', op: 'contains', value: '' }], actions: {} })} addLabel="Add rule">
        Rules run top to bottom on every new ticket, from any channel. Later rules can override earlier ones unless a rule says to stop.
      </Head>
      {rows.map((r) => (
        <div className="rule" key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
          <div className="spread">
            <div className="row"><span className="pos">{r.position}</span><h3>{r.name}</h3>{!r.active && <Tag>Off</Tag>}{r.stop_processing && <Tag>Stops here</Tag>}</div>
            <button className="btn small" onClick={() => setEdit(r)}>Edit</button>
          </div>
          <p className="small" style={{ margin: '6px 0 0 32px' }}>
            <span className="muted">When {r.match_type === 'all' ? 'all' : 'any'} of: </span>
            {r.conditions.map((c, i) => <span key={i}>{i > 0 && <span className="muted">{r.match_type === 'all' ? ' and ' : ' or '}</span>}{fieldLabel(c.field)} {opLabel(c.op)} {valueLabel(c)}</span>)}
            <br /><span className="muted">Then: </span>{actionText(r.actions) || 'nothing'}
          </p>
        </div>
      ))}
      {edit && (
        <EditModal title={edit.id ? 'Edit rule' : 'Add a routing rule'} initial={edit} onClose={() => setEdit(null)}
          onSave={async (f) => { await save('/admin/routing-rules', f); await reload(); }}
          onDelete={edit.id && (async () => { await api(`/admin/routing-rules/${edit.id}`, { method: 'DELETE' }); await reload(); })}>
          {(f, set) => {
            const setCond = (i, k, v) => set('conditions', f.conditions.map((c, j) => (j === i ? { ...c, [k]: v, ...(k === 'field' ? { value: '' } : {}) } : c)));
            const setAct = (k, v) => set('actions', { ...f.actions, [k]: v || undefined });
            return <>
              <div className="grid-2">
                <Field label="Rule name"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
                <Field label="Order"><input className="input" type="number" value={f.position} onChange={(e) => set('position', Number(e.target.value))} /></Field>
              </div>
              <Field label="Match">
                <select className="input" value={f.match_type} onChange={(e) => set('match_type', e.target.value)}><option value="any">Any condition</option><option value="all">All conditions</option></select>
              </Field>
              <div>
                {f.conditions.map((c, i) => (
                  <div className="cond-row" key={i}>
                    <select className="input" value={c.field} onChange={(e) => setCond(i, 'field', e.target.value)} aria-label="Field">{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <select className="input" value={c.op} onChange={(e) => setCond(i, 'op', e.target.value)} aria-label="Operator">{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    {valueInput(c, (v) => setCond(i, 'value', v))}
                    <button type="button" className="btn ghost small" aria-label="Remove condition" onClick={() => set('conditions', f.conditions.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" className="btn small" onClick={() => set('conditions', [...f.conditions, { field: 'text', op: 'contains', value: '' }])}><Plus size={13} /> Add condition</button>
              </div>
              <h3>Then</h3>
              <div className="grid-2">
                <Field label="Send to team"><select className="input" value={f.actions.team_id || ''} onChange={(e) => setAct('team_id', e.target.value)}><option value="">No change</option>{meta.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                <Field label="Assign to agent"><select className="input" value={f.actions.assignee_id || ''} onChange={(e) => setAct('assignee_id', e.target.value)}><option value="">Least busy on the team</option>{meta.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
                <Field label="Set priority"><select className="input" value={f.actions.priority || ''} onChange={(e) => setAct('priority', e.target.value)}><option value="">No change</option>{Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field label="Set category"><select className="input" value={f.actions.category_id || ''} onChange={(e) => setAct('category_id', e.target.value)}><option value="">No change</option>{meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              </div>
              <Field label="Add tags"><input className="input" value={f.actions.add_tags || ''} onChange={(e) => setAct('add_tags', e.target.value)} placeholder="comma, separated" /></Field>
              <label className="check"><input type="checkbox" checked={f.stop_processing} onChange={(e) => set('stop_processing', e.target.checked)} /> Stop running rules after this one matches</label>
              <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Rule is on</label>
            </>;
          }}
        </EditModal>
      )}
    </section>
  );
}

/* ---------- Channels ---------- */
function Channels() {
  const origin = window.location.origin;
  return (
    <div className="stack">
      <section className="card">
        <Head title="Web form and portal">Clients without an account can use the public form. Clients with an account see their history in the portal.</Head>
        <div className="card-pad stack">
          <div>Public request form: <a href="/submit">{origin}/submit</a></div>
          <div>Help center: <a href="/help">{origin}/help</a></div>
          <div>Client portal: <a href="/login">{origin}/login</a></div>
          <Field label="Embed the form on a client's intranet"><div className="code">{`<iframe src="${origin}/submit" width="100%" height="760" style="border:0"></iframe>`}</div></Field>
        </div>
      </section>
      <section className="card">
        <Head title="Email, chat and social">Send messages to the inbound endpoint from an email parser (Postmark, SendGrid Inbound Parse, Mailgun), a chat widget, or an automation tool like Zapier or Make.</Head>
        <div className="card-pad stack">
          <div className="code">{`POST ${origin}/api/inbound/{email|chat|social|phone|api}
x-inbound-secret: <your INBOUND_SECRET>
Content-Type: application/json

{
  "from_email": "jane@client.com",
  "from_name": "Jane Doe",
  "subject": "Can't print",
  "body": "The front desk printer says offline."
}`}</div>
          <p className="small muted" style={{ margin: 0 }}>Replies whose subject contains the reference, like [ATS-1042], are added to that ticket instead of creating a new one. Unknown senders become contacts, filed under the client whose email domain matches.</p>
        </div>
      </section>
      <section className="card">
        <Head title="Phone">Agents log calls with New ticket and choose Phone as the channel, so calls show up in the same queue and reports.</Head>
      </section>
    </div>
  );
}
