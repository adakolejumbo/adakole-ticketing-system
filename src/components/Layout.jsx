import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../App.jsx';
import { get } from '../api.js';

export default function Layout() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [counts, setCounts] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => get('/tickets/counts').then(setCounts).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const views = [
    ['mine', 'My open tickets'],
    ['team', 'My team'],
    ['unassigned', 'Unassigned'],
    ['breached', 'SLA breached'],
    ['pending', 'Waiting on customer'],
    ['open', 'All open'],
  ];

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#F4F6F5" />
            <path d="M8 22 15 8h2l7 14h-3.2l-1.5-3.2h-6.6L11.2 22Zm5.8-6h4.4L16 11.3Z" fill="#0E2F2C" />
            <rect x="8" y="24" width="16" height="2" rx="1" fill="#E8A317" />
          </svg>
          <div>
            <strong>Adakole</strong>
            <span>Ticketing System</span>
          </div>
        </div>
        <button className="btn btn-signal new-btn" onClick={() => { setOpen(false); nav('/tickets/new'); }}>New ticket</button>
        <nav onClick={() => setOpen(false)}>
          <NavLink to="/" end>Dashboard</NavLink>
          <div className="nav-group">
            <span className="nav-heading">Queues</span>
            {views.map(([v, text]) => (
              <NavLink key={v} to={`/tickets?view=${v}`} className={() => (loc.pathname === '/tickets' && new URLSearchParams(loc.search).get('view') === v ? 'active' : '')}>
                <span>{text}</span>
                {counts && <em className={v === 'breached' && counts[v] ? 'hot' : ''}>{counts[v]}</em>}
              </NavLink>
            ))}
            <NavLink to="/tickets?view=solved" className={() => (loc.search.includes('view=solved') ? 'active' : '')}>Solved</NavLink>
          </div>
          <div className="nav-group">
            <span className="nav-heading">Workspace</span>
            <NavLink to="/kb">Knowledge base</NavLink>
            <NavLink to="/reports">Reports</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            <a href="/portal" target="_blank" rel="noreferrer">Customer portal ↗</a>
          </div>
        </nav>
        <div className="me">
          <div className="avatar">{user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
          <div className="me-text">
            <strong>{user.name}</strong>
            <span>{user.role === 'admin' ? 'Administrator' : 'Agent'}</span>
          </div>
          <button className="link light" onClick={() => { signOut(); nav('/login'); }}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" aria-label="Open menu" onClick={() => setOpen(!open)}>☰</button>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = e.currentTarget.q.value.trim();
              if (q) nav(`/tickets?view=all&q=${encodeURIComponent(q)}`);
            }}
          >
            <input name="q" placeholder="Search tickets by number, subject or requester" aria-label="Search tickets" />
          </form>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <div className="scrim" onClick={() => setOpen(false)} />
    </div>
  );
}
