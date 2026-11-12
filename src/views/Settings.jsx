import { useState } from 'react';
import { ArrowLeftRight, Baby, Bell, Building2, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Cloud, CloudDownload, Database, FileText, Filter, Landmark, Layers, LayoutGrid, LineChart, Palette, Pencil, PiggyBank, Plus, Radio, ScanLine, Scale, Sparkles, Target, Trash2, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ACCOUNT_TYPES, OTHER_ASSET_CATEGORIES, TAX_BRACKETS, XTB_FX_FEE_PCT } from '../lib/constants.js';
import { accountFxPct } from '../lib/engine.js';
import { formatDateTime, formatPLN, todayISO } from '../lib/format.js';
import { Badge, Button, Card, Field, IconButton, Input, Modal, Select, Toggle } from '../components/ui.jsx';
import LimitsCard from '../components/settings/LimitsCard.jsx';
import BackupCard from '../components/settings/BackupCard.jsx';
import CloudCard from '../components/settings/CloudCard.jsx';
import NotificationsView from './NotificationsView.jsx';
import FireGoalsCard from '../components/settings/FireGoalsCard.jsx';
import DividendSyncCard from '../components/dividends/DividendSyncCard.jsx';
import AppearanceCard from '../components/settings/AppearanceCard.jsx';
import { BudgetOptionsCard, ListsGroupingCard, ModulesVisibilityCard, ReceiptsOptionsCard } from '../components/settings/ModulesCard.jsx';
import InflationCard from '../components/settings/InflationCard.jsx';
import CashRegister from './CashRegister.jsx';
import AltPurchasesCard from '../components/alternatives/AltPurchasesCard.jsx';
import JulkaIkeCard from '../components/settings/JulkaIkeCard.jsx';
import AiFeaturesCard from '../components/settings/AiFeaturesCard.jsx';
import NewsFilterCard from '../components/settings/NewsFilterCard.jsx';
import CompanyProfilesCard from '../components/settings/CompanyProfilesCard.jsx';
import { AccountFormModal, BelkaBadge, DeleteAccountModal, INVEST_ACCOUNT_TYPES } from '../components/settings/AccountForm.jsx';

