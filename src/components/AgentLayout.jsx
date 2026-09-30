import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Gauge, Inbox, UserRound, CircleDashed, Flame, PauseCircle, CheckCircle2, List, BookOpen, BarChart3, Settings, Plus, Search, Menu, MessageSquareText } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Avatar, Logo } from './ui.jsx';

const VIEWS = [
  ['mine', 'My open tickets', UserRound],
  ['unassigned', 'Unassigned', CircleDashed],
  ['open', 'All open', Inbox],
  ['breached', 'SLA breached', Flame],
  ['pending', 'Pending', PauseCircle],
  ['resolved', 'Resolved', CheckCircle2],
  ['all', 'Everything', List],
];

export default function AgentLayout() {
  const { user, admin, logout } = useAuth();
  const [counts, setCounts] = useState({});
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const [q, setQ] = useState('');

  useEffect(() => {
    const load = () => api('/tickets/counts').then(setCounts).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [loc.pathname, loc.search]);
  useEffect(() => setOpen(false), [loc.pathname, loc.search]);

  const currentView = loc.pathname === '/tickets' ? params.get('view') || 'open' : null;

  const search = (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (/^(ats-)?\d+$/i.test(term)) nav(`/tickets/${term.replace(/^ats-/i, '')}`);
    else nav(`/tickets?view=all&q=${encodeURIComponent(term)}`);
    setQ('');
  };

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <Logo />
          <div><strong>Adakole</strong><span>Ticketing System</span></div>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end><Gauge size={17} /> Dashboard</NavLink>
          <NavLink to="/tickets/new"><Plus size={17} /> New ticket</NavLink>
        </nav>
        <nav className="nav" aria-label="Ticket views">
          <div className="nav-heading">Views</div>
          {VIEWS.map(([key, label, Icon]) => (
            <NavLink key={key} to={`/tickets?view=${key}`} className={() => (currentView === key ? 'active' : '')}>
              <Icon size={17} /> {label}
              {counts[key] !== undefined && key !== 'resolved' && (
                <span className={`count${key === 'breached' && counts[key] > 0 ? ' hot' : ''}`}>{counts[key]}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <nav className="nav" aria-label="Workspace">
          <NavLink to="/kb"><BookOpen size={17} /> Knowledge base</NavLink>
          <NavLink to="/reports"><BarChart3 size={17} /> Reports</NavLink>
          {admin ? (
            <NavLink to="/admin/users" className={() => (loc.pathname.startsWith('/admin') ? 'active' : '')}><Settings size={17} /> Settings</NavLink>
          ) : (
            <NavLink to="/admin/macros"><MessageSquareText size={17} /> Shared replies</NavLink>
          )}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/account" className="whoami" style={{ textDecoration: 'none' }}>
            <Avatar name={user.name} />
            <div><div className="name">{user.name}</div><div className="role">{user.role}</div></div>
          </NavLink>
          <button className="btn ghost small" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost small mobile-toggle" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <form onSubmit={search} className="grow" style={{ maxWidth: 520, position: 'relative' }} role="search">
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 32 }} placeholder="Find a ticket by number, subject or requester" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" />
          </form>
          <NavLink to="/tickets/new" className="btn primary hide-sm"><Plus size={15} /> New ticket</NavLink>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
