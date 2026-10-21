import { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronRight, Coins, ListOrdered, SlidersHorizontal, Table2, TrendingDown } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { PORTFOLIO_CATEGORIES, buildPortfolioRows, groupRows } from '../lib/portfolioTable.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { formatDate, formatMoney, formatNumber, formatPLN, formatPercent, signClass } from '../lib/format.js';
import { Card, Dropdown, EmptyState, Modal } from '../components/ui.jsx';

const PREFS_KEY = 'wealth-app-portfolio-filters';

// Kwoty w tabeli zawsze z dwoma miejscami po przecinku
const fmt2Formatter = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt2 = (v) => (Number.isFinite(v) ? fmt2Formatter.format(v) : '—');

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
  } catch {
    return null;
  }
}

// Okres inwestycji w dniach od pierwszego zakupu / wpłaty
export function holdingDays(since, today = new Date()) {
  if (!since) return null;
  const [y, m, d] = since.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((end - start) / 86400000));
}

function daysLabel(since) {
  const days = holdingDays(since);
  return days === null ? '—' : days.toLocaleString('pl-PL');
}

// Ikony operacji przy walorze: dywidendy/kupony/odsetki, przewalutowanie, sprzedaże
function OpIcons({ row }) {
  const ops = row.ops || [];
  const income = ops.some((o) => /Dywidenda|Kupon|Odsetki/.test(o.type));
  const sold = ops.some((o) => o.type === 'Sprzedaż');
  const fx = (row.fxFees || 0) > 0;
  if (!income && !sold && !fx) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-stone-400">
      {income && <Coins size={11} aria-label="Wypłaty dochodu" />}
      {sold && <TrendingDown size={11} aria-label="Częściowa sprzedaż" />}
      {fx && <ArrowLeftRight size={11} aria-label={`Przewalutowanie ${fmt2(row.fxFees)} zł`} />}
    </span>
  );
}

function CheckRow({ checked, onChange, label, color, count }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-white/5">
      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-stone-400 tabular">{count}</span>}
    </label>
  );
}

function Signed({ value, kind = 'pln', digits = 2 }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="text-stone-400">—</span>;
  return <span className={signClass(value)}>{kind === 'pct' ? formatPercent(value, { sign: true, digits }) : formatPLN(value, { sign: true })}</span>;
}

const COLS = [
  { key: 'name', label: 'Walor', align: 'left' },
  { key: 'ops', label: 'Operacje', align: 'center' },
  { key: 'day', label: 'Zmiana dzienna [%]', align: 'right' },
  { key: 'qty', label: 'Liczba jednostek', align: 'right' },
  { key: 'avg', label: 'Śr. cena zakupu [PLN]', align: 'right' },
  { key: 'price', label: 'Cena aktualna [PLN]', align: 'right' },
  { key: 'period', label: 'Okres inwestycji [dni]', align: 'right' },
  { key: 'value', label: 'Wartość waloru [PLN]', align: 'right' },
  { key: 'share', label: 'Udział w wartości portfela [%]', align: 'right' },
  { key: 'rate', label: 'Stopa zwrotu [%]', align: 'right' },
  { key: 'gain', label: 'Zysk [PLN]', align: 'right' },
];

