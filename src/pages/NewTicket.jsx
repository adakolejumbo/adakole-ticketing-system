import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api.js';
import { useMeta } from '../App.jsx';
import { CHANNELS, PRIORITIES } from '../lib.js';
import { Field, Select, TagInput, CustomFieldInput, ErrorNote, opts } from '../components/ui.jsx';

export default function NewTicket() {
  const { meta } = useMeta();
  const nav = useNavigate();
  const [f, setF] = useState({ requester_email: '', requester_name: '', channel: 'phone', subject: '', description: '', category_id: '', priority: '', team_id: '', assignee_id: '', tags: [], custom_fields: {} });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [related, setRelated] = useState([]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  useEffect(() => {
    const text = `${f.subject} ${f.description}`.trim();
    if (text.length < 6) return setRelated([]);
    const t = setTimeout(() => get(`/public/kb?q=${encodeURIComponent(text)}`).then((d) => setRelated(d.articles.slice(0, 3))).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [f.subject, f.description]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const missing = (meta?.customFields || []).find((cf) => cf.required && (f.custom_fields[cf.key] ?? '') === '');
      if (missing) throw new Error(`${missing.label} is required`);
      const d = await post('/tickets', f);
      nav(`/tickets/${d.ticket.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Log a ticket</h1><p className="muted">For phone calls, walk-ups, or anything that did not arrive through a connected channel. Leave priority and assignment empty to let routing rules decide.</p></div></div>
      <form className="form-grid" onSubmit={submit}>
        <div className="panel form-main">
          <div className="two">
            <Field label="Requester email"><input type="email" required value={f.requester_email} onChange={set('requester_email')} placeholder="name@client.com" /></Field>
            <Field label="Requester name" hint="Only needed for someone new"><input value={f.requester_name} onChange={set('requester_name')} /></Field>
          </div>
          <Field label="Received via"><Select value={f.channel} onChange={set('channel')} options={CHANNELS} /></Field>
          <Field label="Subject"><input required value={f.subject} onChange={set('subject')} placeholder="What is the problem, in a few words?" /></Field>
          <Field label="Description"><textarea rows={7} value={f.description} onChange={set('description')} placeholder="What happened, who is affected, what has been tried" /></Field>
          {related.length > 0 && (
            <div className="related">
              <strong>These articles might already solve it</strong>
              <ul>{related.map((a) => <li key={a.id}><a href={`/portal/articles/${a.id}`} target="_blank" rel="noreferrer">{a.title}</a></li>)}</ul>
            </div>
          )}
        </div>
        <div className="panel form-side">
          <Field label="Category"><Select value={f.category_id} onChange={set('category_id')} placeholder="Let routing decide" options={opts(meta?.categories)} /></Field>
          <Field label="Priority"><Select value={f.priority} onChange={set('priority')} placeholder="Let routing decide" options={PRIORITIES} /></Field>
          <Field label="Team"><Select value={f.team_id} onChange={set('team_id')} placeholder="Let routing decide" options={opts(meta?.teams)} /></Field>
          <Field label="Assignee"><Select value={f.assignee_id} onChange={set('assignee_id')} placeholder="Let routing decide" options={opts(meta?.agents)} /></Field>
          <div className="field"><span className="field-label">Tags</span><TagInput value={f.tags} onChange={set('tags')} /></div>
          {(meta?.customFields || []).map((cf) => (
            <Field key={cf.id} label={`${cf.label}${cf.required ? ' (required)' : ''}`}>
              <CustomFieldInput field={cf} value={f.custom_fields[cf.key]} onChange={(v) => setF((x) => ({ ...x, custom_fields: { ...x.custom_fields, [cf.key]: v } }))} />
            </Field>
          ))}
          <ErrorNote error={error} />
          <button className="btn btn-primary wide" disabled={busy}>{busy ? 'Creating…' : 'Create ticket'}</button>
        </div>
      </form>
    </div>
  );
}
