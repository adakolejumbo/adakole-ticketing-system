import { useEffect, useState, useCallback } from 'react';
import { get } from './api.js';

export const tnum = (id) => `ATS-${String(id).padStart(5, '0')}`;

export const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];
export const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];
export const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'chat', label: 'Chat' },
  { value: 'web', label: 'Web form' },
  { value: 'social', label: 'Social' },
  { value: 'phone', label: 'Phone' },
];
export const label = (list, v) => list.find((x) => x.value === v)?.label || v || '—';

export function timeAgo(d) {
  if (!d) return '—';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function duration(mins) {
  if (mins === null || mins === undefined) return '—';
  const m = Math.abs(Math.round(mins));
  if (m < 60) return `${m}m`;
  if (m < 60 * 48) return `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim();
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export function useFetch(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async (quiet) => {
    if (!path) return;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await get(path);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e.message, loading: false }));
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load, ...deps]);
  return { ...state, reload: load };
}

export function fillMacro(body, { ticket, agent }) {
  return body
    .replaceAll('{{requester}}', (ticket.requester_name || '').split(' ')[0] || 'there')
    .replaceAll('{{ticket}}', tnum(ticket.id))
    .replaceAll('{{agent}}', agent?.name || 'Service Desk');
}
