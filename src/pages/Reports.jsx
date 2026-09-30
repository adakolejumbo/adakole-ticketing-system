import { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, Legend } from 'recharts';
import { useFetch, duration, label, CHANNELS, PRIORITIES } from '../lib.js';
import { Loading, ErrorNote, Select } from '../components/ui.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const INK = '#16232E';
const PINE = '#1E6B5F';
const SIGNAL = '#E8A317';
const MUTE = '#98A3A0';

export default function Reports() {
  const [days, setDays] = useState('30');
  const { data, error, loading, reload } = useFetch(`/reports?days=${days}&tz=${encodeURIComponent(tz)}`);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div><h1>Reports</h1><p className="muted">Team performance, SLA compliance and where requests come from.</p></div>
        <Select value={days} onChange={setDays} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} aria-label="Date range" />
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data ? <Loading what="Crunching numbers" /> : data && <Body d={data} />}
    </div>
  );
}

function Body({ d }) {
  const s = d.summary;
  const heatMax = Math.max(1, ...d.heat.map((h) => h.value));
  const cell = (dow, hour) => d.heat.find((h) => h.dow === dow && h.hour === hour)?.value || 0;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const busiest = [...d.heat].sort((a, b) => b.value - a.value)[0];

  return (
    <>
      <div className="kpis kpis-big">
        <Kpi n={s.created} text="tickets received" />
        <Kpi n={s.resolved} text="resolved" />
        <Kpi n={d.backlog.open} text="open right now" />
        <Kpi n={duration(s.avg_first_response_mins)} text="average first reply" />
        <Kpi n={s.avg_resolution_hours != null ? `${s.avg_resolution_hours}h` : '—'} text="average time to resolve" />
        <Kpi n={s.first_response_sla != null ? `${s.first_response_sla}%` : '—'} text="first replies within SLA" tone={s.first_response_sla < 85 ? 'warn' : ''} />
        <Kpi n={s.resolution_sla != null ? `${s.resolution_sla}%` : '—'} text="resolved within SLA" tone={s.resolution_sla < 85 ? 'warn' : ''} />
      </div>

      <div className="report-grid">
        <section className="panel span-2">
          <h2>Received and resolved per day</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={d.daily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#E3E8E6" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 12, fill: MUTE }} minTickGap={20} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: MUTE }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="created" name="Received" stroke={SIGNAL} fill={SIGNAL} fillOpacity={0.18} strokeWidth={2} />
              <Area type="monotone" dataKey="resolved" name="Resolved" stroke={PINE} fill={PINE} fillOpacity={0.18} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h2>Recurring issues by category</h2>
          <ResponsiveContainer width="100%" height={Math.max(160, d.byCategory.length * 34)}>
            <BarChart data={d.byCategory} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 13, fill: INK }} />
              <Tooltip />
              <Bar dataKey="value" name="Tickets" radius={[0, 4, 4, 0]}>
                {d.byCategory.map((c) => <Cell key={c.name} fill={c.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h2>Where requests come from</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.byChannel.map((c) => ({ ...c, name: label(CHANNELS, c.name) }))} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: MUTE }} />
              <Tooltip />
              <Bar dataKey="value" name="Tickets" fill={PINE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="prio-split">
            {PRIORITIES.map((p) => {
              const v = d.byPriority.find((x) => x.name === p.value)?.value || 0;
              return <span key={p.value} className={`prio prio-${p.value}`}>{p.label} {v}</span>;
            })}
          </div>
        </section>

        <section className="panel span-2">
          <h2>Peak times</h2>
          <p className="muted small">Tickets received by weekday and hour ({tz}).{busiest ? ` Busiest: ${DAYS[busiest.dow]} around ${busiest.hour}:00.` : ''}</p>
          <div className="heat-wrap">
            <table className="heat">
              <thead><tr><th />{hours.map((h) => <th key={h}>{h % 3 === 0 ? h : ''}</th>)}</tr></thead>
              <tbody>
                {DAYS.map((dname, dow) => (
                  <tr key={dname}>
                    <th>{dname}</th>
                    {hours.map((h) => {
                      const v = cell(dow, h);
                      return <td key={h} title={`${dname} ${h}:00 — ${v} tickets`} style={{ background: v ? `rgba(30,107,95,${0.12 + (0.88 * v) / heatMax})` : undefined }} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-2">
          <h2>Agent performance</h2>
          <div className="table-wrap">
            <table className="tickets">
              <thead><tr><th>Agent</th><th className="hide-md">Team</th><th>Open now</th><th>Assigned</th><th>Resolved</th><th className="hide-md">Avg first reply</th><th className="hide-md">Avg resolve</th><th>Within SLA</th></tr></thead>
              <tbody>
                {d.agents.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.name}</strong></td>
                    <td className="hide-md">{a.team || '—'}</td>
                    <td>{a.open}</td>
                    <td>{a.assigned}</td>
                    <td>{a.resolved}</td>
                    <td className="hide-md">{duration(a.avg_first_response_mins)}</td>
                    <td className="hide-md">{a.avg_resolution_hours != null ? `${a.avg_resolution_hours}h` : '—'}</td>
                    <td>{a.sla != null ? <Meter v={a.sla} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-2">
          <h2>Top tags</h2>
          <div className="tag-cloud">
            {d.tags.length ? d.tags.map((t) => <span key={t.name} className="tag">{t.name} <strong>{t.value}</strong></span>) : <span className="muted">No tags in this period.</span>}
          </div>
        </section>
      </div>
    </>
  );
}

function Kpi({ n, text, tone }) {
  return <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}><strong>{n ?? '—'}</strong><span>{text}</span></div>;
}

function Meter({ v }) {
  return (
    <span className="meter" title={`${v}%`}>
      <span className="meter-track"><span style={{ width: `${v}%`, background: v >= 85 ? PINE : v >= 70 ? SIGNAL : '#C2412D' }} /></span>
      {v}%
    </span>
  );
}
