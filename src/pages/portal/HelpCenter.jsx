import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Loading } from '../../components/ui.jsx';
import { PublicBar } from './PublicSubmit.jsx';

function Article({ id }) {
  const { user } = useAuth();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [voted, setVoted] = useState(false);
  useEffect(() => { api(`/kb/${id}`).then(setA).catch((e) => setError(e.message)); }, [id]);
  if (error) return <ErrorBox error={error} />;
  if (!a) return <Loading />;
  return (
    <div className="article">
      <div className="small muted"><Link to="/help">Help articles</Link> / {a.category_name || 'General'}</div>
      <h1 style={{ margin: '8px 0 16px' }}>{a.title}</h1>
      <div className="card card-pad article-body">{a.body}</div>
      <div className="card card-pad spread" style={{ marginTop: 14 }}>
        {voted ? <span>Thanks for letting us know.</span> : <>
          <span>Did this fix it?</span>
          <div className="row">
            <button className="btn" onClick={() => { api(`/kb/${id}/deflect`, { method: 'POST' }); setVoted(true); }}>Yes, it's fixed</button>
            <Link className="btn primary" to={user && user.role === 'client' ? '/portal/new' : user ? '/tickets/new' : '/submit'}>No, contact support</Link>
          </div>
        </>}
      </div>
    </div>
  );
}

export default function HelpCenter() {
  const { id } = useParams();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  useEffect(() => {
    if (id) return;
    const t = setTimeout(() => api('/kb', { params: { q } }).then(setList), 200);
    return () => clearTimeout(t);
  }, [q, id]);

  const groups = {};
  for (const a of list || []) (groups[a.category_name || 'General'] ||= []).push(a);

  return (
    <div className="public">
      <PublicBar />
      <main className="public-main">
        {id ? <Article id={id} /> : (
          <div className="stack">
            <h1>How can we help?</h1>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input className="input" style={{ paddingLeft: 36, fontSize: 16, padding: '11px 12px 11px 36px' }} placeholder="Describe the problem, for example: locked out" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search help articles" />
            </div>
            {!list ? <Loading /> : list.length === 0 ? (
              <Empty title="No guide for that yet"><p><Link to="/submit">Send us a request</Link> and a technician will help.</p></Empty>
            ) : Object.entries(groups).map(([cat, arts]) => (
              <section key={cat}>
                <h2 style={{ margin: '12px 0 8px' }}>{cat}</h2>
                <div className="card">{arts.map((a) => (
                  <Link key={a.id} to={`/help/${a.id}`} className="rule" style={{ display: 'block', color: 'inherit' }}>
                    <strong style={{ color: 'var(--teal)' }}>{a.title}</strong>
                    <p className="small muted" style={{ margin: '2px 0 0' }}>{a.excerpt.replace(/\s+/g, ' ').slice(0, 140)}…</p>
                  </Link>))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
