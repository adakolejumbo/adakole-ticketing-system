import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import RequestForm from './RequestForm.jsx';

export default function PortalNew() {
  const { meta } = useAuth();
  const nav = useNavigate();
  if (!meta) return null;
  return (
    <div className="card card-pad stack">
      <div><h1>New request</h1><p className="muted">Tell us what's going on. You'll get an email with your reference number.</p></div>
      <RequestForm meta={meta}
        onSubmit={async (f) => { const t = await api('/tickets', { method: 'POST', body: f }); nav(`/portal/tickets/${t.id}`, { state: { created: true } }); }}
        onSolved={() => nav('/portal', { state: { solved: true } })} />
    </div>
  );
}
