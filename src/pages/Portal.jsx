import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { get, post, patch } from '../api.js';
import { useAuth } from '../App.jsx';
import { tnum, timeAgo, fmtDate } from '../lib.js';
import { StatusBadge, Loading, ErrorNote, Empty, Field } from '../components/ui.jsx';

export function PortalLayout() {
  const { user, signOut, staff } = useAuth();
  const nav = useNavigate();
  return (
    <div className="portal">
      <header className="portal-top">
        <Link to="/portal" className="portal-brand">Adakole Service Desk</Link>
        <nav>
          <NavLink to="/portal" end>Help center</NavLink>
          <NavLink to="/portal/submit">Submit a request</NavLink>
          {user && <NavLink to="/portal/requests">My requests</NavLink>}
          {staff && <Link to="/">Agent workspace</Link>}
          {user ? <button className="link light" onClick={() => { signOut(); nav('/portal'); }}>Sign out</button> : <Link to="/login">Sign in</Link>}
        </nav>
      </header>
      <main className="portal-main"><Outlet /></main>
      <ChatWidget />
      <footer className="portal-foot">Adakole Ticketing System</footer>
    </div>
  );
}

export function PortalHome() {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(null);
  const [hits, setHits] = useState(null);

  useEffect(() => { get('/public/kb').then((d) => setAll(d.articles)).catch(() => setAll([])); }, []);
  useEffect(() => {
    if (q.trim().length < 3) return setHits(null);
    const t = setTimeout(() => get(`/public/kb?q=${encodeURIComponent(q)}`).then((d) => setHits(d.articles)), 250);
    return () => clearTimeout(t);
  }, [q]);

  const groups = (all || []).reduce((m, a) => ((m[a.category_name || 'General'] ||= []).push(a), m), {});

  return (
    <>
      <section className="portal-hero">
        <h1>How can we help?</h1>
        <input className="big-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe your problem, for example “locked out” or “printer offline”" aria-label="Search help articles" autoFocus />
        {hits && (
          <div className="hits">
            {hits.length ? hits.map((a) => (
              <Link key={a.id} to={`/portal/articles/${a.id}`} className="hit"><strong>{a.title}</strong><span>{a.excerpt}…</span></Link>
            )) : <p className="muted">No articles match. <Link className="link" to="/portal/submit">Submit a request</Link> and we will help.</p>}
          </div>
        )}
      </section>
      {!all ? <Loading /> : (
        <section className="kb-groups">
          {Object.entries(groups).map(([cat, list]) => (
            <div key={cat} className="kb-group">
              <h2>{cat}</h2>
              <ul>{list.map((a) => <li key={a.id}><Link to={`/portal/articles/${a.id}`}>{a.title}</Link></li>)}</ul>
            </div>
          ))}
          <div className="kb-group kb-cta">
            <h2>Still stuck?</h2>
            <p>Send us the details and the right technician will pick it up.</p>
            <Link to="/portal/submit" className="btn btn-primary">Submit a request</Link>
          </div>
        </section>
      )}
    </>
  );
}

export function PortalArticle() {
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [voted, setVoted] = useState(false);
  useEffect(() => { get(`/public/kb/${id}`).then((d) => setA(d.article)).catch((e) => setError(e.message)); }, [id]);
  if (error) return <ErrorNote error={error} />;
  if (!a) return <Loading />;
  const vote = (helpful) => { post(`/public/kb/${id}/feedback`, { helpful }); setVoted(true); };
  return (
    <article className="article">
      <Link to="/portal" className="link">Help center</Link>{a.category_name && <span className="muted"> / {a.category_name}</span>}
      <h1>{a.title}</h1>
      <p className="muted small">Updated {fmtDate(a.updated_at)}</p>
      <ArticleBody text={a.body} />
      <div className="vote">
        {voted ? <span>Thanks for the feedback.</span> : (
          <>
            <span>Did this solve your problem?</span>
            <button className="btn" onClick={() => vote(true)}>Yes</button>
            <button className="btn" onClick={() => vote(false)}>No</button>
          </>
        )}
        <Link className="link" to="/portal/submit">Submit a request</Link>
      </div>
    </article>
  );
}

function ArticleBody({ text }) {
  const linkify = (s) => s.split(/(https?:\/\/\S+)/g).map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p));
  return (
    <div className="article-body">
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split('\n').filter(Boolean);
        if (lines.length && lines.every((l) => /^\d+\.\s/.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{linkify(l.replace(/^\d+\.\s/, ''))}</li>)}</ol>;
        return <p key={i}>{linkify(block)}</p>;
      })}
    </div>
  );
}

