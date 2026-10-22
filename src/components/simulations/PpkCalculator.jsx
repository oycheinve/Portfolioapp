import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Briefcase } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PPK_ANNUAL, PPK_LIMITS, PPK_WELCOME, defaultPpkCalc, simulatePpk } from '../../lib/ppkCalc.js';
import { contributionLimitsForYear } from '../../lib/tax.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatPLN, formatPercent } from '../../lib/format.js';
import { Card, ChartTooltip, Field, Input, Segmented, Slider, Toggle } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';

const KEY = 'wealth-app-ppk-calc';
const pct = (v) => `${Number(v).toFixed(1).replace('.', ',')}%`;

// Kalkulator PPK: wpłaty pracownika i pracodawcy od wynagrodzenia, dopłaty państwa, wzrost kapitału w czasie
export default function PpkCalculator() {
  const { state, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const year = new Date().getFullYear();
  // Domyślne wynagrodzenie: przeciętne (limit IKE = 3× prognozowane przeciętne wynagrodzenie)
  const averageWage = (contributionLimitsForYear(state.settings, year)?.ike || 28260) / 3;
  const [p, setP] = useState(() => {
    const base = defaultPpkCalc(averageWage);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      return saved ? { ...base, ...saved } : base;
    } catch {
      return base;
    }
  });
  const set = (patch) =>
    setP((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // brak localStorage – parametry nie zostaną zapamiętane
      }
      return next;
    });
  const sim = useMemo(() => simulatePpk(p, year), [p, year]);
  const c = (slot) => seriesColor(slot, isDark);
  const COLORS = { own: c(0), employer: c(1), state: c(2), gains: c(3) };
  const data = [
    { label: String(year), own: 0, employer: 0, state: 0, gains: 0 },
    ...sim.rows.map((r) => ({
      label: p.horizonMode === 'AGE' ? `${r.year} (${r.age} l.)` : String(r.year),
      own: Math.round(r.own),
      employer: Math.round(r.employer),
      state: Math.round(r.state),
      gains: Math.round(Math.max(0, r.gains)),
    })),
  ];
  const share = (v) => (sim.total > 0 ? v / sim.total : 0);
  const pillars = [
    { key: 'own', label: 'Twoje wpłaty (pracownik)', value: sim.own, color: COLORS.own },
    { key: 'employer', label: 'Wpłaty pracodawcy', value: sim.employer, color: COLORS.employer },
    { key: 'state', label: 'Dopłaty od państwa', value: sim.state, color: COLORS.state },
    { key: 'gains', label: 'Zyski z inwestycji', value: sim.gains, color: COLORS.gains },
  ];
  const reducedWarn = p.employeePct < PPK_LIMITS.employee.basic && !sim.reducedAllowed;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card title="Kalkulator PPK" subtitle="Pracownicze Plany Kapitałowe – wpłaty Twoje i pracodawcy, dopłaty państwa i wzrost kapitału w czasie" icon={Briefcase}>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Miesięczne wynagrodzenie brutto (zł)" hint={`Domyślnie przeciętne wynagrodzenie ${year}: ${formatPLN(Math.round(averageWage))}`}>
            <Input type="number" min="0" step="100" value={p.salary} onChange={(e) => set({ salary: Math.max(0, Number(e.target.value) || 0) })} aria-label="Wynagrodzenie brutto" />
          </Field>
          <Slider
            label="Składka pracownika"
            value={p.employeePct}
            onChange={(v) => set({ employeePct: v })}
            min={PPK_LIMITS.employee.min}
            max={PPK_LIMITS.employee.max}
            step={0.1}
            format={pct}
            accent={COLORS.own}
            hint={reducedWarn ? `Składka poniżej 2% tylko przy wynagrodzeniu ≤ 1,2× płacy minimalnej (${formatPLN(sim.reducedThreshold)})` : 'Podstawowa 2% (0,5–2% przy niskich zarobkach) + dodatkowa do 2%'}
          />
          <Slider
            label="Składka pracodawcy"
            value={p.employerPct}
            onChange={(v) => set({ employerPct: v })}
            min={PPK_LIMITS.employer.min}
            max={PPK_LIMITS.employer.max}
            step={0.1}
            format={pct}
            accent={COLORS.employer}
            hint="Podstawowa 1,5% + dodatkowa do 2,5%"
          />
          <Slider label="Roczna stopa zwrotu funduszu" value={p.returnPct} onChange={(v) => set({ returnPct: v })} min={0} max={12} step={0.1} format={pct} accent={COLORS.gains} hint="Fundusze zdefiniowanej daty – zwykle 5–7% w długim terminie" />
          <Slider label="Opłata za zarządzanie" value={p.feePct} onChange={(v) => set({ feePct: v })} min={0} max={0.6} step={0.05} format={(v) => `${v.toFixed(2).replace('.', ',')}%`} accent={chrome.muted} hint="Maks. 0,5% rocznie (+ do 0,1% za wynik)" />
          <Slider label="Roczny wzrost wynagrodzenia" value={p.salaryGrowth} onChange={(v) => set({ salaryGrowth: v })} min={0} max={12} step={0.5} format={pct} accent={c(4)} hint="Inflacja płacowa i podwyżki" />
          <div className="space-y-2">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Horyzont oszczędzania</div>
            <Segmented
              size="sm"
              value={p.horizonMode}
              onChange={(v) => set({ horizonMode: v })}
              ariaLabel="Horyzont"
              options={[
                { value: 'YEARS', label: 'Liczba lat' },
                { value: 'AGE', label: 'Wiek docelowy' },
              ]}
            />
            {p.horizonMode === 'YEARS' ? (
              <Slider label="Lata oszczędzania" value={p.years} onChange={(v) => set({ years: v })} min={1} max={45} step={1} format={(v) => `${v} lat`} accent={c(0)} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Twój wiek">
                  <Input type="number" min="18" max="69" value={p.age} onChange={(e) => set({ age: Math.max(0, Number(e.target.value) || 0) })} aria-label="Twój wiek" />
                </Field>
                <Field label="Wiek docelowy" hint="Wypłata bez warunków od 60. r.ż.">
                  <Input type="number" min="19" max="80" value={p.targetAge} onChange={(e) => set({ targetAge: Math.max(0, Number(e.target.value) || 0) })} aria-label="Wiek docelowy" />
                </Field>
              </div>
            )}
            <div className="text-[11px] text-stone-500">Okres: {sim.years} lat</div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Podatek od wpłaty pracodawcy (PIT)</div>
            <Segmented
              size="sm"
              value={String(p.taxRate)}
              onChange={(v) => set({ taxRate: Number(v) })}
              ariaLabel="Stawka PIT od wpłaty pracodawcy"
              options={[
                { value: '12', label: '12%' },
                { value: '32', label: '32%' },
                { value: '0', label: 'brak' },
              ]}
            />
            <div className="text-[11px] text-stone-500">Wpłata pracodawcy jest Twoim przychodem – podatek pobierany z pensji netto</div>
          </div>
          <Toggle checked={p.welcome !== false} onChange={(v) => set({ welcome: v })} label="Dopłata powitalna 250 zł" description="Nowy uczestnik – po 3 miesiącach wpłat (wyłącz, jeśli już ją otrzymałeś)" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Kapitał na koniec" value={formatPLN(sim.total)} sub={`po ${sim.years} latach · ${formatPercent(sim.total > 0 ? sim.gains / sim.total : 0, { digits: 0 })} to zyski`} tone="text-blue-700 dark:text-blue-400" />
        <Tile label="Twoje wpłaty" value={formatPLN(sim.own)} sub={`${formatPLN(sim.firstMonth.employee)} / mies. na start`} />
        <Tile label="Wpłaty pracodawcy" value={formatPLN(sim.employer)} sub={`${formatPLN(sim.firstMonth.employer)} / mies. na start`} />
        <Tile label="Państwo + zyski" value={formatPLN(sim.state + sim.gains)} sub={`dopłaty ${formatPLN(sim.state)} · zyski ${formatPLN(sim.gains)}`} tone="text-emerald-700 dark:text-emerald-400" />
        <Tile label="Koszt z Twojej kieszeni" value={formatPLN(sim.outOfPocket)} sub={`wpłaty + PIT od wpłat pracodawcy ${formatPLN(sim.tax)}`} />
        <Tile label="Za 1 zł własną" value={`${sim.multiplier.toFixed(2).replace('.', ',')} zł`} sub="kapitału PPK na koniec okresu" tone="text-emerald-700 dark:text-emerald-400" />
      </div>

      <Card title="Z czego składa się kapitał" subtitle="Trzy filary: Ty, pracodawca oraz państwo i rynek" bodyClassName="p-4 sm:p-5">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-white/5" role="img" aria-label="Struktura kapitału PPK">
          {pillars.map((x) => (
            <div key={x.key} className="h-full" style={{ width: `${share(Math.max(0, x.value)) * 100}%`, background: x.color }} title={`${x.label}: ${formatPLN(x.value)}`} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Pillar title="1. Własne wpłaty pracownika" value={sim.own} share={share(sim.own)} color={COLORS.own} />
          <Pillar title="2. Wpłaty pracodawcy" value={sim.employer} share={share(sim.employer)} color={COLORS.employer} />
          <Pillar
            title="3. Dopłaty państwa + zyski z inwestycji"
            value={sim.state + sim.gains}
            share={share(sim.state + sim.gains)}
            color={COLORS.state}
            detail={[
              { label: `Dopłata powitalna`, value: sim.welcome, color: COLORS.state },
              { label: `Dopłaty roczne (${sim.annualCount} × ${PPK_ANNUAL} zł)`, value: sim.annualTotal, color: COLORS.state },
              { label: 'Zyski z inwestycji', value: sim.gains, color: COLORS.gains },
            ]}
          />
        </div>
        <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">
          Wypłata po 60. roku życia bez podatku od zysków: 25% jednorazowo ({formatPLN(sim.payout.lump)}) i 75% w co najmniej 120 ratach (ok. {formatPLN(sim.payout.installment)} miesięcznie, bez dalszego oprocentowania). Wcześniejszy zwrot: potrącenie 30% wpłat pracodawcy (do ZUS), dopłat państwa i 19% podatku od zysku.
        </p>
      </Card>

      <Card title="Wzrost kapitału w czasie" bodyClassName="p-4 sm:p-5">
        <Legend items={pillars.map((x) => ({ key: x.key, label: x.label, color: x.color, bar: true }))} />
        <div className="mt-2 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} minTickGap={20} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={formatAxisPLN} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} />
              {pillars.map((x) => (
                <Area key={x.key} type="monotone" dataKey={x.key} name={x.label} stackId="ppk" stroke={x.color} fill={x.color} fillOpacity={0.55} strokeWidth={1.5} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Projekcja rok po roku" bodyClassName="p-0 sm:p-0">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 bg-white dark:bg-neutral-900">
              <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
                <th className="px-4 py-2 font-medium">Rok</th>
                <th className="px-3 py-2 text-right font-medium">Wynagrodzenie / mies.</th>
                <th className="px-3 py-2 text-right font-medium">Wpłaty pracownika</th>
                <th className="px-3 py-2 text-right font-medium">Wpłaty pracodawcy</th>
                <th className="px-3 py-2 text-right font-medium">Dopłaty państwa</th>
                <th className="px-3 py-2 text-right font-medium">Zyski (narastająco)</th>
                <th className="px-4 py-2 text-right font-medium">Kapitał</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {sim.rows.map((r) => (
                <tr key={r.n} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                  <td className="px-4 py-1.5">
                    {r.year}
                    {r.age !== null && <span className="text-[11px] text-stone-500"> · {r.age} l.</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right text-stone-500">{formatPLN(r.salary)}</td>
                  <td className="px-3 py-1.5 text-right">{formatPLN(r.employeeYear)}</td>
                  <td className="px-3 py-1.5 text-right">{formatPLN(r.employerYear)}</td>
                  <td className="px-3 py-1.5 text-right" title={r.annualOk ? '' : `Wpłaty poniżej progu dopłaty rocznej (${formatPLN(r.threshold)})`}>
                    {r.stateYear > 0 ? formatPLN(r.stateYear) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-emerald-700 dark:text-emerald-400">{formatPLN(r.gains, { sign: true })}</td>
                  <td className="px-4 py-1.5 text-right font-medium">{formatPLN(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-stone-500 sm:px-5">
          Wpłaty co miesiąc od wynagrodzenia brutto, rosnącego o założony procent rocznie. Dopłata powitalna {PPK_WELCOME} zł po 3 miesiącach, dopłata roczna {PPK_ANNUAL} zł na koniec roku, gdy wpłaty pracownika i pracodawcy w roku wyniosą co najmniej 3,5% sześciokrotności płacy minimalnej ({formatPLN(sim.rows[0]?.threshold || 0)} w {year}; przy obniżonej składce pracownika – 25% tej kwoty). Stopa zwrotu pomniejszona o opłatę za zarządzanie; wynik nie jest gwarantowany.
        </p>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-lg font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{sub}</div>}
    </div>
  );
}

function Pillar({ title, value, share, color, detail }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-200 p-3 dark:border-white/10">
      <div className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="truncate">{title}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold tabular">{formatPLN(value)}</span>
        <span className="text-sm text-stone-500 tabular">{formatPercent(share, { digits: 1 })}</span>
      </div>
      {detail && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-stone-500 dark:text-stone-400">
          {detail.map((d) => (
            <li key={d.label} className="flex justify-between gap-2">
              <span className="truncate">{d.label}</span>
              <span className="tabular">{formatPLN(d.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
