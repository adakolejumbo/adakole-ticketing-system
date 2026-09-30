import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';

export default function Account() {
  const { user } = useAuth();
  const [f, setF] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await api('/auth/password', { method: 'POST', body: f });
      setMsg('Password changed.');
      setF({ current: '', next: '' });
    } catch (err) { setError(err.message); }
  };
  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <div className="page-head"><div><h1>{user.name}</h1><p>{user.email}</p></div></div>
      <form className="card card-pad stack" onSubmit={save}>
        <h2>Change password</h2>
        <ErrorBox error={error} />
        {msg && <div className="notice">{msg}</div>}
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
        <Field label="New password" hint="At least 8 characters"><input className="input" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
        <div><button className="btn primary">Change password</button></div>
      </form>
    </div>
  );
}
