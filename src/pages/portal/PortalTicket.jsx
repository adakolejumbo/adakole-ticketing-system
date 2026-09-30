import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Avatar, ErrorBox, Loading, Status } from '../../components/ui.jsx';
import { ago, fullDate, ref } from '../../lib/format.js';

export default function PortalTicket() {
  const { id } = useParams();
  const loc = useLocation();
  const [t, setT] = useState(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api(`/tickets/${id}`).then(setT).catch((e) => setError(e.message)); }, [id]);

  const send = async () => {
    setError('');
    try {
      setT(await api(`/tickets/${id}/comments`, { method: 'POST', body: { body } }));
      setBody('');
    } catch (e) {
      setError(e.message);
    }
  };

  if (error && !t) return <ErrorBox error={error} />;
  if (!t) return <Loading />;
  return (
    <div className="stack">
      {loc.state?.created && <div className="notice">Request sent. Your reference is <strong>{ref(t.id)}</strong>. We've emailed you a copy.</div>}
      <div>
        <div className="small muted"><Link to="/portal">My requests</Link> / <span className="mono">{ref(t.id)}</span></div>
        <h1 style={{ marginTop: 6 }}>{t.subject}</h1>
        <div className="row wrap" style={{ gap: 16, marginTop: 6 }}>
          <Status value={t.status} />
          <span className="small muted">Opened {fullDate(t.created_at)}</span>
          <span className="small muted">{t.assignee_name ? `Technician: ${t.assignee_name}` : 'Waiting for a technician'}</span>
        </div>
      </div>
      <div className="thread">
        <article className="msg origin">
          <div className="msg-head"><Avatar name={t.requester_name} /><span className="who grow">You</span><span className="small muted">{ago(t.created_at)}</span></div>
          <div className="msg-body">{t.description || <span className="muted">No details added.</span>}</div>
        </article>
        {t.comments.map((c) => (
          <article key={c.id} className={`msg ${c.author_role === 'client' ? '' : 'agent'}`}>
            <div className="msg-head"><Avatar name={c.author_name} /><span className="who grow">{c.author_role === 'client' ? 'You' : c.author_name}</span><span className="small muted">{ago(c.created_at)}</span></div>
            <div className="msg-body">{c.body}</div>
          </article>
        ))}
      </div>
      {t.articles.length > 0 && (
        <div className="suggest"><strong>Guides your technician shared</strong>
          {t.articles.map((a) => <Link key={a.id} to={`/help/${a.id}`}>{a.title}</Link>)}</div>
      )}
      <ErrorBox error={error} />
      {t.status === 'closed' ? (
        <div className="notice">This request is closed. <Link to="/portal/new">Start a new request</Link> and mention {ref(t.id)} if it's the same problem.</div>
      ) : (
        <div className="composer">
          <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Reply"
            placeholder={t.status === 'resolved' ? 'Still not fixed? Reply here and the request will reopen.' : 'Add more detail or answer a question'} />
          <div className="composer-foot"><span className="grow" /><button className="btn primary" disabled={!body.trim()} onClick={send}>Send reply</button></div>
        </div>
      )}
    </div>
  );
}
