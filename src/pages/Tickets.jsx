import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { useMeta } from '../App.jsx';
import { STATUSES, PRIORITIES, CHANNELS, tnum, timeAgo } from '../lib.js';
import { SlaRail, PriorityTag, StatusBadge, CategoryTag, ChannelTag, Select, Loading, ErrorNote, Empty, opts } from '../components/ui.jsx';

const TITLES = {
  mine: 'My open tickets', team: 'My team', unassigned: 'Unassigned', breached: 'SLA breached',
  pending: 'Waiting on customer', open: 'All open tickets', solved: 'Solved', all: 'Search results',
};
const FILTERS = ['status', 'priority', 'category_id', 'team_id', 'assignee_id', 'org_id', 'channel', 'tag', 'q', 'sort'];

export default function Tickets() {
  const [params, setParams] = useSearchParams();
  const { meta } = useMeta();
  const nav = useNavigate();
  const view = params.get('view') || 'open';
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ view });
    FILTERS.forEach((f) => params.get(f) && p.set(f, params.get(f)));
    return p.toString();
  }, [params, view]);

  const load = async (quiet) => {
    if (!quiet) setRows(null);
    try {
      setRows((await get(`/tickets?${qs}`)).tickets);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    setPicked(new Set());
    load();
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [qs]);

  const setFilter = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p);
  };

  const toggle = (id) => {
    const s = new Set(picked);
    s.has(id) ? s.delete(id) : s.add(id);
    setPicked(s);
  };

  const bulk = async (changes) => {
    setBusy(true);
    try {
      await post('/tickets/bulk', { ids: [...picked], changes });
      setPicked(new Set());
      await load(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const activeFilters = FILTERS.filter((f) => f !== 'sort' && params.get(f)).length;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>{TITLES[view] || 'Tickets'}</h1>
          <p className="muted">{rows ? `${rows.length} ticket${rows.length === 1 ? '' : 's'}` : ' '}{params.get('q') ? ` matching “${params.get('q')}”` : ''}</p>
        </div>
        <Link to="/tickets/new" className="btn btn-primary">Log a ticket</Link>
      </div>

      <div className="filters">
        <Select value={params.get('status')} onChange={(v) => setFilter('status', v)} placeholder="Any status" options={STATUSES} aria-label="Status" />
        <Select value={params.get('priority')} onChange={(v) => setFilter('priority', v)} placeholder="Any priority" options={PRIORITIES} aria-label="Priority" />
        <Select value={params.get('category_id')} onChange={(v) => setFilter('category_id', v)} placeholder="Any category" options={opts(meta?.categories)} aria-label="Category" />
        <Select value={params.get('team_id')} onChange={(v) => setFilter('team_id', v)} placeholder="Any team" options={opts(meta?.teams)} aria-label="Team" />
        <Select value={params.get('assignee_id')} onChange={(v) => setFilter('assignee_id', v)} placeholder="Any agent" options={opts(meta?.agents)} aria-label="Agent" />
        <Select value={params.get('org_id')} onChange={(v) => setFilter('org_id', v)} placeholder="Any client" options={opts(meta?.organizations)} aria-label="Client" />
        <Select value={params.get('channel')} onChange={(v) => setFilter('channel', v)} placeholder="Any channel" options={CHANNELS} aria-label="Channel" />
        <Select value={params.get('sort')} onChange={(v) => setFilter('sort', v)} placeholder="Sort: SLA due first" aria-label="Sort"
          options={[{ value: 'priority', label: 'Sort: priority' }, { value: 'newest', label: 'Sort: newest' }, { value: 'updated', label: 'Sort: recently updated' }]} />
        {activeFilters > 0 && <button className="link" onClick={() => setParams({ view })}>Clear filters</button>}
      </div>

      {picked.size > 0 && (
        <div className="bulkbar">
          <strong>{picked.size} selected</strong>
          <Select value="" disabled={busy} onChange={(v) => v && bulk({ assignee_id: v === 'none' ? null : v })} placeholder="Assign to…"
            options={[{ value: 'none', label: 'Unassigned' }, ...opts(meta?.agents)]} />
          <Select value="" disabled={busy} onChange={(v) => v && bulk({ status: v })} placeholder="Set status…" options={STATUSES} />
          <Select value="" disabled={busy} onChange={(v) => v && bulk({ priority: v })} placeholder="Set priority…" options={PRIORITIES} />
          <button className="link" onClick={() => setPicked(new Set())}>Clear selection</button>
        </div>
      )}

      <ErrorNote error={error} onRetry={load} />
      {!rows ? <Loading what="Loading tickets" /> : rows.length === 0 ? (
        <Empty title={view === 'breached' ? 'No tickets are past their SLA' : 'No tickets here'}>
          {activeFilters ? 'Try removing a filter.' : 'New tickets appear here as they arrive.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="tickets">
            <thead>
              <tr>
                <th className="check">
                  <input type="checkbox" aria-label="Select all"
                    checked={picked.size === rows.length}
                    onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
                <th>Ticket</th>
                <th>Status</th>
                <th>Priority</th>
                <th className="hide-md">Category</th>
                <th className="hide-md">Assignee</th>
                <th className="sla-col">Time to resolve</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={picked.has(t.id) ? 'picked' : ''} onClick={(e) => { if (!e.target.closest('input,a')) nav(`/tickets/${t.id}`); }}>
                  <td className="check"><input type="checkbox" aria-label={`Select ${tnum(t.id)}`} checked={picked.has(t.id)} onChange={() => toggle(t.id)} /></td>
                  <td className="subject-cell">
                    <Link to={`/tickets/${t.id}`} className="subject">{t.subject}</Link>
                    <div className="sub-meta">
                      <span className="tnum">{tnum(t.id)}</span>
                      <span>{t.requester_name}{t.org_name ? `, ${t.org_name}` : ''}</span>
                      <ChannelTag channel={t.channel} />
                      <span>{timeAgo(t.created_at)}</span>
                    </div>
                  </td>
                  <td className="cell-status"><StatusBadge status={t.status} /></td>
                  <td className="cell-prio"><PriorityTag priority={t.priority} /></td>
                  <td className="hide-md"><CategoryTag name={t.category_name} color={t.category_color} /></td>
                  <td className="hide-md">{t.assignee_name || <span className="muted">Unassigned</span>}</td>
                  <td className="sla-col"><SlaRail ticket={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
