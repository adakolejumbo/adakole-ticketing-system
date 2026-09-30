import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, patch, post } from '../api.js';
import { useAuth, useMeta } from '../App.jsx';
import { STATUSES, PRIORITIES, tnum, fmtDate, timeAgo, duration, label, fillMacro, CHANNELS } from '../lib.js';
import { SlaRail, StatusBadge, PriorityTag, ChannelTag, Select, TagInput, CustomFieldInput, Loading, ErrorNote, opts } from '../components/ui.jsx';

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { meta } = useMeta();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('reply');
  const [text, setText] = useState('');
  const [submitAs, setSubmitAs] = useState('');
  const [sending, setSending] = useState(false);
  const [fields, setFields] = useState({});
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = async () => {
    try {
      const d = await get(`/tickets/${id}`);
      setData(d);
      setFields(d.ticket.custom_fields || {});
      setFieldsDirty(false);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    setData(null);
    load();
  }, [id]);

  if (error && !data) return <div className="page"><ErrorNote error={error} onRetry={load} /></div>;
  if (!data) return <div className="page"><Loading what="Opening ticket" /></div>;
  const t = data.ticket;

  const update = async (changes) => {
    try {
      const d = await patch(`/tickets/${t.id}`, changes);
      setData((x) => ({ ...x, ticket: { ...x.ticket, ...d.ticket } }));
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await post(`/tickets/${t.id}/comments`, {
        body: text,
        is_internal: mode === 'note',
        changes: submitAs ? { status: submitAs } : undefined,
      });
      setText('');
      setSubmitAs('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const applyMacro = (macroId) => {
    const m = meta?.macros.find((x) => String(x.id) === String(macroId));
    if (!m) return;
    setMode(m.is_internal ? 'note' : 'reply');
    setText((prev) => (prev ? prev + '\n\n' : '') + fillMacro(m.body, { ticket: t, agent: user }));
    if (m.set_status) setSubmitAs(m.set_status);
    if (m.set_priority && m.set_priority !== t.priority) update({ priority: m.set_priority });
  };

  const linkArticle = async (articleId, remove) => {
    await post(`/tickets/${t.id}/articles`, { article_id: articleId, remove });
    load();
  };

  const teamAgents = (meta?.agents || []).filter((a) => !t.team_id || a.team_id === t.team_id);
  const otherAgents = (meta?.agents || []).filter((a) => t.team_id && a.team_id !== t.team_id);

  return (
    <div className="page page-wide ticket-page">
      <div className="ticket-head">
        <div className="crumbs"><Link to="/tickets" className="link">Tickets</Link><span>/</span><span className="tnum">{tnum(t.id)}</span></div>
        <h1>{t.subject}</h1>
        <div className="ticket-meta">
          <StatusBadge status={t.status} />
          <PriorityTag priority={t.priority} />
          <ChannelTag channel={t.channel} />
          <span>Opened {fmtDate(t.created_at)} by <strong>{t.requester_name}</strong> ({t.requester_email}){t.org_name ? `, ${t.org_name}` : ''}</span>
        </div>
      </div>
      <ErrorNote error={error} />

      <div className="ticket-layout">
        <section className="thread-col">
          <ol className="thread">
            {data.comments.map((c) => {
              const staff = ['admin', 'agent'].includes(c.author_role);
              return (
                <li key={c.id} className={`msg ${c.is_internal ? 'msg-note' : staff ? 'msg-agent' : 'msg-customer'}`}>
                  <div className="msg-head">
                    <strong>{c.author_name || 'Unknown'}</strong>
                    <span className="muted">
                      {c.is_internal ? 'Internal note' : staff ? 'Replied' : `Wrote via ${label(CHANNELS, c.channel).toLowerCase()}`}
                    </span>
                    <time className="muted" dateTime={c.created_at} title={new Date(c.created_at).toLocaleString()}>{timeAgo(c.created_at)}</time>
                  </div>
                  <div className="msg-body">{c.body}</div>
                </li>
              );
            })}
          </ol>

          <div className={`composer ${mode === 'note' ? 'composer-note' : ''}`}>
            <div className="composer-tabs" role="tablist">
              <button role="tab" aria-selected={mode === 'reply'} className={mode === 'reply' ? 'on' : ''} onClick={() => setMode('reply')}>Public reply</button>
              <button role="tab" aria-selected={mode === 'note'} className={mode === 'note' ? 'on' : ''} onClick={() => setMode('note')}>Internal note</button>
              <Select value="" onChange={applyMacro} placeholder="Insert macro…" options={(meta?.macros || []).map((m) => ({ value: m.id, label: m.name }))} aria-label="Insert macro" />
            </div>
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === 'note' ? 'Only your team can see this note.' : `Reply to ${t.requester_name?.split(' ')[0] || 'the requester'}. They will be notified.`}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }}
            />
            <div className="composer-foot">
              <span className="muted small">{mode === 'note' ? 'Visible to agents only' : 'Visible to the requester'} · Ctrl+Enter to send</span>
              <div className="composer-actions">
                <Select value={submitAs} onChange={setSubmitAs} placeholder={`Keep status: ${label(STATUSES, t.status)}`} options={STATUSES.filter((s) => s.value !== t.status)} aria-label="Status after sending" />
                <button className="btn btn-primary" disabled={sending || !text.trim()} onClick={send}>
                  {sending ? 'Sending…' : mode === 'note' ? 'Add note' : submitAs ? `Send and set ${label(STATUSES, submitAs).toLowerCase()}` : 'Send reply'}
                </button>
              </div>
            </div>
          </div>

          <div className="panel log">
            <button className="link" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} activity log ({data.activity.length})</button>
            {showLog && (
              <ol className="activity">
                {data.activity.map((a) => <li key={a.id}><Activity a={a} meta={meta} /></li>)}
              </ol>
            )}
          </div>
        </section>

        <aside className="props">
          <div className="panel">
            <h2>Service level</h2>
            <Clock title="First reply" c={t.sla.firstResponse} />
            <Clock title="Resolution" c={t.sla.resolution} />
            <SlaRail ticket={t} />
          </div>

          <div className="panel">
            <h2>Properties</h2>
            <label className="field"><span className="field-label">Status</span>
              <Select value={t.status} onChange={(v) => update({ status: v })} options={STATUSES} /></label>
            <label className="field"><span className="field-label">Priority</span>
              <Select value={t.priority} onChange={(v) => update({ priority: v })} options={PRIORITIES} /></label>
            <label className="field"><span className="field-label">Category</span>
              <Select value={t.category_id} onChange={(v) => update({ category_id: v || null })} placeholder="Uncategorized" options={opts(meta?.categories)} /></label>
            <label className="field"><span className="field-label">Team</span>
              <Select value={t.team_id} onChange={(v) => update({ team_id: v || null })} placeholder="No team" options={opts(meta?.teams)} /></label>
            <label className="field"><span className="field-label">Assignee</span>
              <select value={t.assignee_id ?? ''} onChange={(e) => update({ assignee_id: e.target.value || null })}>
                <option value="">Unassigned</option>
                <optgroup label={t.team_name || 'Agents'}>{teamAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                {otherAgents.length > 0 && <optgroup label="Other teams">{otherAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
              </select>
            </label>
            {t.assignee_id !== user.id && <button className="link" onClick={() => update({ assignee_id: user.id })}>Assign to me</button>}
            <div className="field"><span className="field-label">Tags</span>
              <TagInput value={t.tags || []} onChange={(tags) => update({ tags })} /></div>
            {(meta?.customFields || []).map((f) => (
              <label className="field" key={f.id}><span className="field-label">{f.label}</span>
                <CustomFieldInput field={f} value={fields[f.key]} onChange={(v) => { setFields({ ...fields, [f.key]: v }); setFieldsDirty(true); }} /></label>
            ))}
            {fieldsDirty && <button className="btn" onClick={() => update({ custom_fields: fields })}>Save fields</button>}
          </div>

          <div className="panel">
            <h2>Knowledge base</h2>
            {data.linked.length > 0 && (
              <ul className="kb-links">
                {data.linked.map((a) => (
                  <li key={a.id}><a href={`/portal/articles/${a.id}`} target="_blank" rel="noreferrer">{a.title}</a>
                    <button className="link" onClick={() => linkArticle(a.id, true)}>Unlink</button></li>
                ))}
              </ul>
            )}
            {data.suggestions.filter((s) => !data.linked.some((l) => l.id === s.id)).length ? (
              <>
                <p className="muted small">Suggested for this ticket</p>
                <ul className="kb-suggest">
                  {data.suggestions.filter((s) => !data.linked.some((l) => l.id === s.id)).map((a) => (
                    <li key={a.id}>
                      <strong>{a.title}</strong>
                      <div className="row-actions">
                        <button className="link" onClick={() => { setMode('reply'); setText((p) => `${p}${p ? '\n\n' : ''}This guide should help: ${a.title}\n${location.origin}/portal/articles/${a.id}`); }}>Insert link in reply</button>
                        <button className="link" onClick={() => linkArticle(a.id)}>Link to ticket</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : !data.linked.length && <p className="muted small">No matching articles. <Link to="/kb/new" className="link">Write one</Link> if this comes up often.</p>}
          </div>

          {data.requesterTickets.length > 0 && (
            <div className="panel">
              <h2>Other requests from {t.requester_name?.split(' ')[0]}</h2>
              <ul className="plain">
                {data.requesterTickets.map((r) => (
                  <li key={r.id}><Link to={`/tickets/${r.id}`}><span className="tnum">{tnum(r.id)}</span> {r.subject}</Link> <StatusBadge status={r.status} /></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Clock({ title, c }) {
  if (!c) return null;
  let text;
  let tone = 'ok';
  if (c.done) { text = c.breached ? `Missed by ${duration(-c.remainingMins)}` : 'Met'; tone = c.breached ? 'breach' : 'met'; }
  else if (c.paused) { text = `Paused, ${duration(c.remainingMins)} left`; tone = 'paused'; }
  else if (c.breached) { text = `Overdue by ${duration(c.remainingMins)}`; tone = 'breach'; }
  else { text = `${duration(c.remainingMins)} left`; tone = c.used > 0.75 ? 'warn' : 'ok'; }
  return (
    <div className={`clock clock-${tone}`}>
      <span>{title}</span>
      <strong>{text}</strong>
      <small className="muted">Due {fmtDate(c.due)}</small>
    </div>
  );
}

function Activity({ a, meta }) {
  const who = a.actor_name || 'System';
  const name = (list, id) => list?.find((x) => x.id === id)?.name || 'none';
  const d = a.detail || {};
  let text;
  switch (a.action) {
    case 'created': {
      const r = d.routing || {};
      const parts = [];
      if (r.rules?.length) parts.push(`rules: ${r.rules.join(', ')}`);
      if (r.ai) parts.push(`AI triage suggested ${r.ai.category || 'a category'} / ${r.ai.priority || 'priority'}`);
      if (r.agent) parts.push(`assigned ${r.agent}`);
      text = <>Ticket created via {label(CHANNELS, d.channel).toLowerCase()}{parts.length ? <>. Routing: {parts.join('; ')}</> : null}</>;
      break;
    }
    case 'status': text = <>{who} changed status from {label(STATUSES, d.from)} to {label(STATUSES, d.to)}</>; break;
    case 'priority': text = <>{who} changed priority from {label(PRIORITIES, d.from)} to {label(PRIORITIES, d.to)}</>; break;
    case 'assignee_id': text = <>{who} reassigned from {name(meta?.agents, d.from)} to {name(meta?.agents, d.to)}</>; break;
    case 'team_id': text = <>{who} moved to team {name(meta?.teams, d.to)}</>; break;
    case 'category_id': text = <>{who} set category to {name(meta?.categories, d.to)}</>; break;
    case 'reply': text = <>{who} replied{d.channel ? ` by ${d.channel}` : ''}</>; break;
    case 'internal_note': text = <>{who} added an internal note</>; break;
    case 'tags': text = <>{who} updated tags</>; break;
    case 'custom_fields': text = <>{who} updated custom fields</>; break;
    default: text = <>{who}: {a.action}</>;
  }
  return <><span>{text}</span><time className="muted">{fmtDate(a.created_at)}</time></>;
}
