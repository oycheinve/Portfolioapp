import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export function Card({ title, subtitle, icon: Icon, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                <Icon size={16} />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              {subtitle && <p className="truncate text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`p-4 sm:p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 dark:text-neutral-950',
  secondary:
    'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200 dark:hover:bg-neutral-700',
  ghost: 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5',
  danger: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, children, className = '', ...props }) {
  const sizes = size === 'sm' ? 'h-8 px-2.5 text-xs gap-1.5' : 'h-9 px-3.5 text-sm gap-2';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} className="shrink-0" />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5 ${className}`}
      {...props}
    >
      <Icon size={18} />
    </button>
  );
}

export function Segmented({ options, value, onChange, size = 'md', ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 dark:border-white/10 dark:bg-neutral-800"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md font-medium transition-colors ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm'} ${
              active
                ? 'bg-white text-stone-900 shadow-sm dark:bg-neutral-950 dark:text-white'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const fieldClass =
  'h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-100';

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-xs font-medium text-stone-600 dark:text-stone-400">{label}</span>}
      {children}
      {hint && <span className="text-[11px] text-stone-500 dark:text-stone-500">{hint}</span>}
    </label>
  );
}

function widthClass(className) {
  return /(^|\s)(w-|min-w-)/.test(className) ? '' : 'w-full';
}

export function Input({ className = '', ...props }) {
  return <input className={`${fieldClass} ${widthClass(className)} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${fieldClass} ${widthClass(className)} pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-5 w-9 rounded-full bg-stone-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40 dark:bg-neutral-700 dark:peer-checked:bg-blue-500" />
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-sm font-medium">{label}</span>}
          {description && <span className="text-xs text-stone-500 dark:text-stone-400">{description}</span>}
        </span>
      )}
    </label>
  );
}

const BADGE_TONES = {
  neutral: 'bg-stone-100 text-stone-700 dark:bg-white/5 dark:text-stone-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
};

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${BADGE_TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, color = '#2a78d6', overColor = '#d03b3b', height = 8, label }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  const over = (value || 0) > 1;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-stone-100 dark:bg-white/5"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round((value || 0) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: over ? overColor : color }} />
    </div>
  );
}

export function Stat({ label, value, sub, valueClassName = '', hint }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="truncate text-xs text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-lg font-semibold tabular ${valueClassName}`}>{value}</div>
      {sub && <div className="truncate text-xs text-stone-500 dark:text-stone-400">{sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-stone-200 bg-white shadow-xl sm:max-w-lg sm:rounded-2xl dark:border-white/10 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3 dark:border-white/5">
          <h3 className="text-sm font-semibold">{title}</h3>
          <IconButton icon={X} label="Zamknij" onClick={onClose} />
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3 dark:border-white/5">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {Icon && <Icon size={28} className="text-stone-400" />}
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="max-w-sm text-xs text-stone-500 dark:text-stone-400">{description}</p>}
      {action}
    </div>
  );
}

export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
      {label !== undefined && <div className="mb-1 font-medium">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-stone-500 dark:text-stone-400">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular">{formatter ? formatter(p.value, p) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// Etap 4: suwak z etykietą, wartością i opcjonalnym polem liczbowym (wygodny na ekranach dotykowych)
// Suwak z edytowalną wartością: kliknięcie w liczbę pozwala wpisać dokładną wartość z klawiatury (jednostka zostaje obok)
export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, format = (v) => v, hint, accent = '#2a78d6', unit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const pct = ((Number(value) - min) / (max - min)) * 100;
  const shown = String(format(Number(value)));
  // Jednostka: jawna albo to, co zostaje po liczbie w sformatowanej etykiecie („zł”, „%”, „lat”, „% / rok”)
  const unitText = unit ?? shown.replace(/^[+\-−]?[\d\s\u00a0.,]+/, '').trim();
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const start = () => {
    setDraft(String(Number(value).toFixed(decimals)).replace('.', ','));
    setEditing(true);
  };
  const commit = () => {
    const n = Number(String(draft).replace(/\s/g, '').replace(',', '.'));
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setEditing(false);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-stone-600 dark:text-stone-400">{label}</span>
        {editing ? (
          <span className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={draft}
              aria-label={`${label} – wpisz wartość`}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              onFocus={(e) => e.target.select()}
              className="h-7 w-24 rounded-md border border-blue-400 bg-white px-2 text-right text-sm font-semibold tabular outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-neutral-800"
            />
            {unitText && <span className="text-sm font-semibold text-stone-500">{unitText}</span>}
          </span>
        ) : (
          <button
            type="button"
            onClick={start}
            title="Kliknij, aby wpisać dokładną wartość"
            className="rounded-md border-b border-dashed border-stone-400 px-1 text-sm font-semibold tabular hover:bg-stone-100 dark:border-stone-500 dark:hover:bg-white/5"
          >
            {shown}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider h-6 w-full cursor-pointer appearance-none bg-transparent"
        style={{ '--slider-fill': `${Math.max(0, Math.min(100, pct))}%`, '--slider-accent': accent }}
      />
      {hint && <div className="text-[11px] text-stone-500 dark:text-stone-500">{hint}</div>}
    </div>
  );
}

// Rozwijany panel (menu) pod przyciskiem – na telefonie jako arkusz u dołu ekranu.
// children może być funkcją ({ close }) => JSX.
export function Dropdown({ label, icon: Icon, badge, children, align = 'left', title, className = '', panelClassName = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title={title}
        className={`inline-flex h-9 max-w-full items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
          open
            ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
            : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200 dark:hover:bg-neutral-700'
        }`}
      >
        {Icon && <Icon size={16} className="shrink-0" />}
        <span className="truncate">{label}</span>
        {badge !== undefined && badge !== null && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] leading-4 font-semibold text-white dark:bg-blue-500">{badge}</span>}
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className={`fixed inset-x-3 bottom-20 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:mt-2 sm:w-[24rem] sm:max-w-[calc(100vw-2rem)] dark:border-white/10 dark:bg-neutral-900 ${
            align === 'right' ? 'sm:right-0' : 'sm:left-0'
          } ${panelClassName}`}
          role="dialog"
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}

// Akordeon sekcji: lista zwijanych pozycji, rozwinięte zapamiętywane w localStorage (klucz storageKey).
// items: [{ id, title, subtitle, icon, badge, render: () => węzeł }] – treść renderowana tylko po rozwinięciu.
export function Accordion({ items, storageKey, defaultOpen = [], exclusive = false }) {
  const [open, setOpen] = useState(() => {
    try {
      const saved = storageKey ? JSON.parse(localStorage.getItem(storageKey) || 'null') : null;
      return Array.isArray(saved) ? saved : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });
  const toggle = (id) => {
    // exclusive: rozwinięta jest tylko jedna sekcja naraz (wybór jak z listy)
    const next = open.includes(id) ? open.filter((x) => x !== id) : exclusive ? [id] : [...open, id];
    setOpen(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // brak localStorage – stan rozwinięcia nie zostanie zapamiętany
    }
  };
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        const Icon = item.icon;
        return (
          <div key={item.id} className="min-w-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition-colors sm:px-5 ${
                isOpen
                  ? 'border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10'
                  : 'border-stone-200 bg-white hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-neutral-800'
              }`}
            >
              {Icon && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                  <Icon size={16} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                {item.subtitle && <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{item.subtitle}</span>}
              </span>
              {item.badge}
              <ChevronDown size={18} className={`shrink-0 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="mt-2.5 space-y-4 sm:space-y-6">{item.render()}</div>}
          </div>
        );
      })}
    </div>
  );
}