// Wiersz „Cały portfel” – na górze (pod nagłówkiem) i na dole tabeli
function TotalRow({ data, position }) {
  const top = position === 'top';
  const bg = top ? 'bg-blue-50 dark:bg-[#16233a]' : 'bg-white dark:bg-neutral-900';
  return (
    <tr className={`font-semibold tabular text-[13px] text-stone-900 dark:text-stone-100 ${top ? 'border-b border-stone-200 dark:border-white/10' : 'border-t-2 border-stone-300 dark:border-white/15'} ${bg}`}>
      <td className={`sticky left-0 z-10 py-2.5 pl-4 text-left ${bg}`}>Cały portfel</td>
      <td className="px-2.5 py-2.5 text-center text-[11px] font-normal text-stone-500">{data.count} poz.</td>
      <td className="px-2.5 py-2.5 text-right">
        <div>
          <Signed value={data.dayPct} kind="pct" />
        </div>
        <div className="text-[11px] font-normal">
          <Signed value={data.dayChange} />
        </div>
      </td>
      <td colSpan={4} />
      <td className="px-2.5 py-2.5 text-right">{fmt2(data.total)}</td>
      <td className="px-2.5 py-2.5 text-right">100,00%</td>
      <td className="px-2.5 py-2.5 text-right">
        <Signed value={data.gainPct} kind="pct" />
      </td>
      <td className="px-2.5 py-2.5 text-right">
        <Signed value={data.gain} />
      </td>
    </tr>
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
  const [opsFor, setOpsFor] = useState(null);

  const accounts = allAccs.filter((id) => !hiddenAccounts.includes(id));
  const data = useMemo(() => groupRows(rows, { categories, accounts }), [rows, categories, accounts]);
  const present = new Set(rows.map((r) => r.category));
  const counts = Object.fromEntries(PORTFOLIO_CATEGORIES.map((c) => [c.id, rows.filter((r) => r.category === c.id).length]));
  const presentCats = PORTFOLIO_CATEGORIES.filter((c) => present.has(c.id));
  const activeFilters = presentCats.filter((c) => !categories.includes(c.id)).length + hiddenAccounts.length;

  const persist = (cats, hidden) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ categories: cats, hiddenAccounts: hidden }));
    } catch {
      // brak localStorage – filtr nie zostanie zapamiętany
    }
  };
  const apply = (cats, hidden) => {
    setCategories(cats);
    setHiddenAccounts(hidden);
    persist(cats, hidden);
  };
  const toggleCat = (id, on) => apply(on ? [...new Set([...categories, id])] : categories.filter((c) => c !== id), hiddenAccounts);
  const toggleAcc = (id, on) => apply(categories, on ? hiddenAccounts.filter((x) => x !== id) : [...hiddenAccounts, id]);
  const allOn = activeFilters === 0;

  const toggleSection = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const allCollapsed = data.groups.length > 0 && data.groups.every((g) => collapsed[g.id]);

  return (
    <div className="space-y-4">
      {/* Pasek: filtr + podsumowanie */}
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown label="Filtruj portfel" icon={SlidersHorizontal} badge={activeFilters || null}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Wszystko', cats: allCats },
                { label: 'Akcje i ETF', cats: ['STOCK_PL', 'STOCK_FOREIGN', 'ETF_PL', 'ETF_FOREIGN'] },
                { label: 'Poduszka finansowa', cats: ['CASH', 'BONDS'] },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => apply(p.cats, [])}
                  className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Kategorie</div>
              {presentCats.map((c) => (
                <CheckRow key={c.id} checked={categories.includes(c.id)} onChange={(v) => toggleCat(c.id, v)} label={c.label} count={counts[c.id]} />
              ))}
            </div>
            <div className="border-t border-stone-100 pt-2 dark:border-white/5">
              <div className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Konta</div>
              {state.accounts.map((a) => (
                <CheckRow key={a.id} checked={!hiddenAccounts.includes(a.id)} onChange={(v) => toggleAcc(a.id, v)} label={a.name} color={ACCOUNT_TYPES[a.type]?.color} />
              ))}
            </div>
            {!allOn && (
              <button type="button" onClick={() => apply(allCats, [])} className="w-full rounded-lg bg-stone-100 py-2 text-xs font-medium hover:bg-stone-200 dark:bg-white/5 dark:hover:bg-white/10">
                Pokaż wszystko
              </button>
            )}
          </div>
        </Dropdown>
        <button
          type="button"
          onClick={() => setCollapsed(allCollapsed ? {} : Object.fromEntries(data.groups.map((g) => [g.id, true])))}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5"
        >
          {allCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {allCollapsed ? 'Rozwiń sekcje' : 'Zwiń sekcje'}
        </button>
        <div className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm tabular">
          <span>
            <span className="text-xs text-stone-500">Wartość </span>
            <strong>{formatPLN(data.total)}</strong>
          </span>
          <span>
            <span className="text-xs text-stone-500">Zysk </span>
            <strong className={signClass(data.gain)}>
              {formatPLN(data.gain, { sign: true })} ({formatPercent(data.gainPct, { sign: true })})
            </strong>
          </span>
          <span>
            <span className="text-xs text-stone-500">Dziś </span>
            <strong className={signClass(data.dayChange)}>
              {formatPLN(data.dayChange, { sign: true })} ({formatPercent(data.dayPct, { sign: true })})
            </strong>
          </span>
        </div>
      </div>

      {data.groups.length === 0 ? (
        <Card>
          <EmptyState icon={Table2} title="Nic nie zaznaczono" description="Otwórz „Filtruj portfel” i zaznacz kategorie lub konta." />
        </Card>
      ) : (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
          {/* Tabela – desktop */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1080px] text-[13px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-[11px] text-stone-500 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-400">
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className={`px-2.5 py-2.5 leading-tight font-medium ${c.key === 'name' ? 'sticky left-0 z-10 bg-stone-50 pl-4 dark:bg-neutral-800' : ''} ${
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
                <TotalRow data={data} position="top" />
              </thead>
              {data.groups.map((g) => {
                const isOpen = !collapsed[g.id];
                return (
                  <tbody key={g.id} className="tabular">
                    <tr className="cursor-pointer border-b border-stone-200 bg-stone-100 font-semibold dark:border-white/10 dark:bg-neutral-800" onClick={() => toggleSection(g.id)}>
                      <td className="sticky left-0 z-10 bg-stone-100 py-2 pr-2.5 pl-4 dark:bg-neutral-800">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          {g.label} <span className="font-normal text-stone-500">({g.rows.length})</span>
                        </span>
                      </td>
                      <td />
                      <td className="px-2.5 py-2 text-right">
                        <Signed value={g.dayPct} kind="pct" />
                      </td>
                      <td colSpan={4} />
                      <td className="px-2.5 py-2 text-right">{fmt2(g.value)}</td>
                      <td className="px-2.5 py-2 text-right">{formatPercent(g.share, { digits: 2 })}</td>
                      <td className="px-2.5 py-2 text-right">
                        <Signed value={g.gainPct} kind="pct" />
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <Signed value={g.gain} />
                      </td>
                    </tr>
                    {isOpen &&
                      g.rows.map((r) => (
                        <tr key={r.id} className="group border-b border-stone-100 last:border-0 dark:border-white/5">
                          <td className="sticky left-0 z-10 max-w-[15rem] bg-white py-2 pr-2.5 pl-4 group-hover:bg-stone-50 dark:bg-neutral-900 dark:group-hover:bg-neutral-800">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{r.name}</span>
                              <OpIcons row={r} />
                            </div>
                            <div className="flex items-center gap-1 truncate text-[11px] text-stone-500 dark:text-stone-400">
                              {r.account && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACCOUNT_TYPES[r.account.type]?.color }} />}
                              <span className="truncate">{r.account ? r.account.name : r.sub}</span>
                            </div>
                          </td>
                          <td className="px-2.5 py-2 text-center group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">
                            {r.ops?.length ? (
                              <button
                                type="button"
                                onClick={() => setOpsFor(r)}
                                className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2 py-0.5 text-[11px] font-medium hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5"
                                title="Historia operacji"
                              >
                                <ListOrdered size={12} /> {r.ops.length}
                              </button>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-right group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">
                            <div>
                              <Signed value={r.dayPct} kind="pct" />
                            </div>
                            <div className="text-[11px]">
                              <Signed value={r.dayChange || 0} />
                            </div>
                          </td>
                          <td className="px-2.5 py-2 text-right group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">{r.quantity ? formatNumber(r.quantity, 4) : '—'}</td>
                          <td className="px-2.5 py-2 text-right group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">{r.avgPricePLN ? fmt2(r.avgPricePLN) : '—'}</td>
                          <td className="px-2.5 py-2 text-right group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">
                            <div>{r.currentPricePLN ? fmt2(r.currentPricePLN) : '—'}</div>
                            {r.currency && r.currency !== 'PLN' && r.price ? <div className="text-[11px] text-stone-500">{formatMoney(r.price, r.currency)}</div> : null}
                          </td>
                          <td className="px-2.5 py-2 text-right whitespace-nowrap text-stone-600 group-hover:bg-stone-50 dark:text-stone-300 dark:group-hover:bg-white/[0.02]">{daysLabel(r.since)}</td>
                          <td className="px-2.5 py-2 text-right font-semibold group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">{fmt2(r.value)}</td>
                          <td className="px-2.5 py-2 text-right text-stone-600 group-hover:bg-stone-50 dark:text-stone-300 dark:group-hover:bg-white/[0.02]">{formatPercent(r.share, { digits: 2 })}</td>
                          <td className="px-2.5 py-2 text-right group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">
                            <Signed value={r.gainPct} kind="pct" />
                          </td>
                          <td className="px-2.5 py-2 text-right group-hover:bg-stone-50 dark:group-hover:bg-white/[0.02]">
                            <Signed value={r.gain} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
              <tfoot>
                <TotalRow data={data} position="bottom" />
              </tfoot>
            </table>
          </div>

          {/* Lista – mobile */}
          <div className="md:hidden">
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-blue-50/60 px-4 py-3 dark:border-white/10 dark:bg-blue-500/10">
              <div>
                <div className="text-sm font-semibold">Cały portfel</div>
                <div className="text-[11px] tabular">
                  dziś <Signed value={data.dayPct} kind="pct" /> · zysk <Signed value={data.gainPct} kind="pct" />
                </div>
              </div>
              <div className="text-right tabular">
                <div className="text-sm font-semibold">{formatPLN(data.total)}</div>
                <div className="text-[11px]">
                  <Signed value={data.gain} />
                </div>
              </div>
            </div>
            {data.groups.map((g) => {
              const isOpen = !collapsed[g.id];
              return (
                <div key={g.id} className="border-b border-stone-200 last:border-0 dark:border-white/10">
                  <button type="button" onClick={() => toggleSection(g.id)} className="flex w-full items-start gap-2 bg-stone-100/80 px-4 py-2.5 text-left dark:bg-white/[0.05]">
                    {isOpen ? <ChevronDown size={16} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {g.label} <span className="font-normal text-stone-500">({g.rows.length})</span>
                      </div>
                      <div className="text-[11px] tabular">
                        <Signed value={g.gain} /> · <Signed value={g.gainPct} kind="pct" /> · dziś <Signed value={g.dayPct} kind="pct" />
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
                        <li key={r.id}>
                          <button type="button" onClick={() => r.ops?.length && setOpsFor(r)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: r.account ? ACCOUNT_TYPES[r.account.type]?.color : '#a3a29b' }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-medium">{r.name}</span>
                                <OpIcons row={r} />
                              </div>
                              <div className="truncate text-[11px] text-stone-500">
                                {r.quantity && r.avgPricePLN ? `${formatNumber(r.quantity, 4)} szt. · ${fmt2(r.avgPricePLN)} → ${fmt2(r.currentPricePLN)} zł · ` : ''}
                                {holdingDays(r.since) === null ? '' : `${daysLabel(r.since)} dni`}
                              </div>
                            </div>
                            <div className="text-right tabular">
                              <div className="text-sm font-semibold">{formatPLN(r.value)}</div>
                              <div className="text-[11px]">
                                <Signed value={r.gain} /> <Signed value={r.gainPct} kind="pct" digits={1} />
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between px-4 py-3 text-sm font-semibold tabular">
              <span>Cały portfel</span>
              <span>{formatPLN(data.total)}</span>
            </div>
          </div>
        </section>
      )}
      <p className="text-[11px] text-stone-500 dark:text-stone-500">
        Ceny w PLN po bieżącym kursie walut. Śr. cena zakupu zawiera prowizje i przewalutowanie. Stopa zwrotu i zysk: akcje/ETF – wartość − koszt zakupu; obligacje – odsetki narosłe i wypłacone netto; konta oszczędnościowe – odsetki ponad wpłaty. Zmiana dzienna w % (pod spodem w zł); dla obligacji i
        oszczędności = odsetki za 1 dzień. Okres inwestycji liczony w dniach od pierwszego zakupu lub wpłaty. Ikony przy walorze: wypłaty dochodu, sprzedaż, przewalutowanie. Kliknij liczbę operacji, aby zobaczyć historię.
      </p>

      <Modal open={!!opsFor} onClose={() => setOpsFor(null)} title={`Operacje: ${opsFor?.name || ''}`}>
        {opsFor && (
          <div className="space-y-2">
            <div className="text-xs text-stone-500">
              {opsFor.account?.name || '—'} · {opsFor.ops.length} operacji · w portfelu od {formatDate(opsFor.since)}
            </div>
            <ul className="max-h-[55vh] divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200 dark:divide-white/5 dark:border-white/10">
              {opsFor.ops.map((o, i) => (
                <li key={`${o.date}-${i}`} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <div className="w-20 shrink-0 text-xs text-stone-500 tabular">{formatDate(o.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{o.type}</div>
                    <div className="truncate text-[11px] text-stone-500">
                      {o.quantity ? `${formatNumber(o.quantity, 4)} × ${formatMoney(o.price, o.currency || 'PLN')}` : ''}
                      {o.quantity && o.note ? ' · ' : ''}
                      {o.note}
                    </div>
                  </div>
                  <div className={`shrink-0 font-semibold tabular ${signClass(o.amount)}`}>{formatPLN(o.amount, { sign: true })}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