// Konta i ustawienia: pięć klikanych kategorii – każda na osobnej stronie z podkategoriami i kafelkami sekcji.
// Kafelek otwiera osobny widok sekcji (#/settings/<id>) z przyciskiem powrotu; dawne #/settings/fire
// i #/settings/notifications (także #/notifications) prowadzą wprost do sekcji.
const SECTIONS = {
  accounts: { title: 'Konta inwestycyjne', hint: 'IKE, IKZE, konta maklerskie', icon: Wallet, render: () => <AccountsSection /> },
  cash: {
    title: 'Rejestr wpłat i wypłat',
    hint: 'Wpłaty, wypłaty, historia przepływów i zakupy surowców / krypto',
    icon: ArrowLeftRight,
    render: () => (
      <>
        <AltPurchasesCard />
        <CashRegister />
      </>
    ),
  },
  julka: { title: 'IKE - Julka', hint: 'Osobne konto: ETF IE00BK5BQT80 za 100 zł / mies.', icon: Baby, render: () => <JulkaIkeCard /> },
  'other-assets': { title: 'Nieruchomości i inne aktywa', hint: 'Wliczane do Majątku Całkowitego', icon: Building2, render: () => <OtherAssetsSection /> },
  limits: { title: 'Limity wpłat IKE / IKZE', hint: 'Roczne limity i wykorzystanie', icon: CalendarClock, render: () => <LimitsCard /> },
  ai: { title: 'Funkcje AI', hint: 'Włączanie i wyłączanie poszczególnych funkcji AI', icon: Sparkles, render: () => <AiFeaturesCard /> },
  modules: { title: 'Widoczne moduły', hint: 'Które zakładki są w menu', icon: LayoutGrid, render: () => <ModulesVisibilityCard /> },
  'budget-options': { title: 'Budżet', hint: 'Kategoria „Z oszczędności”', icon: PiggyBank, render: () => <BudgetOptionsCard /> },
  receipts: { title: 'Paragony', hint: 'Podgląd przed zapisem, kaucja za napoje, podział 50/50', icon: ScanLine, render: () => <ReceiptsOptionsCard /> },
  lists: { title: 'Zakupy i Zadania', hint: 'Grupowanie według kategorii', icon: Layers, render: () => <ListsGroupingCard /> },
  appearance: { title: 'Wygląd', hint: 'Motyw: jasny, ciemny, różowy lub systemowy', icon: Palette, render: () => <AppearanceCard /> },
  'dividend-sync': { title: 'Dane dywidend', hint: 'Automatyczne daty i kwoty z Yahoo / historii wypłat', icon: CloudDownload, render: () => <DividendSyncCard /> },
  'company-profiles': { title: 'Profile spółek', hint: 'Opis, profil i notatki – kontekst dla Analityka wyników', icon: FileText, render: () => <CompanyProfilesCard /> },
  fire: { title: 'Cele FIRE', hint: 'Rok, majątek i dochód docelowy', icon: Target, render: () => <FireGoalsCard /> },
  tax: { title: 'Podatki', hint: 'Parametry kalkulatora ulgi IKZE', icon: Scale, render: () => <TaxSection /> },
  'news-filter': { title: 'Filtr newsów', hint: 'Ukrywanie promocji i ofert sklepów, własne słowa do ukrycia', icon: Filter, render: () => <NewsFilterCard /> },
  prices: { title: 'Notowania', hint: 'Źródła cen i odświeżanie', icon: Radio, render: () => <PricesSection /> },
  cloud: { title: 'Konto i synchronizacja w chmurze', hint: 'Logowanie i zapis w Supabase', icon: Cloud, render: () => <CloudCard /> },
  notifications: { title: 'Powiadomienia', hint: 'Zadania, zmiany notowań, raport, Web Push', icon: Bell, render: () => <NotificationsView /> },
  inflation: { title: 'Inflacja CPI (GUS)', hint: 'Odczyty miesięczne, korekty, benchmark', icon: LineChart, render: () => <InflationCard /> },
  backup: { title: 'Kopia zapasowa danych', hint: 'Eksport i wczytanie pliku JSON', icon: Database, render: () => <BackupCard /> },
};
// Kategorie z podkategoriami (sections: [{ label, items }]) – od najczęściej używanych
const GROUPS = [
  {
    id: 'assets',
    emoji: '💼',
    title: 'Majątek i konta',
    subtitle: 'Konta, wpłaty, limity IKE / IKZE, inne aktywa',
    sections: [
      { label: 'Konta', items: ['accounts', 'cash', 'limits'] },
      { label: 'Inne aktywa', items: ['other-assets', 'julka'] },
    ],
  },
  {
    id: 'budget',
    emoji: '🧾',
    title: 'Budżet i zakupy',
    subtitle: 'Budżet, paragony, listy zakupów i zadań',
    sections: [{ label: 'Opcje', items: ['budget-options', 'receipts', 'lists'] }],
  },
  {
    id: 'invest',
    emoji: '📈',
    title: 'Inwestowanie',
    subtitle: 'Cele FIRE, podatki, notowania, dywidendy, spółki, newsy',
    sections: [
      { label: 'Cele i podatki', items: ['fire', 'tax'] },
      { label: 'Dane rynkowe', items: ['prices', 'dividend-sync', 'inflation'] },
      { label: 'Spółki i wiadomości', items: ['company-profiles', 'news-filter'] },
    ],
  },
  {
    id: 'smart',
    emoji: '🔔',
    title: 'Powiadomienia i AI',
    subtitle: 'Powiadomienia w telefonie, funkcje AI',
    sections: [{ label: '', items: ['notifications', 'ai'] }],
  },
  {
    id: 'app',
    emoji: '⚙️',
    title: 'Aplikacja i dane',
    subtitle: 'Wygląd, moduły w menu, konto w chmurze, kopia zapasowa',
    sections: [
      { label: 'Wygląd', items: ['appearance', 'modules'] },
      { label: 'Konto i dane', items: ['cloud', 'backup'] },
    ],
  },
];
GROUPS.forEach((g) => {
  g.items = g.sections.flatMap((x) => x.items);
});
const groupOf = (sectionId) => GROUPS.find((g) => g.items.includes(sectionId))?.id || null;

const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
const backCls = 'inline-flex h-9 items-center gap-1.5 rounded-lg pr-3 pl-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5';

