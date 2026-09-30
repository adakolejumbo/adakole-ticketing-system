import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, Loading, Status } from '../../components/ui.jsx';
import { ago, ref, OPEN } from '../../lib/format.js';

export default function PortalHome() {
  const { user } = useAuth();
  const loc = useLocation();
  const [tickets, setTickets] = useState(null);
  const [show, setShow] = useState('open');
  useEffect(() => { api('/tickets', { params: { limit: 100 } }).then((d) => setTickets(d.tickets)); }, []);
  const shown = tickets?.filter((t) => (show === 'open' ? OPEN.includes(t.status) : !OPEN.includes(t.status)));

  return (
    <div className="stack">
      {loc.state?.solved && <div className="notice">Glad that sorted it. No request was sent.</div>}
      <div className="spread">
        <div><h1>Hi {user.name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0]}</h1><p className="muted" style={{ margin: 0 }}>Track your requests or start a new one.</p></div>
        <Link to="/portal/new" className="btn primary">New request</Link>
      </div>
      <div className="card">
        <div className="tabs" style={{ margin: 0, padding: '0 10px' }}>
          <a href="#open" className={show === 'open' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setShow('open'); }}>Open</a>
          <a href="#done" className={show === 'done' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setShow('done'); }}>Resolved</a>
        </div>
        {!shown ? <Loading /> : shown.length === 0 ? (
          <Empty title={show === 'open' ? 'Nothing open' : 'Nothing resolved yet'}>
            <p>Need something? <Link to="/portal/new">Start a request</Link> or <Link to="/help">search the help articles</Link>.</p>
          </Empty>
        ) : (
          <table className="tickets"><tbody>
            {shown.map((t) => (
              <tr key={t.id}>
                <td className="mono muted" style={{ width: 90 }}>{ref(t.id)}</td>
                <td><Link to={`/portal/tickets/${t.id}`} className="subj">{t.subject}</Link><span className="subj-meta">Updated {ago(t.updated_at)}</span></td>
                <td><Status value={t.status} /></td>
                <td className="hide-sm small muted">{t.assignee_name ? `With ${t.assignee_name.split(' ')[0]}` : 'Waiting for a technician'}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
