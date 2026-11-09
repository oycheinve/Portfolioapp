import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Briefcase } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PPK_LIMITS, TDF_STAGES, defaultPpkProfile, simulatePpkTdf } from '../../lib/ppkCalc.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatPLN } from '../../lib/format.js';
import { BetaBadge, Card, ChartTooltip, Field, Input } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';

const num = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));
const pct = (v) => `${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`;

// PPK w Poduszce (BETA): wiek (data urodzenia), wynagrodzenie + średnie prowizje / premie, wpłaty pracownika
// i pracodawcy, fundusz zdefiniowanej daty – udział akcji dobierany automatycznie do wieku (ustawowe przedziały),
// symulacja do 60. roku życia i wykres kapitału (kolory zgodne z motywem). Ustawienia: settings.ppk (per użytkownik).
export default function PpkCard() {
  const { state, actions, isDark } = useApp();
  const ppk = { ...defaultPpkProfile(), ...(state.settings.ppk || {}) };
  const set = (patch) => actions.updateSettings({ ppk: { ...(state.settings.ppk || {}), ...patch } });
  const sim = useMemo(() => simulatePpkTdf(ppk), [JSON.stringify(ppk)]); // eslint-disable-line react-hooks/exhaustive-deps
  const chrome = chartChrome(isDark);
  const c = (i) => seriesColor(i, isDark);
  const data = sim.rows.map((r) => ({ age: r.age, own: Math.round(r.own + sim.startBalance), employer: Math.round(r.employer), state: Math.round(r.state), gains: Math.round(Math.max(0, r.gains)), total: Math.round(r.balance) }));
  const monthTotal = sim.firstMonth.employee + sim.firstMonth.employer;
  const input = (key, label, props = {}, hint) => (
    <Field label={label} hint={hint}>
      <Input type="number" inputMode="decimal" value={num(ppk[key])} onChange={(e) => set({ [key]: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={label} {...props} />
    </Field>
  );
  return (
    <Card
      collapsible
      storageKey="fintrack-safe-open-ppk"
      title={
        <>
          PPK – Pracownicze Plany Kapitałowe
          <BetaBadge />
        </>
      }
      summary={`${sim.age} l. · fundusz PPK ${sim.fundYear} · ${pct(sim.stage.equity)} akcji · ${formatPLN(monthTotal)} / mies. · na 60. r.ż. ${formatPLN(sim.total)}`}
      subtitle="Wpłaty, profil funduszu zdefiniowanej daty i symulacja do 60. roku życia"
      icon={Briefcase}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Data urodzenia" hint={ppk.birthDate ? `wiek: ${sim.age} lat` : 'albo wpisz wiek →'}>
          <Input type="date" value={ppk.birthDate || ''} onChange={(e) => set({ birthDate: e.target.value })} aria-label="Data urodzenia" />
        </Field>
        {!ppk.birthDate ? input('age', 'Wiek', { min: 18, max: 70, step: 1 }) : <div />}
        {input('salary', 'Podstawa brutto (zł / mies.)', { min: 0, step: 100 })}
        {input('bonus', 'Śr. prowizje / premie (zł / mies.)', { min: 0, step: 100 }, 'dochody zmienne')}
        {input('employeePct', 'Wpłata własna (%)', { min: PPK_LIMITS.employee.min, max: PPK_LIMITS.employee.max, step: 0.5 }, '2% + dodatkowa do 2%')}
        {input('employerPct', 'Wpłata pracodawcy (%)', { min: PPK_LIMITS.employer.min, max: PPK_LIMITS.employer.max, step: 0.5 }, '1,5% + dodatkowa do 2,5%')}
        {input('startBalance', 'Zgromadzone dotąd (zł)', { min: 0, step: 100 })}
        {input('salaryGrowth', 'Wzrost wynagrodzenia (% / rok)', { min: 0, max: 20, step: 0.5 })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ['Wpłata własna / mies.', formatPLN(sim.firstMonth.employee), `od ${formatPLN(sim.firstMonth.base)} (pensja + premie)`],
          ['Pracodawca / mies.', formatPLN(sim.firstMonth.employer), `PIT od niej: ${formatPLN(sim.firstMonth.tax)}`],
          ['Państwo', formatPLN(sim.state), `${sim.welcome ? '250 zł powitalna + ' : ''}${sim.annualCount} × 240 zł rocznie`],
          ['Na 60. urodziny', formatPLN(sim.total), `zysk z inwestycji ${formatPLN(sim.gains)}`],
        ].map(([l, v, sub]) => (
          <div key={l} className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{l}</div>
            <div className="truncate text-base font-semibold tabular">{v}</div>
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-stone-200 px-3 py-2.5 dark:border-white/10" aria-label="Profil funduszu">
        <div className="text-sm font-semibold">
          Fundusz zdefiniowanej daty PPK {sim.fundYear} · profil dobrany automatycznie do wieku
        </div>
        <p className="mt-0.5 text-[12px] text-stone-600 dark:text-stone-300">
          Teraz: {sim.stage.label} – ustawowo {sim.stage.min}–{sim.stage.max}% akcji (przyjęto {pct(sim.stage.equity)}), reszta obligacje. Z wiekiem udział akcji maleje:{' '}
          {TDF_STAGES.slice(0, 4)
            .map((st) => `${(st.min + st.max) / 2}%`)
            .join(' → ')}
          .
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {input('equityReturn', 'Akcje – stopa (% / rok)', { step: 0.5 }, 'długoterminowa średnia')}
          {input('bondReturn', 'Obligacje – stopa (% / rok)', { step: 0.5 })}
          {input('feePct', 'Opłata funduszu (%)', { min: 0, max: 0.6, step: 0.05 }, 'ustawowo do 0,5%')}
        </div>
      </div>

      <div className="mt-4">
        <Legend
          items={[
            { key: 'own', label: 'Wpłaty własne', color: c(0), bar: true },
            { key: 'employer', label: 'Pracodawca', color: c(1), bar: true },
            { key: 'state', label: 'Państwo', color: c(3), bar: true },
            { key: 'gains', label: 'Zysk z inwestycji', color: c(2), bar: true },
          ]}
        />
        <div className="mt-2 h-60" aria-label="Wykres PPK">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="age" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} tickFormatter={(a) => `${a} l.`} minTickGap={24} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={formatAxisPLN} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} labelFormatter={(a) => `Wiek ${a} lat`} />} />
              <Area type="monotone" dataKey="own" name="Wpłaty własne" stackId="p" stroke={c(0)} fill={c(0)} fillOpacity={0.55} isAnimationActive={false} />
              <Area type="monotone" dataKey="employer" name="Pracodawca" stackId="p" stroke={c(1)} fill={c(1)} fillOpacity={0.55} isAnimationActive={false} />
              <Area type="monotone" dataKey="state" name="Państwo" stackId="p" stroke={c(3)} fill={c(3)} fillOpacity={0.55} isAnimationActive={false} />
              <Area type="monotone" dataKey="gains" name="Zysk z inwestycji" stackId="p" stroke={c(2)} fill={c(2)} fillOpacity={0.55} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
          Symulacja do 60. roku życia: wpłaty od pensji z premiami (rosnące o {pct(ppk.salaryGrowth)} rocznie), dopłata powitalna 250 zł i roczna 240 zł (gdy spełniony próg wpłat), stopa zwrotu wg profilu funduszu w danym wieku po opłacie. Wpłata pracodawcy to przychód – PIT {pct(ppk.taxRate)} potrącany z pensji. Wartość PPK nie jest wliczana do poduszki finansowej.
        </p>
      </div>
    </Card>
  );
}
