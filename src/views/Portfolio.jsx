import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Table2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { PORTFOLIO_CATEGORIES, buildPortfolioRows, groupRows } from '../lib/portfolioTable.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { formatMoney, formatNumber, formatPLN, formatPercent, signClass } from '../lib/format.js';
import { Card, EmptyState } from '../components/ui.jsx';

const PREFS_KEY = 'wealth-app-portfolio-filters';

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
  } catch {
    return null;
  }
}

function CheckChip({ checked, onChange, label, color, count }) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors select-none ${
        checked
          ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
          : 'border-stone-200 text-stone-500 hover:bg-stone-100 dark:border-white/10 dark:text-stone-400 dark:hover:bg-white/5'
      }`}
    >
      <input type="checkbox" className="h-3.5 w-3.5 accent-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
      {count !== undefined && <span className="opacity-60">{count}</span>}
    </label>
  );
}

function Delta({ value, pct, digits = 2, stack = false }) {
  if (value === null || value === undefined) return <span className="text-stone-400">—</span>;
  if (stack) {
    return (
      <span className={`inline-flex flex-col items-end leading-tight ${signClass(value)}`}>
        <span className="whitespace-nowrap">{formatPLN(value, { sign: true })}</span>
        {pct !== null && pct !== undefined && <span className="text-[11px] opacity-90">{formatPercent(pct, { sign: true, digits })}</span>}
      </span>
    );
  }
  return (
    <span className={signClass(value)}>
      {formatPLN(value, { sign: true })}
      {pct !== null && pct !== undefined && <span className="ml-1 text-[11px]">({formatPercent(pct, { sign: true, digits })})</span>}
    </span>
  );
}

export default function PortfolioView() {
  const { state } = useApp();
  const rows = useMemo(() => buildPortfolioRows(state), [state]);
  const saved = useMemo(readPrefs, []);
  const allCats = PORTFOLIO_CATEGORIES.map((c) => c.id);
  const allAccs = state.accounts.map((a) => a.id);
  const [categories, setCategories] = useState(() => (saved?.categories || allCats).filter((c) => allCats.includes(c)));
  const [hiddenAccounts, setHiddenAccounts] = useState(() => saved?.hiddenAccounts || []);
  const [collapsed, setCollapsed] = useState({});

  const accounts = allAccs.filter((id) => !hiddenAccounts.includes(id));
  const data = useMemo(() => groupRows(rows, { categories, accounts }), [rows, categories, accounts]);
  const present = new Set(rows.map((r) => r.category));
  const counts = Object.fromEntries(PORTFOLIO_CATEGORIES.map((c) => [c.id, rows.filter((r) => r.category === c.id).length]));

  const persist = (cats, hidden) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ categories: cats, hiddenAccounts: hidden }));
    } catch {
      // brak localStorage – filtr nie zostanie zapamiętany
    }
  };
  const toggleCat = (id, on) => {
    const next = on ? [...new Set([...categories, id])] : categories.filter((c) => c !== id);
    setCategories(next);
    persist(next, hiddenAccounts);
  };
  const toggleAcc = (id, on) => {
    const next = on ? hiddenAccounts.filter((x) => x !== id) : [...hiddenAccounts, id];
    setHiddenAccounts(next);
    persist(categories, next);
  };
  const preset = (cats, hidden = []) => {
    setCategories(cats);
    setHiddenAccounts(hidden);
    persist(cats, hidden);
  };
  const allOn = categories.length === allCats.length && hiddenAccounts.length === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card title="Co pokazać w tabeli" subtitle="Zaznacz kategorie i konta – podsumowania przeliczą się od razu" icon={Filter}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <CheckChip checked={allOn} onChange={(v) => (v ? preset(allCats) : preset([]))} label="Wszystko naraz" />
            <button type="button" onClick={() => preset(['STOCK_PL', 'STOCK_FOREIGN', 'ETF_PL', 'ETF_FOREIGN'])} className="rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/5">
              Tylko akcje i ETF
            </button>
            <button type="button" onClick={() => preset(['CASH', 'BONDS'])} className="rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/5">
              Kapitał bezpieczny
            </button>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Kategorie</div>
            <div className="flex flex-wrap gap-2">
              {PORTFOLIO_CATEGORIES.filter((c) => present.has(c.id)).map((c) => (
                <CheckChip key={c.id} checked={categories.includes(c.id)} onChange={(v) => toggleCat(c.id, v)} label={c.label} count={counts[c.id]} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Konta</div>
            <div className="flex flex-wrap gap-2">
              {state.accounts.map((a) => (
                <CheckChip key={a.id} checked={!hiddenAccounts.includes(a.id)} onChange={(v) => toggleAcc(a.id, v)} label={a.name} color={ACCOUNT_TYPES[a.type]?.color} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Wartość (widoczne)" value={formatPLN(data.total)} sub={`${data.count} pozycji`} />
        <Tile label="Zysk" value={formatPLN(data.gain, { sign: true })} sub={formatPercent(data.gainPct, { sign: true })} tone={signClass(data.gain)} />
        <Tile label="Zmiana dzienna" value={formatPLN(data.dayChange, { sign: true })} sub={formatPercent(data.dayPct, { sign: true })} tone={signClass(data.dayChange)} />
        <Tile label="Kategorie" value={`${data.groups.length}`} sub={data.groups.map((g) => g.short).join(' · ') || '—'} />
      </div>

      {data.groups.length === 0 ? (
        <Card>
          <EmptyState icon={Table2} title="Nic nie zaznaczono" description="Zaznacz kategorie lub konta w filtrze powyżej." />
        </Card>
      ) : (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
          {/* Tabela – desktop */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-stone-400">
                  <th className="px-4 py-2.5 font-medium">Pozycja</th>
                  <th className="px-3 py-2.5 font-medium">Konto</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ilość</th>
                  <th className="px-3 py-2.5 text-right font-medium">Kurs</th>
                  <th className="px-3 py-2.5 text-right font-medium">Wartość</th>
                  <th className="px-3 py-2.5 text-right font-medium">Koszt</th>
                  <th className="px-3 py-2.5 text-right font-medium">Zysk</th>
                  <th className="px-3 py-2.5 text-right font-medium">Dziś</th>
                  <th className="px-4 py-2.5 text-right font-medium">Udział</th>
                </tr>
              </thead>
              {data.groups.map((g) => {
                const isOpen = !collapsed[g.id];
                return (
                  <tbody key={g.id} className="tabular">
                    <tr className="cursor-pointer border-b border-stone-200 bg-stone-100/70 font-semibold dark:border-white/10 dark:bg-white/[0.05]" onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}>
                      <td className="px-4 py-2" colSpan={4}>
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          {g.label} <span className="font-normal text-stone-500">({g.rows.length})</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{formatPLN(g.value)}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right">
                        <Delta value={g.gain} pct={g.gainPct} stack />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Delta value={g.dayChange} pct={g.dayPct} stack />
                      </td>
                      <td className="px-4 py-2 text-right">{formatPercent(g.share, { digits: 1 })}</td>
                    </tr>
                    {isOpen &&
                      g.rows.map((r) => (
                        <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/[0.02]">
                          <td className="px-4 py-2">
                            <div className="font-medium">{r.name}</div>
                            <div className="max-w-[14rem] truncate text-[11px] text-stone-500 dark:text-stone-400">
                              {r.sub}
                              {r.fxFees > 0 && ` · przewalutowanie ${formatPLN(r.fxFees)}`}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {r.account ? (
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span className="h-2 w-2 rounded-full" style={{ background: ACCOUNT_TYPES[r.account.type]?.color }} />
                                <span className="max-w-[8.5rem] truncate">{r.account.name}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-stone-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{r.quantity ? formatNumber(r.quantity, 4) : '—'}</td>
                          <td className="px-3 py-2 text-right">{r.price ? formatMoney(r.price, r.currency || 'PLN') : '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatPLN(r.value)}</td>
                          <td className="px-3 py-2 text-right text-stone-500">{r.cost !== null && r.cost !== undefined ? formatPLN(r.cost) : '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <Delta value={r.gain} pct={r.gainPct} stack />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Delta value={r.dayChange || 0} pct={r.dayPct} stack />
                          </td>
                          <td className="px-4 py-2 text-right text-stone-500">{formatPercent(r.share, { digits: 1 })}</td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="border-t-2 border-stone-300 font-semibold tabular dark:border-white/15">
                  <td className="px-4 py-2.5" colSpan={4}>
                    Razem
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatPLN(data.total)}</td>
                  <td />
                  <td className="px-3 py-2.5 text-right">
                    <Delta value={data.gain} pct={data.gainPct} stack />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Delta value={data.dayChange} pct={data.dayPct} stack />
                  </td>
                  <td className="px-4 py-2.5 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Lista – mobile */}
          <div className="md:hidden">
            {data.groups.map((g) => {
              const isOpen = !collapsed[g.id];
              return (
                <div key={g.id} className="border-b border-stone-200 last:border-0 dark:border-white/10">
                  <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))} className="flex w-full items-start gap-2 bg-stone-100/70 px-4 py-2.5 text-left dark:bg-white/[0.05]">
                    {isOpen ? <ChevronDown size={16} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {g.label} <span className="font-normal text-stone-500">({g.rows.length})</span>
                      </div>
                      <div className="text-[11px] tabular">
                        <Delta value={g.gain} pct={g.gainPct} /> · dziś <Delta value={g.dayChange} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular">{formatPLN(g.value)}</div>
                      <div className="text-[11px] text-stone-500 tabular">{formatPercent(g.share, { digits: 1 })}</div>
                    </div>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-stone-100 dark:divide-white/5">
                      {g.rows.map((r) => (
                        <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: r.account ? ACCOUNT_TYPES[r.account.type]?.color : '#a3a29b' }} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{r.name}</div>
                            <div className="truncate text-[11px] text-stone-500">
                              {r.quantity ? `${formatNumber(r.quantity, 4)} szt. · ` : ''}
                              {r.account?.name || r.sub}
                            </div>
                          </div>
                          <div className="text-right tabular">
                            <div className="text-sm font-semibold">{formatPLN(r.value)}</div>
                            <div className="text-[11px]">
                              <Delta value={r.gain} pct={r.gainPct} digits={1} />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between px-4 py-3 text-sm font-semibold tabular">
              <span>Razem</span>
              <span>{formatPLN(data.total)}</span>
            </div>
          </div>
        </section>
      )}
      <p className="text-[11px] text-stone-500 dark:text-stone-500">
        Zysk akcji i ETF = wartość − koszt zakupu (z prowizjami i przewalutowaniem). Obligacje: odsetki narosłe i wypłacone netto. Konta oszczędnościowe: odsetki ponad wpłaty. Zmiana dzienna obligacji i oszczędności = odsetki naliczane za 1 dzień.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
      <div className="truncate text-[11px] text-stone-500 sm:text-xs dark:text-stone-400">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

