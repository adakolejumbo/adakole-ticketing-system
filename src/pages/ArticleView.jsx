import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading, Tag } from '../components/ui.jsx';
import { fullDate } from '../lib/format.js';

export default function ArticleView() {
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/kb/${id}`).then(setA).catch((e) => setError(e.message)); }, [id]);
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (!a) return <div className="page"><Loading /></div>;
  return (
    <div className="page">
      <div className="article">
        <div className="row small muted"><Link to="/kb">Knowledge base</Link><span>/</span><span>{a.category_name || 'General'}</span></div>
        <div className="spread" style={{ margin: '8px 0 6px' }}>
          <h1>{a.title}</h1>
          <Link to={`/kb/${a.id}/edit`} className="btn">Edit</Link>
        </div>
        <p className="small muted">
          {a.published ? 'Published' : 'Draft, only agents can see it'}. Updated {fullDate(a.updated_at)}{a.author_name ? ` by ${a.author_name}` : ''}.
          {' '}{a.views} views, {a.helpful_count} found it helpful, {a.deflections} solved without a ticket.
        </p>
        <div className="row wrap" style={{ gap: 4, marginBottom: 18 }}>{a.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
        <div className="card card-pad article-body">{a.body}</div>
        <p className="small muted" style={{ marginTop: 12 }}>Public link: <a href={`/help/${a.id}`}>{window.location.origin}/help/{a.id}</a></p>
      </div>
    </div>
  );
}
