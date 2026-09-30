import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Loading, Logo } from '../../components/ui.jsx';
import RequestForm from './RequestForm.jsx';

export function PublicBar() {
  return (
    <header className="public-bar">
      <Link to="/help" className="brand" style={{ textDecoration: 'none' }}><Logo size={28} /><div><strong>Support</strong><span>Adakole Ticketing System</span></div></Link>
      <nav className="row grow" style={{ gap: 18, marginLeft: 16 }}><Link to="/help">Help articles</Link><Link to="/submit">Submit a request</Link></nav>
      <Link to="/login" className="btn small">Sign in</Link>
    </header>
  );
}

export default function PublicSubmit() {
  const [meta, setMeta] = useState(null);
  const [done, setDone] = useState(null);
  useEffect(() => { api('/public/meta').then(setMeta); }, []);
  return (
    <div className="public">
      <PublicBar />
      <main className="public-main">
        {done ? (
          <div className="card card-pad stack">
            <h1>{done.solved ? 'Glad that helped' : 'Request received'}</h1>
            {done.solved ? <p>No request was sent. If the problem comes back, you can submit one any time.</p> : (
              <p>Your reference is <strong className="mono" style={{ fontSize: 15 }}>{done.reference}</strong>. We've emailed you a copy. Reply to that email to add details.</p>
            )}
            <div className="row"><Link to="/help" className="btn">Browse help articles</Link><button className="btn" onClick={() => setDone(null)}>Submit another request</button></div>
          </div>
        ) : !meta ? <Loading /> : (
          <div className="card card-pad stack">
            <div><h1>Submit a request</h1><p className="muted">No account needed. A technician will reply by email.</p></div>
            <RequestForm meta={meta} isPublic
              onSubmit={async (f) => setDone(await api('/public/tickets', { method: 'POST', body: f }))}
              onSolved={() => setDone({ solved: true })} />
          </div>
        )}
      </main>
    </div>
  );
}
