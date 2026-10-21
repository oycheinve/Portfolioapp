import { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, Coins, History, Info, LineChart, MinusSquare, Pencil, PlusSquare, ShoppingBasket, SlidersHorizontal, Table2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { PORTFOLIO_CATEGORIES, buildPortfolioRows, groupRows } from '../lib/portfolioTable.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { isSafeAccount } from '../lib/engine.js';
import { formatDate, formatMoney, formatNumber, formatPLN, formatPercent, signClass } from '../lib/format.js';
import { Card, Dropdown, EmptyState, Modal, Segmented } from '../components/ui.jsx';
import OperationFormModal, { emptyOperation } from '../components/cash/OperationFormModal.jsx';
import { DividendsModal, InstrumentEditModal, PriceChartModal } from '../components/portfolio/RowModals.jsx';

const PREFS_KEY = 'wealth-app-portfolio-filters';
const VIEW_KEY = 'wealth-app-portfolio-mobile-view';

function readMobileView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table';
  } catch {
    return 'table';
  }
}

// Liczby w tabeli jak we wzorcu: kropka dziesiętna, spacja tysięcy („1 397.20”), jednostka w nagłówku kolumny
const dotFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const fmt2 = (v) => (Number.isFinite(v) ? dotFormatter.format(v).replace(/,/g, ' ') : '—');
const pct2 = (v) => (Number.isFinite(v) ? fmt2(v * 100) : '—');
// Bez zbędnych zer na końcu: „88.9”, „0”, „117.81”
const trim = (text) => (text.includes('.') ? text.replace(/\.?0+$/, '') : text);
const pctTrim = (v) => (Number.isFinite(v) ? trim(pct2(v)) : '—');
const units = (v) => (Number.isFinite(v) ? unitFormatter.format(v).replace(/,/g, ' ') : '—');
// Nagłówek sekcji: kwoty z przecinkiem bez separatora tysięcy („5545,86”, „6800”), procenty jak we wzorcu
const hAmount = (v) => trim((Number(v) || 0).toFixed(2)).replace('.', ',');
const hPctComma = (v) => `${trim(((Number(v) || 0) * 100).toFixed(2)).replace('.', ',')}%`;
const hPctDot = (v) => `${trim(((Number(v) || 0) * 100).toFixed(2))}%`;

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

