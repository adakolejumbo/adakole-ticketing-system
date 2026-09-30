import { createContext, useContext, useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { get, setToken, getToken } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tickets from './pages/Tickets.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import NewTicket from './pages/NewTicket.jsx';
import KnowledgeBase, { ArticleEditor } from './pages/KnowledgeBase.jsx';
import Settings from './pages/Settings.jsx';
import { PortalHome, PortalSubmit, PortalRequests, PortalRequest, PortalArticle, PortalLayout } from './pages/Portal.jsx';

const Reports = lazy(() => import('./pages/Reports.jsx'));

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const MetaCtx = createContext(null);
export const useMeta = () => useContext(MetaCtx);

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState(null);

  const signIn = (token, u) => {
    setToken(token);
    setUser(u);
  };
  const signOut = () => {
    setToken(null);
    setUser(null);
    setMeta(null);
  };

  useEffect(() => {
    const onOut = () => { setUser(null); setMeta(null); };
    window.addEventListener('ats:signed-out', onOut);
    if (!getToken()) setReady(true);
    else get('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setReady(true));
    return () => window.removeEventListener('ats:signed-out', onOut);
  }, []);

  const reloadMeta = () => get('/meta').then(setMeta).catch(() => {});
  useEffect(() => {
    if (user) reloadMeta();
  }, [user]);

  if (!ready) return <div className="boot">Loading Adakole Ticketing System…</div>;
  const staff = user && ['admin', 'agent'].includes(user.role);

  return (
    <AuthCtx.Provider value={{ user, signIn, signOut, staff }}>
      <MetaCtx.Provider value={{ meta, reloadMeta }}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to={staff ? '/' : '/portal'} /> : <Login />} />
          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<PortalHome />} />
            <Route path="submit" element={<PortalSubmit />} />
            <Route path="articles/:id" element={<PortalArticle />} />
            <Route path="requests" element={<RequireUser><PortalRequests /></RequireUser>} />
            <Route path="requests/:id" element={<RequireUser><PortalRequest /></RequireUser>} />
          </Route>
          <Route element={<RequireStaff><Layout /></RequireStaff>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/tickets/new" element={<NewTicket />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/kb" element={<KnowledgeBase />} />
            <Route path="/kb/new" element={<ArticleEditor />} />
            <Route path="/kb/:id" element={<ArticleEditor />} />
            <Route path="/reports" element={<Suspense fallback={<div className="loading">Loading reports…</div>}><Reports /></Suspense>} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:tab" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </MetaCtx.Provider>
    </AuthCtx.Provider>
  );
}

function RequireUser({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  return user ? children : <Navigate to="/login" state={{ from: loc.pathname }} />;
}

function RequireStaff({ children }) {
  const { user, staff } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} />;
  if (!staff) return <Navigate to="/portal" />;
  return children;
}