// Nawigacja: #/settings – kafelki kategorii · #/settings/<kategoria> – podkategorie z sekcjami · #/settings/<sekcja>
// – sekcja (powrót do jej kategorii)
export default function SettingsView({ param, onNavigate }) {
  const go = (to) => onNavigate?.(to ? `settings/${to}` : 'settings');
  const section = SECTIONS[param];
  if (section) {
    const group = GROUP_BY_ID[groupOf(param)];
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => go(group?.id)} className={backCls}>
          <ChevronLeft size={18} /> {group ? group.title : 'Konta i ustawienia'}
        </button>
        {section.render()}
      </div>
    );
  }
  const group = GROUP_BY_ID[param];
  if (group) return <SettingsCategory group={group} onBack={() => go(null)} onOpen={go} />;
  return <SettingsHome onOpen={go} />;
}

// Strona główna: klikane kafelki kategorii
function SettingsHome({ onOpen }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {GROUPS.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onOpen(g.id)}
          aria-label={g.title}
          className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-stone-50 active:bg-stone-100 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-white/[0.03] dark:active:bg-white/[0.06]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xl dark:bg-white/5" aria-hidden="true">
            {g.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{g.title}</span>
            <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{g.subtitle}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-stone-400 dark:text-stone-500" />
        </button>
      ))}
    </div>
  );
}