// Średni okres inwestycji ważony wartością pozycji
function weightedDays(rows) {
  let w = 0;
  let s = 0;
  for (const r of rows) {
    const d = holdingDays(r.since);
    if (d === null || !(r.value > 0)) continue;
    w += r.value;
    s += r.value * d;
  }
  return w > 0 ? Math.round(s / w) : null;
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

// Wartość z kolorem i strzałką (jak w tabeli wzorcowej): ^ 1.99 / v -7.72
function Arrowed({ value, trimZeros = false }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="text-stone-400">—</span>;
  const Icon = value > 0 ? ChevronUp : value < 0 ? ChevronDown : null;
  return (
    <span className={`inline-flex w-full items-center justify-between gap-1 ${signClass(value)}`}>
      <span className="w-3">{Icon && <Icon size={13} strokeWidth={2.5} />}</span>
      <span>{trimZeros ? pctTrim(value) : pct2(value)}</span>
    </span>
  );
}

// Kolorowa liczba w nagłówku sekcji
function Colored({ value, children }) {
  return <span className={value > 0 ? 'text-emerald-600 dark:text-emerald-400' : value < 0 ? 'text-red-600 dark:text-red-400' : ''}>{children}</span>;
}

const COLS = [
  { key: 'name', label: 'Walor' },
  { key: 'ops', label: 'Operacje' },
  { key: 'day', label: 'Zmiana dzienna* [%]' },
  { key: 'qty', label: 'Liczba jednostek' },
  { key: 'avg', label: 'Śr. cena zakupu [PLN]' },
  { key: 'price', label: 'Cena aktualna [PLN]' },
  { key: 'period', label: 'Okres inwestycji' },
  { key: 'value', label: 'Wartość waloru [PLN]' },
  { key: 'share', label: 'Udział w wartości portfela [%]' },
  { key: 'rate', label: 'Stopa zwrotu [%]' },
  { key: 'gain', label: 'Zysk [PLN]' },
];

const cell = 'border-l border-stone-200 px-2 py-1 text-right whitespace-nowrap dark:border-white/10';

function sectionCost(g) {
  return g.rows.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
}

// Pełny opis sekcji (podpowiedź po najechaniu): „Akcje GPW (9), wartość: …, zysk: …, wartość zakupu: …, zysk dzienny: …, zwrot: …”
function sectionTitle(g) {
  return `${g.label} (${g.rows.length}), wartość: ${hAmount(g.value)}, zysk: ${hAmount(g.gain)}, wartość zakupu: ${hAmount(sectionCost(g))}, zysk dzienny: ${hAmount(g.dayChange)}, zwrot: ${hPctComma(g.gainPct)}, zmiana dzienna: ${hPctDot(g.dayPct)}, udział: ${hPctDot(g.share)}`;
}

export default function PortfolioView({ onNavigate }) {
  const { state, actions } = useApp();
  const rows = useMemo(() => buildPortfolioRows(state), [state]);
  const saved = useMemo(readPrefs, []);
  const allCats = PORTFOLIO_CATEGORIES.map((c) => c.id);
  const allAccs = state.accounts.map((a) => a.id);
  const [categories, setCategories] = useState(() => (saved?.categories || allCats).filter((c) => allCats.includes(c)));
  const [hiddenAccounts, setHiddenAccounts] = useState(() => saved?.hiddenAccounts || []);
  const [collapsed, setCollapsed] = useState(() => saved?.collapsed || {});
  const [opsFor, setOpsFor] = useState(null);
  const [opForm, setOpForm] = useState(null);
  // Telefon: tabela przewijana w poziomie (przypięta kolumna „Walor”) albo karty
  const [mobileView, setMobileViewState] = useState(readMobileView);
  const setMobileView = (v) => {
    setMobileViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // brak localStorage – wybór widoku nie zostanie zapamiętany
    }
  };
  const [divFor, setDivFor] = useState(null);
  const [chartFor, setChartFor] = useState(null);
  const [editInst, setEditInst] = useState(null);

  const accounts = allAccs.filter((id) => !hiddenAccounts.includes(id));
  const data = useMemo(() => groupRows(rows, { categories, accounts }), [rows, categories, accounts]);
  const present = new Set(rows.map((r) => r.category));
  const counts = Object.fromEntries(PORTFOLIO_CATEGORIES.map((c) => [c.id, rows.filter((r) => r.category === c.id).length]));
  const presentCats = PORTFOLIO_CATEGORIES.filter((c) => present.has(c.id));
  const activeFilters = presentCats.filter((c) => !categories.includes(c.id)).length + hiddenAccounts.length;
  const visibleRows = data.groups.flatMap((g) => g.rows);
  const totalDays = weightedDays(visibleRows);
  // „Cały Portfel” jak fundusz: jednostka startuje od 100 zł i rośnie o prostą stopę zwrotu
  // (zysk / koszt zakupu widocznych pozycji – bez zawyżeń przy dużych wpłatach na końcu okresu)
  const fundReturn = data.gainPct;
  // Podział: portfel inwestycyjny vs poduszka finansowa (konta oszczędnościowe i obligacyjne); nieruchomości poza oboma
  const split = useMemo(() => {
    const agg = (list) => {
      const value = list.reduce((s, r) => s + r.value, 0);
      const withGain = list.filter((r) => r.gain !== null && r.gain !== undefined);
      const gain = withGain.reduce((s, r) => s + r.gain, 0);
      const cost = withGain.reduce((s, r) => s + (Number(r.cost) || 0), 0);
      const dayChange = list.reduce((s, r) => s + (r.dayChange || 0), 0);
      return { value, gain, gainPct: cost > 0 ? gain / cost : null, dayPct: value - dayChange > 0 ? dayChange / (value - dayChange) : 0, share: data.total > 0 ? value / data.total : 0, count: list.length, days: weightedDays(list) };
    };
    const rowsAll = data.groups.flatMap((g) => g.rows);
    return [
      { id: 'invest', label: 'Portfel inwestycyjny', ...agg(rowsAll.filter((r) => r.category !== 'OTHER' && !(r.account && isSafeAccount(r.account)))) },
      { id: 'safe', label: 'Poduszka finansowa', ...agg(rowsAll.filter((r) => r.category !== 'OTHER' && r.account && isSafeAccount(r.account))) },
    ].filter((x) => x.count > 0);
  }, [data]);
  const unitPrice = 100 * (1 + fundReturn);
  const fundUnits = unitPrice > 0 ? data.total / unitPrice : null;
  const multiAccount = useMemo(() => {
    const seen = {};
    for (const r of rows) if (r.instrumentId) seen[r.instrumentId] = (seen[r.instrumentId] || 0) + 1;
    return seen;
  }, [rows]);

  const persist = (patch) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ categories, hiddenAccounts, collapsed, ...patch }));
    } catch {
      // brak localStorage – filtr nie zostanie zapamiętany
    }
  };
  const apply = (cats, hidden) => {
    setCategories(cats);
    setHiddenAccounts(hidden);
    persist({ categories: cats, hiddenAccounts: hidden });
  };
  const toggleCat = (id, on) => apply(on ? [...new Set([...categories, id])] : categories.filter((c) => c !== id), hiddenAccounts);
  const toggleAcc = (id, on) => apply(categories, on ? hiddenAccounts.filter((x) => x !== id) : [...hiddenAccounts, id]);
  const allOn = activeFilters === 0;

  const setCollapsedAll = (next) => {
    setCollapsed(next);
    persist({ collapsed: next });
  };
  const toggleSection = (id) => setCollapsedAll({ ...collapsed, [id]: !collapsed[id] });
  const allCollapsed = data.groups.length > 0 && data.groups.every((g) => collapsed[g.id]);

  const trade = (r, mode) => setOpForm({ ...emptyOperation(r.accountId), mode, instrumentId: r.instrumentId });
  const saveOperation = ({ writes, instruments }) => {
    if (instruments.length) actions.addMany('instruments', instruments);
    for (const w of writes) actions.upsert(w.collection, w.item);
    actions.notify('Zapisano transakcję', 'success');
    setOpForm(null);
  };

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
          onClick={() => setCollapsedAll(allCollapsed ? {} : Object.fromEntries(data.groups.map((g) => [g.id, true])))}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5"
        >
          {allCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {allCollapsed ? 'Rozwiń sekcje' : 'Zwiń sekcje'}
        </button>
        <div className="md:hidden">
          <Segmented
            size="sm"
            value={mobileView}
            onChange={setMobileView}
            ariaLabel="Widok portfela na telefonie"
            options={[
              { value: 'table', label: 'Tabela' },
              { value: 'cards', label: 'Karty' },
            ]}
          />
        </div>
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
        </div>
      </div>

      {data.groups.length === 0 ? (
        <Card>
          <EmptyState icon={Table2} title="Nic nie zaznaczono" description="Otwórz „Filtruj portfel” i zaznacz kategorie lub konta." />
        </Card>
      ) : (
        <section className="min-w-0 overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
          {/* Tabela – desktop (układ wzorowany na profesjonalnym widoku portfela) */}
          <div className={`${mobileView === 'table' ? 'block' : 'hidden'} overflow-x-auto overscroll-x-contain md:block`}>
            <table className="w-full min-w-[1040px] border-collapse text-[12px] tabular md:min-w-[1120px] md:text-[13px]">
              <thead>
                <tr className="bg-[#0d1b2e] text-white">
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className={`border-l border-white/10 px-2 py-2.5 text-center align-top text-[12px] leading-tight font-bold first:border-l-0 ${c.key === 'name' ? 'sticky left-0 z-10 w-[10.5rem] bg-[#0d1b2e] sm:w-[17rem]' : ''}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Cały Portfel */}
                <tr className="border-b-2 border-stone-300 bg-stone-200 text-[15px] font-semibold dark:border-white/15 dark:bg-neutral-800">
                  <td className="sticky left-0 z-10 bg-stone-200 px-3 py-2 text-left dark:bg-neutral-800">Cały Portfel</td>
                  <td className={cell} />
                  <td className={`${cell} ${signClass(data.dayPct)}`}>{pct2(data.dayPct)}</td>
                  <td className={cell}>
                    <span className="inline-flex items-center gap-1">
                      {units(Math.round((fundUnits ?? 0) * 100) / 100)}
                      <span title="Liczba jednostek portfela = wartość / cena jednostki (portfel liczony jak fundusz, start 100 zł)">
                        <Info size={13} className="text-amber-500" aria-label="Jednostki portfela" />
                      </span>
                    </span>
                  </td>
                  <td className={cell} />
                  <td className={cell} title="Cena jednostki portfela (start = 100)">
                    {fmt2(unitPrice)}
                  </td>
                  <td className={cell} title="Średni okres ważony wartością pozycji (dni)">
                    {totalDays ?? '—'}
                  </td>
                  <td className={cell}>{fmt2(data.total)}</td>
                  <td className={cell}>100</td>
                  <td className={`${cell} ${signClass(fundReturn)}`}>
                    <span className="inline-flex items-center gap-1">
                      {pct2(fundReturn)}
                      <span title="Stopa zwrotu: zysk / koszt zakupu widocznych pozycji (wartość + wypłaty − wpłaty na kapitale zaangażowanym)">
                        <Info size={13} className="text-amber-500" aria-label="Stopa zwrotu ważona czasem" />
                      </span>
                    </span>
                  </td>
                  <td className={`${cell} ${signClass(data.gain)}`}>{fmt2(data.gain)}</td>
                </tr>
                {split.length > 1 &&
                  split.map((x) => (
                    <tr key={x.id} className="border-b border-stone-200 bg-stone-50 text-[12px] font-medium dark:border-white/10 dark:bg-[#1c1c1c]">
                      <td className="sticky left-0 z-10 bg-stone-50 py-1.5 pr-2 pl-6 text-left whitespace-nowrap text-stone-600 dark:bg-[#1c1c1c] dark:text-stone-300">↳ {x.label}</td>
                      <td className={`${cell} text-stone-500`}>{x.count} poz.</td>
                      <td className={cell}>
                        <Arrowed value={x.dayPct} />
                      </td>
                      <td className={cell} />
                      <td className={cell} />
                      <td className={cell} />
                      <td className={cell}>{x.days ?? '—'}</td>
                      <td className={cell}>{fmt2(x.value)}</td>
                      <td className={cell}>{pct2(x.share)}</td>
                      <td className={cell}>{x.gainPct !== null ? <Arrowed value={x.gainPct} /> : '—'}</td>
                      <td className={`${cell} ${signClass(x.gain)}`}>{fmt2(x.gain)}</td>
                    </tr>
                  ))}
              </tbody>
              {data.groups.map((g) => {
                const isOpen = !collapsed[g.id];
                const Toggle = isOpen ? MinusSquare : PlusSquare;
                return (
                  <tbody key={g.id}>
                    {/* Pas sekcji: jedna linia, podsumowania w kolumnach (wartość, udział, stopa, zysk, zmiana dzienna) */}
                    <tr
                      className="cursor-pointer border-y-2 border-stone-300 bg-stone-100 font-semibold hover:bg-stone-200/70 dark:border-white/15 dark:bg-[#232323] dark:hover:bg-[#2a2a2a]"
                      onClick={() => toggleSection(g.id)}
                      title={sectionTitle(g)}
                    >
                      <td className="sticky left-0 z-10 max-w-[10.5rem] bg-stone-100 py-2 pr-2 pl-3 text-left whitespace-nowrap sm:max-w-[17rem] dark:bg-[#232323]">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <Toggle size={14} className="shrink-0 text-stone-500" aria-hidden />
                          <span className="truncate text-[12px] md:text-[14px]">
                            {g.label} ({g.rows.length})
                          </span>
                        </div>
                      </td>
                      <td className={cell} />
                      <td className={cell} title={`Zysk dzienny: ${fmt2(g.dayChange)} zł`}>
                        <Arrowed value={g.dayPct} />
                      </td>
                      <td className={cell} />
                      <td className={cell} />
                      <td className={cell} />
                      <td className={cell}>{weightedDays(g.rows) ?? '—'}</td>
                      <td className={cell}>{fmt2(g.value)}</td>
                      <td className={cell}>{pct2(g.share)}</td>
                      <td className={cell}>{g.gainPct !== null && g.gainPct !== undefined ? <Arrowed value={g.gainPct} /> : '—'}</td>
                      <td className={`${cell} ${signClass(g.gain ?? 0)}`}>{fmt2(g.gain ?? 0)}</td>
                    </tr>
                    {isOpen &&
                      g.rows.map((r, idx) => {
                        const days = holdingDays(r.since);
                        const isSecurity = !!r.instrumentId;
                        const stripe = idx % 2 ? 'bg-stone-50 dark:bg-[#1c1c1c]' : 'bg-white dark:bg-neutral-900';
                        return (
                          <tr key={r.id} className={`group border-b border-stone-200 hover:bg-blue-50/60 dark:border-white/5 dark:hover:bg-white/[0.05] ${stripe}`}>
                            <td className={`sticky left-0 z-10 max-w-[10.5rem] py-1.5 pr-2 pl-0 text-left shadow-[2px_0_0_rgba(0,0,0,0.06)] sm:max-w-[17rem] ${stripe} group-hover:bg-blue-50 dark:group-hover:bg-neutral-800`}>
                              <div className="flex items-center gap-2">
                                <span className="h-5 w-[3px] shrink-0" style={{ background: r.account ? ACCOUNT_TYPES[r.account.type]?.color : '#a3a29b' }} />
                                <div className="min-w-0 truncate text-[13px] md:text-[14px]" title={`${r.sub || ''}${r.account ? ` · ${r.account.name}` : ''}`}>
                                  {isSecurity && r.sub && r.sub.toUpperCase() !== r.name.toUpperCase() ? `${r.sub} (${r.name})` : r.name}
                                  {isSecurity && multiAccount[r.instrumentId] > 1 && <span className="ml-1.5 text-[11px] text-stone-500">· {r.account?.name.split(' – ')[0]}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="border-l border-stone-200 px-1.5 py-1 dark:border-white/10">
                              <RowActions
                                row={r}
                                onBuy={isSecurity ? () => trade(r, 'BUY') : null}
                                onSell={isSecurity ? () => trade(r, 'SELL') : null}
                                onHistory={r.ops?.length ? () => setOpsFor(r) : null}
                                onDividends={isSecurity ? () => setDivFor(r) : null}
                                onChart={isSecurity ? () => setChartFor(r) : null}
                                onEdit={isSecurity ? () => setEditInst(r.instrumentId) : r.account && onNavigate ? () => onNavigate('settings') : null}
                              />
                            </td>
                            <td className={cell}>
                              <Arrowed value={r.dayPct} />
                            </td>
                            <td className={cell}>{r.quantity ? units(r.quantity) : '—'}</td>
                            <td className={cell}>{r.avgPricePLN ? fmt2(r.avgPricePLN) : '—'}</td>
                            <td className={cell} title={r.currency && r.currency !== 'PLN' && r.price ? formatMoney(r.price, r.currency) : undefined}>
                              {r.currentPricePLN ? fmt2(r.currentPricePLN) : '—'}
                            </td>
                            <td className={cell}>{days ?? '—'}</td>
                            <td className={cell}>{fmt2(r.value)}</td>
                            <td className={cell}>{pct2(r.share)}</td>
                            <td className={cell}>{r.gainPct !== null && r.gainPct !== undefined ? <Arrowed value={r.gainPct} trimZeros /> : <span className="text-stone-400">—</span>}</td>
                            <td className={`${cell} ${r.gain !== null && r.gain !== undefined ? signClass(r.gain) : ''}`}>{r.gain !== null && r.gain !== undefined ? fmt2(r.gain) : '—'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="border-t-2 border-stone-300 bg-stone-100 text-[14px] font-semibold italic dark:border-white/15 dark:bg-neutral-800">
                  <td className="sticky left-0 z-10 bg-stone-100 px-3 py-2 text-left dark:bg-neutral-800">Razem ({data.count})</td>
                  <td className={cell} />
                  <td className={`${cell} ${signClass(data.dayPct)}`}>{pct2(data.dayPct)}</td>
                  <td className={cell}>---</td>
                  <td className={cell}>---</td>
                  <td className={cell}>---</td>
                  <td className={cell}>{totalDays ?? '---'}</td>
                  <td className={cell}>{fmt2(data.total)}</td>
                  <td className={cell}>---</td>
                  <td className={`${cell} ${signClass(data.gainPct)}`}>{pct2(data.gainPct)}</td>
                  <td className={`${cell} ${signClass(data.gain)}`}>{fmt2(data.gain)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Lista – mobile */}
          <div className={mobileView === 'cards' ? 'md:hidden' : 'hidden'}>
            <div className="flex items-start justify-between gap-3 bg-[#0d1b2e] px-4 py-3 text-white">
              <div>
                <div className="text-sm font-semibold">Cały Portfel</div>
                <div className="text-[11px] text-white/70 tabular">
                  dziś {formatPercent(data.dayPct, { sign: true })} · zwrot {formatPercent(data.gainPct, { sign: true })} · {totalDays ?? '—'} dni
                </div>
              </div>
              <div className="text-right tabular">
                <div className="text-sm font-semibold">{formatPLN(data.total)}</div>
                <div className="text-[11px] text-white/80">{formatPLN(data.gain, { sign: true })}</div>
              </div>
            </div>
            {split.length > 1 && (
              <div className="grid grid-cols-2 divide-x divide-stone-200 border-b border-stone-200 bg-stone-50 text-[11px] dark:divide-white/10 dark:border-white/10 dark:bg-[#1c1c1c]">
                {split.map((x) => (
                  <div key={x.id} className="px-4 py-2">
                    <div className="truncate text-stone-500">{x.label}</div>
                    <div className="font-semibold tabular">{formatPLN(x.value)}</div>
                    <div className="tabular">
                      <Signed value={x.gain} /> {x.gainPct !== null && <Signed value={x.gainPct} kind="pct" digits={1} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.groups.map((g) => {
              const isOpen = !collapsed[g.id];
              const Toggle = isOpen ? MinusSquare : PlusSquare;
              return (
                <div key={g.id} className="border-b border-stone-200 last:border-0 dark:border-white/10">
                  <button type="button" onClick={() => toggleSection(g.id)} title={sectionTitle(g)} className="block w-full bg-stone-100 px-4 py-2 text-left dark:bg-[#232323]">
                    <div className="flex items-center gap-2">
                      <Toggle size={15} className="shrink-0 text-stone-500" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {g.label} ({g.rows.length})
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular">{formatPLN(g.value)}</span>
                    </div>
                    <div className="mt-0.5 flex gap-2.5 overflow-hidden pl-6 text-[11px] whitespace-nowrap tabular">
                      <span className={signClass(g.gain ?? 0)}>{formatPLN(g.gain ?? 0, { sign: true })}</span>
                      <span>
                        zwrot <Colored value={g.gainPct}>{formatPercent(g.gainPct ?? 0, { sign: true })}</Colored>
                      </span>
                      <span>
                        dziś <Colored value={g.dayPct}>{formatPercent(g.dayPct, { sign: true })}</Colored>
                      </span>
                      <span className="text-stone-500">udz. {formatPercent(g.share, { digits: 1 })}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-stone-100 dark:divide-white/5">
                      {g.rows.map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => r.ops?.length && setOpsFor(r)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left">
                            <span className="mt-0.5 h-8 w-1 shrink-0 rounded" style={{ background: r.account ? ACCOUNT_TYPES[r.account.type]?.color : '#a3a29b' }} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{r.name}</div>
                              <div className="truncate text-[11px] text-stone-500">
                                {r.quantity && r.avgPricePLN ? `${units(r.quantity)} szt. · ${fmt2(r.avgPricePLN)} → ${fmt2(r.currentPricePLN)} zł · ` : ''}
                                {holdingDays(r.since) === null ? '' : `${holdingDays(r.since)} dni`}
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
            <div className="flex justify-between bg-stone-100 px-4 py-3 text-sm font-semibold italic tabular dark:bg-neutral-800">
              <span>Razem ({data.count})</span>
              <span>{formatPLN(data.total)}</span>
            </div>
          </div>
        </section>
      )}
      <p className="text-[11px] text-stone-500 dark:text-stone-500">
        * Zmiana dzienna względem poprzedniego zamknięcia; dla obligacji i oszczędności – odsetki za 1 dzień. Ceny w PLN po bieżącym kursie walut; śr. cena zakupu zawiera prowizje i przewalutowanie. Okres inwestycji w dniach od
        pierwszego zakupu lub wpłaty. Operacje: kup, sprzedaj, historia operacji, notowania; ikony monet i strzałek oznaczają wypłacony dochód i przewalutowanie.
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

      <OperationFormModal form={opForm} setForm={setOpForm} onSave={saveOperation} />
      <DividendsModal row={divFor} onClose={() => setDivFor(null)} />
      <PriceChartModal row={chartFor} onClose={() => setChartFor(null)} />
      <InstrumentEditModal key={editInst || 'none'} instrumentId={editInst} onClose={() => setEditInst(null)} />
    </div>
  );
}

// Puste miejsce zamiast niedostępnej ikony – ikony w kolejnych wierszach stoją w równych kolumnach
function Slot({ show, children }) {
  return show ? children : <span className="inline-block w-[21px]" />;
}

// Pasek ikon operacji przy walorze (jak we wzorcu): kup, sprzedaj, historia, dywidendy, notowania, edycja + wskaźnik przewalutowania
function RowActions({ row, onBuy, onSell, onHistory, onDividends, onChart, onEdit }) {
  const ops = row.ops || [];
  const hasIncome = ops.some((o) => /Dywidenda|Kupon|Odsetki/.test(o.type));
  const fx = (row.fxFees || 0) > 0;
  const btn = 'relative rounded p-[3px] text-stone-700 hover:bg-stone-200 hover:text-blue-700 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-blue-300';
  return (
    <div className="flex items-center gap-px">
      <Slot show={!!onBuy}>
        <button type="button" className={btn} onClick={onBuy} title="Kup" aria-label={`Kup ${row.name}`}>
          <ShoppingBasket size={15} />
        </button>
      </Slot>
      <Slot show={!!onSell}>
        <button type="button" className={btn} onClick={onSell} title="Sprzedaj" aria-label={`Sprzedaj ${row.name}`}>
          <CircleDollarSign size={15} />
        </button>
      </Slot>
      <Slot show={!!onHistory}>
        <button type="button" className={btn} onClick={onHistory} title={`Historia transakcji (${ops.length})`} aria-label={`Historia transakcji ${row.name}`}>
          <History size={15} />
        </button>
      </Slot>
      <Slot show={!!onDividends}>
        <button type="button" className={btn} onClick={onDividends} title={hasIncome ? 'Dywidendy – wypłacone i nadchodzące' : 'Dywidendy (brak wypłat)'} aria-label={`Dywidendy ${row.name}`}>
          <Coins size={15} className={hasIncome ? '' : 'opacity-40'} />
          {hasIncome && <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-red-600" />}
        </button>
      </Slot>
      <Slot show={!!onChart}>
        <button type="button" className={btn} onClick={onChart} title="Wykres notowań" aria-label={`Wykres ${row.name}`}>
          <LineChart size={15} />
        </button>
      </Slot>
      <Slot show={!!onEdit}>
        <button type="button" className={btn} onClick={onEdit} title="Edytuj walor" aria-label={`Edytuj ${row.name}`}>
          <Pencil size={14} />
        </button>
      </Slot>
      {fx && <ArrowLeftRight size={12} className="ml-1 text-stone-400" aria-label={`Przewalutowanie ${fmt2(row.fxFees)} zł`} />}
    </div>
  );
}
