import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { useFetch, tnum, timeAgo, duration } from '../lib.js';
import { SlaRail, PriorityTag, StatusBadge, Loading, ErrorNote, Empty } from '../components/ui.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const counts = useFetch('/tickets/counts');
  const mine = useFetch('/tickets?view=mine&sort=due');
  const risk = useFetch('/tickets?view=open&sort=due&limit=60');
  const rep = useFetch('/reports?days=7&tz=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone));

  const activeBreach = (t) => (t.sla.resolution && !t.sla.resolution.done && !t.sla.resolution.paused && t.sla.resolution.breached) || (t.sla.firstResponse && !t.sla.firstResponse.done && t.sla.firstResponse.breached);
  const urgent = (risk.data?.tickets || []).filter((t) => activeBreach(t) || t.sla_at_risk).slice(0, 8);
  const c = counts.data;
  const s = rep.data?.summary;
  const hour = new Date().getHours();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
          <p className="muted">Here is what needs attention across all clients.</p>
        </div>
        <Link to="/tickets/new" className="btn btn-primary">Log a ticket</Link>
      </div>

      <ErrorNote error={counts.error} onRetry={counts.reload} />
      <div className="stat-strip">
        <Stat to="/tickets?view=mine" n={c?.mine} text="assigned to you" />
        <Stat to="/tickets?view=unassigned" n={c?.unassigned} text="unassigned" />
        <Stat to="/tickets?view=breached" n={c?.breached} text="past SLA" hot={c?.breached > 0} />
        <Stat to="/tickets?view=pending" n={c?.pending} text="waiting on customer" />
        <Stat to="/tickets?view=open" n={c?.open} text="open in total" />
      </div>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head"><h2>Needs attention now</h2><Link to="/tickets?view=open&sort=due" className="link">Open queue</Link></div>
          {risk.loading && !risk.data ? <Loading /> : urgent.length ? (
            <ul className="attention">
              {urgent.map((t) => (
                <li key={t.id}>
                  <Link to={`/tickets/${t.id}`}>
                    <div className="attention-top">
                      <span className="tnum">{tnum(t.id)}</span>
                      <PriorityTag priority={t.priority} />
                      <span className="muted">{t.org_name || t.requester_name}</span>
                    </div>
                    <strong>{t.subject}</strong>
                    <SlaRail ticket={t} compact />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty title="Nothing is close to breaching">No open ticket is overdue or within the last quarter of its SLA time.</Empty>}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Your queue</h2><Link to="/tickets?view=mine" className="link">See all</Link></div>
          {mine.loading && !mine.data ? <Loading /> : mine.data?.tickets.length ? (
            <table className="mini-table">
              <tbody>
                {mine.data.tickets.slice(0, 8).map((t) => (
                  <tr key={t.id}>
                    <td><Link to={`/tickets/${t.id}`}><span className="tnum">{tnum(t.id)}</span> {t.subject}</Link></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="muted nowrap">{timeAgo(t.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty title="Your queue is clear" action={<Link className="btn" to="/tickets?view=unassigned">Pick up an unassigned ticket</Link>} />}
        </section>

        <section className="panel span-2">
          <div className="panel-head"><h2>Last 7 days</h2><Link to="/reports" className="link">Full reports</Link></div>
          {s ? (
            <div className="kpis">
              <Kpi n={s.created} text="tickets received" />
              <Kpi n={s.resolved} text="resolved" />
              <Kpi n={duration(s.avg_first_response_mins)} text="average first reply" />
              <Kpi n={s.avg_resolution_hours != null ? `${s.avg_resolution_hours}h` : '—'} text="average time to resolve" />
              <Kpi n={s.resolution_sla != null ? `${s.resolution_sla}%` : '—'} text="resolved within SLA" />
            </div>
          ) : <Loading />}
        </section>
      </div>
    </div>
  );
}

function Stat({ to, n, text, hot }) {
  return (
    <Link to={to} className={`stat ${hot ? 'stat-hot' : ''}`}>
      <strong>{n ?? '–'}</strong>
      <span>{text}</span>
    </Link>
  );
}

function Kpi({ n, text }) {
  return <div className="kpi"><strong>{n ?? '—'}</strong><span>{text}</span></div>;
}
