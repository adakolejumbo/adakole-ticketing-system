import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { CustomFieldInput, ErrorBox, Field } from '../../components/ui.jsx';

/** Request form shared by the client portal and the public web form, with article suggestions (ticket deflection). */
export default function RequestForm({ meta, isPublic, onSubmit, onSolved }) {
  const [f, setF] = useState({ custom_fields: {} });
  const [suggest, setSuggest] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const text = `${f.subject || ''} ${f.description || ''}`.trim();
    if (text.length < 6) return setSuggest([]);
    const t = setTimeout(() => api('/kb/suggest', { params: { q: text } }).then(setSuggest).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [f.subject, f.description]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(f);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const solved = async (a) => {
    await api(`/kb/${a.id}/deflect`, { method: 'POST' });
    onSolved(a);
  };

  return (
    <form className="stack" onSubmit={submit}>
      <ErrorBox error={error} />
      {isPublic && (
        <div className="grid-2">
          <Field label="Your name"><input className="input" required autoComplete="name" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Work email" hint="We reply here"><input className="input" required type="email" autoComplete="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
      )}
      <Field label="What do you need help with?"><input className="input" required value={f.subject || ''} onChange={(e) => set('subject', e.target.value)} placeholder="For example: Outlook isn't getting new email" /></Field>
      {suggest.length > 0 && (
        <div className="suggest" aria-live="polite">
          <strong>These guides might fix it right now</strong>
          {suggest.map((a) => (
            <div key={a.id} style={{ marginTop: 8 }}>
              <Link to={`/help/${a.id}`} target="_blank">{a.title}</Link>
              <p>{a.excerpt.replace(/\s+/g, ' ')}…</p>
              <button type="button" className="btn small" style={{ marginTop: 4 }} onClick={() => solved(a)}>This solved it</button>
            </div>
          ))}
        </div>
      )}
      <Field label="Details" hint="What happened, when it started, and any error message">
        <textarea className="input" rows={6} value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Topic"><select className="input" value={f.category_id || ''} onChange={(e) => set('category_id', e.target.value)}>
          <option value="">Not sure</option>{meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {isPublic ? (
          <Field label="Phone" hint="Optional"><input className="input" type="tel" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        ) : (
          <Field label="How urgent is it?"><select className="input" value={f.priority || 'normal'} onChange={(e) => set('priority', e.target.value)}>
            <option value="low">Whenever you can</option><option value="normal">Affects my work</option><option value="high">I can't work</option><option value="urgent">Several people can't work</option></select></Field>
        )}
      </div>
      {meta.custom_fields.length > 0 && (
        <div className="grid-2">
          {meta.custom_fields.map((def) => (
            <Field key={def.key} label={`${def.label}${def.required ? '' : ' (optional)'}`}>
              <CustomFieldInput def={def} value={f.custom_fields[def.key]} onChange={(k, v) => set('custom_fields', { ...f.custom_fields, [k]: v })} />
            </Field>
          ))}
        </div>
      )}
      {isPublic && (
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="sr-only" aria-hidden="true" value={f.website || ''} onChange={(e) => set('website', e.target.value)} />
      )}
      <div><button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></div>
    </form>
  );
}
