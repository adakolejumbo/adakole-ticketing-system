import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';

export default function ArticleEditor() {
  const { id } = useParams();
  const { meta } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ title: '', body: '', category_id: '', tags: '', published: true });
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) api(`/kb/${id}`).then((a) => setF({ ...a, tags: a.tags.join(', '), category_id: a.category_id || '' }));
  }, [id]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const a = await api(id ? `/kb/${id}` : '/kb', { method: id ? 'PUT' : 'POST', body: f });
      nav(`/kb/${a.id}`);
    } catch (err) {
      setError(err.message);
    }
  };
  const remove = async () => {
    if (!confirm('Delete this article? Links to it from tickets will be removed.')) return;
    await api(`/kb/${id}`, { method: 'DELETE' });
    nav('/kb');
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><h1>{id ? 'Edit article' : 'Write an article'}</h1></div>
      <form className="card card-pad stack" onSubmit={save}>
        <ErrorBox error={error} />
        <Field label="Title" hint="Name the problem the way a client would describe it"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Article" hint="Plain text. Numbered steps work well.">
          <textarea className="input" rows={16} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="grid-2">
          <Field label="Category">
            <select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              <option value="">General</option>
              {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Search keywords" hint="Words people type when they have this problem">
            <input className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="password, locked out" />
          </Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Published on the help center</label>
        <div className="row">
          <button className="btn primary">Save article</button>
          {id && <button type="button" className="btn danger" onClick={remove}>Delete</button>}
        </div>
      </form>
    </div>
  );
}