export function PortalSubmit() {
  const { user } = useAuth();
  const [cats, setCats] = useState([]);
  const [f, setF] = useState({ name: '', email: '', subject: '', description: '', category_id: '' });
  const [suggest, setSuggest] = useState([]);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { get('/public/categories').then((d) => setCats(d.categories)).catch(() => {}); }, []);
  useEffect(() => {
    const text = `${f.subject} ${f.description}`.trim();
    if (text.length < 6) return setSuggest([]);
    const t = setTimeout(() => get(`/public/kb?q=${encodeURIComponent(text)}`).then((d) => setSuggest(d.articles.slice(0, 3))).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [f.subject, f.description]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setDone(await post('/public/tickets', f));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return (
    <div className="portal-card done">
      <h1>Request {done.number} received</h1>
      <p>We have sent it to the right team. You will get replies by email{user ? ' and can follow it under My requests' : ''}. Keep {done.number} in the subject line if you reply by email.</p>
      <div className="row-actions">
        {user ? <Link className="btn btn-primary" to={`/portal/requests/${done.id}`}>View request</Link> : <Link className="btn btn-primary" to="/login">Create an account to track it</Link>}
        <button className="btn" onClick={() => { setDone(null); setF({ ...f, subject: '', description: '' }); }}>Submit another</button>
      </div>
    </div>
  );

  return (
    <div className="portal-card">
      <h1>Submit a request</h1>
      <p className="muted">Tell us what is happening. The more detail, the faster we can fix it.</p>
      <form onSubmit={submit} className="stack">
        {!user && (
          <div className="two">
            <Field label="Your name"><input required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
            <Field label="Work email"><input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
          </div>
        )}
        <Field label="What is it about?">
          <select value={f.category_id} onChange={set('category_id')}>
            <option value="">Not sure</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Subject"><input required value={f.subject} onChange={set('subject')} placeholder="For example: Cannot sign in to Outlook" /></Field>
        <Field label="Details"><textarea rows={7} value={f.description} onChange={set('description')} placeholder="What happened, when it started, who is affected, and any error messages" /></Field>
        {suggest.length > 0 && (
          <div className="related">
            <strong>Before you send, these might fix it right away</strong>
            <ul>{suggest.map((a) => <li key={a.id}><Link to={`/portal/articles/${a.id}`} target="_blank">{a.title}</Link></li>)}</ul>
          </div>
        )}
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</button>
      </form>
    </div>
  );
}

export function PortalRequests() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { get('/tickets?view=all&sort=updated').then((d) => setRows(d.tickets)).catch((e) => setError(e.message)); }, []);
  return (
    <div className="portal-card wide">
      <div className="panel-head"><h1>My requests</h1><Link className="btn btn-primary" to="/portal/submit">Submit a request</Link></div>
      <ErrorNote error={error} />
      {!rows ? <Loading /> : rows.length === 0 ? <Empty title="You have no requests yet" /> : (
        <ul className="req-list">
          {rows.map((t) => (
            <li key={t.id}>
              <Link to={`/portal/requests/${t.id}`}>
                <span className="tnum">{tnum(t.id)}</span>
                <strong>{t.subject}</strong>
                <StatusBadge status={t.status === 'new' ? 'new' : t.status} />
                <span className="muted small">Updated {timeAgo(t.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PortalRequest() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const load = () => get(`/tickets/${id}`).then(setD).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);
  if (error && !d) return <ErrorNote error={error} />;
  if (!d) return <Loading />;
  const t = d.ticket;
  const reply = async (e) => {
    e.preventDefault();
    try {
      await post(`/tickets/${id}/comments`, { body: text });
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const solved = ['resolved', 'closed'].includes(t.status);
  return (
    <div className="portal-card wide">
      <Link to="/portal/requests" className="link">My requests</Link>
      <h1>{t.subject}</h1>
      <div className="ticket-meta"><span className="tnum">{tnum(t.id)}</span><StatusBadge status={t.status} /><span className="muted">Opened {fmtDate(t.created_at)}{t.assignee_name ? `, handled by ${t.assignee_name}` : ''}</span></div>
      <ol className="thread">
        {d.comments.map((c) => (
          <li key={c.id} className={`msg ${['admin', 'agent'].includes(c.author_role) ? 'msg-agent' : 'msg-customer'}`}>
            <div className="msg-head"><strong>{c.author_name}</strong><time className="muted">{timeAgo(c.created_at)}</time></div>
            <div className="msg-body">{c.body}</div>
          </li>
        ))}
      </ol>
      <ErrorNote error={error} />
      {t.status === 'closed' ? <p className="muted">This request is closed. Submit a new one if you need more help.</p> : (
        <form onSubmit={reply} className="stack">
          <textarea rows={4} required value={text} onChange={(e) => setText(e.target.value)} placeholder={solved ? 'Reply to reopen this request' : 'Add a reply'} aria-label="Reply" />
          <div className="row-actions">
            <button className="btn btn-primary">{solved ? 'Reply and reopen' : 'Send reply'}</button>
            {!solved && <button type="button" className="btn" onClick={async () => { await patch(`/tickets/${id}`, { status: 'resolved' }); load(); }}>Mark as solved</button>}
          </div>
        </form>
      )}
    </div>
  );
}

function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', description: '' });
  const [sent, setSent] = useState(null);
  const [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const subject = f.description.split('\n')[0].slice(0, 70) || 'Chat conversation';
      setSent(await post('/public/tickets', { ...f, subject, channel: 'chat' }));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className={`chat ${open ? 'chat-open' : ''}`}>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Chat with support">
          <div className="chat-head"><strong>Chat with support</strong><button className="link light" onClick={() => setOpen(false)} aria-label="Close chat">×</button></div>
          {sent ? (
            <div className="chat-body"><p>Thanks. Your conversation is {sent.number}. A technician will reply by email shortly.</p><button className="btn" onClick={() => { setSent(null); setF({ ...f, description: '' }); }}>Start another</button></div>
          ) : (
            <form className="chat-body" onSubmit={send}>
              {!user && <><input required placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Your name" />
                <input required type="email" placeholder="Work email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Work email" /></>}
              <textarea required rows={4} placeholder="How can we help?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} aria-label="Message" />
              <ErrorNote error={error} />
              <button className="btn btn-primary">Send</button>
            </form>
          )}
        </div>
      )}
      <button className="chat-btn" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Chat with us'}</button>
    </div>
  );
}
