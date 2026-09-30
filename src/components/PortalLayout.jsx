import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Logo } from './ui.jsx';

export default function PortalLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="public">
      <header className="public-bar">
        <NavLink to="/portal" className="brand" style={{ textDecoration: 'none' }}>
          <Logo size={28} />
          <div><strong>Support</strong><span>Adakole Ticketing System</span></div>
        </NavLink>
        <nav className="row grow" style={{ gap: 18, marginLeft: 16 }}>
          <NavLink to="/portal" end>My requests</NavLink>
          <NavLink to="/help">Help articles</NavLink>
        </nav>
        <NavLink to="/portal/account" className="hide-sm">{user.name}</NavLink>
        <button className="btn small" onClick={logout}>Sign out</button>
      </header>
      <main className="public-main"><Outlet /></main>
    </div>
  );
}
