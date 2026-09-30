import { STATUSES, PRIORITIES, CHANNELS, label, duration } from '../lib.js';

export function StatusBadge({ status }) {
  return <span className={`status status-${status}`}><i />{label(STATUSES, status)}</span>;
}

export function PriorityTag({ priority }) {
  return <span className={`prio prio-${priority}`}>{label(PRIORITIES, priority)}</span>;
}

export function ChannelTag({ channel }) {
  const icons = { email: '✉', chat: '💬', web: '◧', social: '＠', phone: '☏' };
  return <span className="channel" title={label(CHANNELS, channel)}><span aria-hidden>{icons[channel]}</span> {label(CHANNELS, channel)}</span>;
}

export function CategoryTag({ name, color }) {
  if (!name) return <span className="muted">Uncategorized</span>;
  return <span className="cat"><i style={{ background: color }} />{name}</span>;
}

// The SLA rail: a thin bar that fills as the resolution clock runs down.
export function SlaRail({ ticket, compact }) {
  const s = ticket.sla?.resolution;
  if (!s) return <span className="muted">No SLA</span>;
  const pct = Math.min(Math.max(s.used, 0), 1) * 100;
  let tone = 'ok';
  let text;
  if (s.done) {
    tone = s.breached ? 'breach' : 'met';
    text = s.breached ? 'Resolved late' : 'Met';
  } else if (s.paused) {
    tone = 'paused';
    text = `Paused · ${duration(s.remainingMins)} left`;
  } else if (s.breached) {
    tone = 'breach';
    text = `Overdue ${duration(s.remainingMins)}`;
  } else {
    tone = s.used >= 0.75 ? 'warn' : 'ok';
    text = `${duration(s.remainingMins)} left`;
  }
  const fr = ticket.sla?.firstResponse;
  const frLate = fr && !fr.done && fr.breached;
  return (
    <div className={`rail rail-${tone} ${compact ? 'rail-compact' : ''}`} title={`Resolution due ${new Date(s.due).toLocaleString()}`}>
      <div className="rail-text">
        <span>{text}</span>
        {frLate && <span className="rail-flag">No reply yet</span>}
      </div>
      <div className="rail-track"><div className="rail-fill" style={{ width: `${s.breached && !s.done ? 100 : pct}%` }} /></div>
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ what = 'Loading' }) {
  return <div className="loading">{what}…</div>;
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-note" role="alert">
      {error}
      {onRetry && <button className="link" onClick={() => onRetry()}>Try again</button>}
    </div>
  );
}

export function Field({ label: text, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{text}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function TagInput({ value = [], onChange, placeholder = 'Add tag' }) {
  const add = (raw) => {
    const t = raw.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
  };
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
        onBlur={(e) => { add(e.currentTarget.value); e.currentTarget.value = ''; }}
      />
    </div>
  );
}

export function CustomFieldInput({ field, value, onChange }) {
  if (field.type === 'select')
    return <Select value={value} onChange={onChange} placeholder="—" options={(field.options || []).map((o) => ({ value: o, label: o }))} />;
  return <input type={field.type === 'number' ? 'number' : 'text'} value={value ?? ''} onChange={(e) => onChange(field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />;
}

export const opts = (rows = [], key = 'name') => rows.map((r) => ({ value: r.id, label: r[key] }));
