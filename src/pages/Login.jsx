import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../App.jsx';

const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO !== 'false';
const DEMO_ACCOUNTS = [
  { role: 'Admin', blurb: 'Full access: queue, reports, routing, SLAs, settings', email: 'admin@ats.local', password: 'Admin123!' },
  { role: 'Agent', blurb: 'Work tickets, reply, add internal notes', email: 'priya@ats.local', password: 'Password123!' },
  { role: 'Client', blurb: 'Customer portal: submit and track own requests', email: 'anna@fvdental.ca', password: 'Password123!' },
];

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const authenticate = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      const d = await post(path, body);
      signIn(d.token, d.user);
      const staff = ['admin', 'agent'].includes(d.user.role);
      nav(loc.state?.from || (staff ? '/' : '/portal/requests'), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    authenticate(mode === 'signin' ? '/auth/login' : '/auth/register', form);
  };

  const demoSignIn = ({ email, password }) => {
    setMode('signin');
    setForm({ name: '', email, password });
    authenticate('/auth/login', { email, password });
  };

  return (
    <div className="login">
      <section className="login-side">
        <div className="login-brand">Adakole Ticketing System</div>
        <p className="login-lede">One queue for every email, chat, call and form your clients send, with the clock visible on every ticket.</p>
        <div className="login-rails" aria-hidden>
          {[['Printer offline at front desk', 0.3, 'ok'], ['VPN cannot connect', 0.8, 'warn'], ['Suspicious payroll email', 1, 'breach']].map(([t, p, tone]) => (
            <div key={t} className={`rail rail-${tone}`}>
              <div className="rail-text"><span>{t}</span></div>
              <div className="rail-track"><div className="rail-fill" style={{ width: `${p * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h1>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
          <p className="muted">{mode === 'signin' ? 'Agents and clients sign in here.' : 'Use your work email so we can link you to your company.'}</p>
          {mode === 'register' && (
            <label className="field"><span className="field-label">Full name</span><input required value={form.name} onChange={set('name')} autoComplete="name" /></label>
          )}
          <label className="field"><span className="field-label">Email</span><input required type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="field"><span className="field-label">Password</span><input required type="password" minLength={mode === 'register' ? 8 : undefined} value={form.password} onChange={set('password')} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></label>
          {error && <div className="error-note" role="alert">{error}</div>}
          <button className="btn btn-primary wide" disabled={busy}>{busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="link" onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); setError(''); }}>
            {mode === 'signin' ? 'New client? Create an account' : 'Already have an account? Sign in'}
          </button>
          {SHOW_DEMO && <div className="demo-creds">
            <strong>Try the demo</strong>
            <span>Sign in instantly as any role:</span>
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.role} type="button" className="demo-account" disabled={busy} onClick={() => demoSignIn(a)}>
                <span className="demo-role">{a.role}</span>
                <span className="demo-blurb">{a.blurb}</span>
                <span className="demo-login">{a.email} / {a.password}</span>
              </button>
            ))}
          </div>}
          <Link to="/portal" className="link">Go to the help center without signing in</Link>
        </form>
      </section>
    </div>
  );
}
