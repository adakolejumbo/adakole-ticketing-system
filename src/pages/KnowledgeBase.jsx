import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post, patch, del } from '../api.js';
import { useAuth, useMeta } from '../App.jsx';
import { timeAgo } from '../lib.js';
import { Field, Select, TagInput, Loading, ErrorNote, Empty, opts } from '../components/ui.jsx';

export default function KnowledgeBase() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      get(`/kb${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((d) => setRows(d.articles)).catch((e) => setError(e.message));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Knowledge base</h1><p className="muted">Published articles appear in the customer help center and are suggested on matching tickets.</p></div>
        <Link to="/kb/new" className="btn btn-primary">Write an article</Link>
      </div>
      <input className="big-search" placeholder="Search articles" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search articles" />
      <ErrorNote error={error} />
      {!rows ? <Loading /> : rows.length === 0 ? <Empty title="No articles match">Try different words, or write the article that is missing.</Empty> : (
        <div className="table-wrap">
          <table className="tickets kb-table">
            <thead><tr><th>Article</th><th className="hide-md">Category</th><th>Views</th><th className="hide-md">Helpful</th><th className="hide-md">Linked tickets</th><th className="hide-md">Updated</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="subject-cell"><Link className="subject" to={`/kb/${a.id}`}>{a.title}</Link>{!a.published && <span className="draft">Draft</span>}
                    <div className="sub-meta">{(a.tags || []).map((t) => <span key={t} className="tag small">{t}</span>)}</div></td>
                  <td className="hide-md">{a.category_name || '—'}</td>
                  <td>{a.views}</td>
                  <td className="hide-md">{a.helpful + a.not_helpful ? `${Math.round((100 * a.helpful) / (a.helpful + a.not_helpful))}%` : '—'}</td>
                  <td className="hide-md">{a.linked_tickets}</td>
                  <td className="hide-md muted">{timeAgo(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ArticleEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { meta } = useMeta();
  const { user } = useAuth();
  const [a, setA] = useState(id ? null : { title: '', body: '', category_id: '', tags: [], published: true });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (id) get(`/kb/${id}`).then((d) => setA({ ...d.article, category_id: d.article.category_id || '' })).catch((e) => setError(e.message));
  }, [id]);
  if (!a) return <div className="page">{error ? <ErrorNote error={error} /> : <Loading />}</div>;
  const set = (k) => (v) => setA({ ...a, [k]: v?.target ? v.target.value : v });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (id) {
        await patch(`/kb/${id}`, a);
        setSaved('Article saved');
        setTimeout(() => setSaved(''), 2500);
      } else {
        const d = await post('/kb', a);
        nav(`/kb/${d.article.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <div className="crumbs"><Link to="/kb" className="link">Knowledge base</Link><span>/</span><span>{id ? 'Edit article' : 'New article'}</span></div>
      <form className="form-grid" onSubmit={save}>
        <div className="panel form-main">
          <Field label="Title"><input required value={a.title} onChange={set('title')} placeholder="Write it the way a customer would search for it" /></Field>
          <Field label="Article" hint="Plain text. Blank lines separate paragraphs; numbered lines become steps."><textarea required rows={18} value={a.body} onChange={set('body')} /></Field>
        </div>
        <div className="panel form-side">
          <Field label="Category"><Select value={a.category_id} onChange={set('category_id')} placeholder="None" options={opts(meta?.categories)} /></Field>
          <div className="field"><span className="field-label">Tags</span><TagInput value={a.tags || []} onChange={set('tags')} /><span className="field-hint">Tags improve ticket suggestions.</span></div>
          <label className="check-row"><input type="checkbox" checked={a.published} onChange={(e) => setA({ ...a, published: e.target.checked })} /> Published in the help center</label>
          <ErrorNote error={error} />
          {saved && <div className="ok-note" role="status">{saved}</div>}
          <button className="btn btn-primary wide">{id ? 'Save article' : 'Create article'}</button>
          {id && <a className="link" href={`/portal/articles/${id}`} target="_blank" rel="noreferrer">View in help center</a>}
          {id && user.role === 'admin' && (
            <button type="button" className="link danger" onClick={async () => { if (confirm('Delete this article?')) { await del(`/kb/${id}`); nav('/kb'); } }}>Delete article</button>
          )}
        </div>
      </form>
    </div>
  );
}