// Strona kategorii: podkategorie (nagłówki) z kafelkami sekcji
function SettingsCategory({ group, onBack, onOpen }) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className={backCls}>
        <ChevronLeft size={18} /> Konta i ustawienia
      </button>
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-lg dark:bg-white/5" aria-hidden="true">
          {group.emoji}
        </span>
        <h2 className="text-lg font-semibold">{group.title}</h2>
      </div>
      {group.sections.map((sec) => (
        <section key={sec.label || group.id} aria-label={sec.label || group.title} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm sm:p-2 dark:border-white/10 dark:bg-neutral-900">
          {sec.label && group.sections.length > 1 && <div className="px-3 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-stone-400 uppercase dark:text-stone-500">{sec.label}</div>}
          {sec.items.map((id) => {
            const it = SECTIONS[id];
            const Icon = it.icon;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onOpen(id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/[0.04] dark:active:bg-white/[0.07]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{it.title}</span>
                  <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{it.hint}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-stone-400 dark:text-stone-500" />
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function AccountsSection() {
  const { state, actions } = useApp();
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const investAccounts = state.accounts.filter((a) => INVEST_ACCOUNT_TYPES.includes(a.type));
  const counts = (id) => ({
    flows: state.cashflows.filter((c) => c.accountId === id).length,
    trades: state.trades.filter((c) => c.accountId === id).length,
  });

  return (
    <Card
      title="Konta inwestycyjne"
      subtitle="IKE / IKZE – 0% podatku Belki · Maklerskie – 19%"
      icon={Wallet}
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setForm({ name: '', type: 'BROKERAGE', institution: '', currency: 'PLN', openedAt: todayISO(), interestRate: 0, capitalization: 'MONTHLY' })}>
          Dodaj konto
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <XtbIkeToggle />
      <ul className="divide-y divide-stone-100 dark:divide-white/5">
        {investAccounts.length === 0 && <li className="px-5 py-6 text-center text-sm text-stone-500">Brak kont inwestycyjnych.</li>}
        {investAccounts.map((a) => {
          const t = ACCOUNT_TYPES[a.type];
          const c = counts(a.id);
          return (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: t?.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  <Badge>{t?.label}</Badge>
                  <BelkaBadge account={a} />
                  {accountFxPct(a) > 0 && <Badge tone="violet">przewalutowanie {String(accountFxPct(a)).replace('.', ',')}%</Badge>}
                </div>
                <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                  {a.institution || '—'} · {c.flows} wpłat/wypłat · {c.trades} transakcji
                </div>
              </div>
              <IconButton icon={Pencil} label="Edytuj konto" onClick={() => setForm({ ...a })} />
              <IconButton icon={Trash2} label="Usuń konto" onClick={() => setToDelete(a)} className="hover:text-red-600" />
            </li>
          );
        })}
      </ul>
      <DeferredBelkaPanel />
      <p className="flex items-start gap-2 border-t border-stone-100 px-4 py-3 text-xs text-stone-500 sm:px-5 dark:border-white/5 dark:text-stone-400">
        <Landmark size={14} className="mt-0.5 shrink-0" />
        Obligacje skarbowe i konta oszczędnościowe to wbudowane instrumenty poduszki finansowej (osobna kategoria, nigdy w IKE/IKZE) – dodajesz je w zakładce „Poduszka finansowa”.
      </p>

      <AccountFormModal form={form} setForm={setForm} types={INVEST_ACCOUNT_TYPES} />
      <DeleteAccountModal account={toDelete} onClose={() => setToDelete(null)} />
    </Card>
  );
}


// Podatek Belki odroczony – instytucja nie pobiera podatku (np. Revolut), 19% rozliczasz sam w PIT-38.
// Dotyczy kont opodatkowanych: maklerskich i konta oszczędnościowego (IKE/IKZE – Belka 0%).
function DeferredBelkaPanel() {
  const { state, actions } = useApp();
  const eligible = state.accounts.filter((a) => a.type === 'BROKERAGE' || a.type === 'SAVINGS');
  if (eligible.length === 0) return null;
  return (
    <div className="border-t border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
      <div className="text-sm font-medium">Podatek Belki odroczony (np. Revolut)</div>
      <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
        Włącz dla konta, na którym instytucja nie pobiera podatku – dochody liczone brutto, a 19% rozliczasz samodzielnie w PIT-38.
      </p>
      <div className="space-y-2">
        {eligible.map((a) => (
          <Toggle
            key={a.id}
            checked={!!a.belkaDeferred}
            onChange={(v) => actions.upsert('accounts', { ...a, belkaDeferred: v })}
            label={a.name}
            description={`${ACCOUNT_TYPES[a.type]?.label}${a.belkaDeferred ? ' · podatek rozliczany w PIT' : ' · podatek pobierany automatycznie'}`}
          />
        ))}
      </div>
    </div>
  );
}

// Szybkie ustawienie: zakupy na IKE w XTB rozliczane w PLN z prowizją 0,05% za przewalutowanie
function XtbIkeToggle() {
  const { state, actions } = useApp();
  const ike = state.accounts.filter((a) => a.type === 'IKE');
  if (ike.length === 0) return null;
  const on = ike.every((a) => accountFxPct(a) === XTB_FX_FEE_PCT);
  const set = (v) => {
    for (const a of ike) actions.upsert('accounts', { ...a, fxConversionPct: v ? XTB_FX_FEE_PCT : 0 });
    actions.notify(v ? 'IKE: zakupy w PLN z przewalutowaniem 0,05% wliczanym w koszt' : 'IKE: wyłączono prowizję za przewalutowanie', 'info');
  };
  return (
    <div className="border-b border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
      <Toggle
        checked={on}
        onChange={set}
        label="IKE w XTB: zakupy w złotówkach (przewalutowanie 0,05%)"
        description="Zagraniczne ETF-y (USD/EUR) kupowane i sprzedawane z rachunku PLN – prowizja 0,05% doliczana przy zakupie (baza kosztowa) i potrącana przy sprzedaży. Domyślnie włączone; wartość dla każdego konta można zmienić w jego edycji."
      />
    </div>
  );
}

function TaxSection() {
  const { state, actions } = useApp();
  const s = state.settings;

  return (
    <Card title="Podatki" subtitle="Parametry kalkulatora ulgi IKZE · limity wpłat znajdziesz w „Limity wpłat IKE / IKZE”" icon={Scale}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Próg podatkowy (IKZE)">
          <Select value={s.taxBracket} onChange={(e) => actions.updateSettings({ taxBracket: e.target.value })}>
            {Object.values(TAX_BRACKETS).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Roczny dochód do opodatkowania" hint="Używany przy opcji „wylicz z dochodu”">
          <Input type="number" min="0" value={s.annualIncome || ''} onChange={(e) => actions.updateSettings({ annualIncome: Number(e.target.value) || 0 })} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle
            checked={!!s.selfEmployed}
            onChange={(v) => actions.updateSettings({ selfEmployed: v })}
            label="Prowadzę działalność gospodarczą"
            description="Wyższy limit IKZE (1,8× przeciętnego wynagrodzenia)"
          />
        </div>
      </div>
    </Card>
  );
}

function PricesSection() {
  const { state, actions } = useApp();
  const s = state.settings;
  return (
    <Card title="Notowania" subtitle="Źródła cen i częstotliwość odświeżania" icon={Radio}>
      <div className="space-y-3">
        <Field label="Tryb notowań">
          <Select value={s.priceMode} onChange={(e) => actions.updateSettings({ priceMode: e.target.value })}>
            <option value="auto">Na żywo (Yahoo + NBP), bez sieci – ostatnie dane i ceny z transakcji</option>
            <option value="mock">Tylko dane symulowane (offline)</option>
          </Select>
        </Field>
        <Field
          label="Własne proxy CORS (opcjonalnie)"
          hint="Kolejność pobierania: serwer aplikacji (/api/yahoo – funkcja Vercel lub serwer deweloperski) → to proxy → publiczne proxy (corsproxy.io, allorigins, codetabs). Prefiks URL lub szablon z {url}. Puste = tylko trasy wbudowane."
        >
          <Input value={s.corsProxy || ''} onChange={(e) => actions.updateSettings({ corsProxy: e.target.value })} placeholder="np. https://moje-proxy.example.com/?url=" />
        </Field>
        <Toggle
          checked={s.refreshOnEnter !== false}
          onChange={(v) => actions.updateSettings({ refreshOnEnter: v })}
          label="Odświeżaj notowania przy wejściu do aplikacji"
          description="Tylko w godzinach sesji GPW (pn–pt 9:00–16:50, czas polski) i najwyżej co 5 minut. W tle aplikacja niczego nie pobiera; poza sesją – ostatnie kursy (ręcznie: „Odśwież kursy”)."
        />
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Ostatnia aktualizacja: {formatDateTime(state.prices.lastRefresh)} · {state.prices.fx?.source}
        </p>
      </div>
    </Card>
  );
}

function OtherAssetsSection() {
  const { state, actions } = useApp();
  const [form, setForm] = useState(null);
  return (
    <Card
      title="Nieruchomości i inne aktywa"
      subtitle="Nieruchomości i ruchomości – zawsze wliczane do Majątku Całkowitego (wartość − zobowiązania)"
      icon={Building2}
      actions={
        <Button icon={Plus} onClick={() => setForm({ name: '', category: 'REAL_ESTATE', value: '', liabilities: '', showInPortfolio: true, note: '' })}>
          Dodaj aktywo
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <div className="border-b border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
        <Toggle
          checked={state.settings.includeOtherAssets !== false}
          onChange={(v) => actions.updateSettings({ includeOtherAssets: v })}
          label="Pokazuj nieruchomości i ruchomości w zakładce Portfel"
          description="Do Majątku Całkowitego wliczają się zawsze. Przełącznik przy pozycji decyduje o jej widoczności w Portfelu."
        />
      </div>
      <ul className="divide-y divide-stone-100 dark:divide-white/5">
        {state.otherAssets.length === 0 && <li className="px-5 py-6 text-center text-sm text-stone-500">Brak pozycji.</li>}
        {state.otherAssets.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Landmark size={18} className="shrink-0 text-stone-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{a.name}</span>
                <Badge>{OTHER_ASSET_CATEGORIES[a.category]}</Badge>
              </div>
              <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                Wartość {formatPLN(Number(a.value))}
                {Number(a.liabilities) > 0 && ` · zobowiązania ${formatPLN(Number(a.liabilities))}`} · netto {formatPLN((Number(a.value) || 0) - (Number(a.liabilities) || 0))}
              </div>
            </div>
            <span title="Widoczność w zakładce Portfel">
              <Toggle checked={a.showInPortfolio !== false} onChange={(v) => actions.upsert('otherAssets', { ...a, showInPortfolio: v })} />
            </span>
            <IconButton icon={Pencil} label="Edytuj" onClick={() => setForm({ ...a })} />
            <IconButton icon={Trash2} label="Usuń" onClick={() => actions.remove('otherAssets', a.id)} className="hover:text-red-600" />
          </li>
        ))}
      </ul>
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edytuj aktywo' : 'Nowe aktywo'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Anuluj</Button>
            <Button
              variant="primary"
              disabled={!form?.name?.trim() || !(Number(form?.value) >= 0)}
              onClick={() => {
                actions.upsert('otherAssets', { ...form, name: form.name.trim(), value: Number(form.value) || 0, liabilities: Number(form.liabilities) || 0 });
                setForm(null);
              }}
            >
              Zapisz
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nazwa" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Kategoria">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(OTHER_ASSET_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Wartość rynkowa (PLN)">
              <Input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
            <Field label="Zobowiązania, np. kredyt (PLN)">
              <Input type="number" min="0" value={form.liabilities} onChange={(e) => setForm({ ...form, liabilities: e.target.value })} />
            </Field>
            <Field label="Notatka">
              <Input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Toggle
                checked={form.showInPortfolio !== false}
                onChange={(v) => setForm({ ...form, showInPortfolio: v })}
                label="Pokaż w zakładce Portfel"
                description="Do Majątku Całkowitego wliczane zawsze"
              />
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
