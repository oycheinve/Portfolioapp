import { useState } from 'react';
import { Building2, Landmark, Pencil, Plus, Radio, Scale, Trash2, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ACCOUNT_TYPES, OTHER_ASSET_CATEGORIES, TAX_BRACKETS, XTB_FX_FEE_PCT } from '../lib/constants.js';
import { accountFxPct } from '../lib/engine.js';
import { formatDateTime, formatPLN, todayISO } from '../lib/format.js';
import { Badge, Button, Card, Field, IconButton, Input, Modal, Select, Toggle } from '../components/ui.jsx';
import LimitsCard from '../components/settings/LimitsCard.jsx';
import BackupCard from '../components/settings/BackupCard.jsx';
import FireGoalsCard from '../components/settings/FireGoalsCard.jsx';
import { AccountFormModal, BelkaBadge, DeleteAccountModal, INVEST_ACCOUNT_TYPES } from '../components/settings/AccountForm.jsx';

export default function SettingsView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <BackupCard />
      <AccountsSection />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <TaxSection />
        <PricesSection />
      </div>
      <LimitsCard />
      <FireGoalsCard />
      <OtherAssetsSection />
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
    <Card title="Podatki" subtitle="Parametry kalkulatora ulgi IKZE · limity wpłat znajdziesz w karcie poniżej" icon={Scale}>
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
