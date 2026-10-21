import { useState } from 'react';
import { Building2, Landmark, Pencil, Plus, Radio, Scale, Trash2, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LIST, CAPITALIZATION, OTHER_ASSET_CATEGORIES, SAVINGS_BANKS, TAX_BRACKETS, XTB_FX_FEE_PCT } from '../lib/constants.js';
import { belkaRateForAccount } from '../lib/tax.js';
import { accountFxPct } from '../lib/engine.js';
import { formatDateTime, formatPLN, todayISO } from '../lib/format.js';
import { Badge, Button, Card, Field, IconButton, Input, Modal, Select, Toggle } from '../components/ui.jsx';
import LimitsCard from '../components/settings/LimitsCard.jsx';
import BackupCard from '../components/settings/BackupCard.jsx';

export default function SettingsView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <AccountsSection />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <TaxSection />
        <PricesSection />
      </div>
      <LimitsCard />
      <OtherAssetsSection />
      <BackupCard />
    </div>
  );
}

function AccountsSection() {
  const { state, actions } = useApp();
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const counts = (id) => ({
    flows: state.cashflows.filter((c) => c.accountId === id).length,
    trades: state.trades.filter((c) => c.accountId === id).length,
    bonds: state.bonds.filter((c) => c.accountId === id).length,
  });

  return (
    <Card
      title="Konta i wrappery podatkowe"
      subtitle="IKE / IKZE – 0% podatku Belki · Maklerskie, Obligacje skarbowe i Oszczędnościowe – 19%"
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
        {state.accounts.length === 0 && <li className="px-5 py-6 text-center text-sm text-stone-500">Brak kont.</li>}
        {state.accounts.map((a) => {
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
                  {a.institution || '—'} · {c.flows} wpłat/wypłat · {c.trades} transakcji{c.bonds ? ` · ${c.bonds} obligacji` : ''}
                  {a.type === 'SAVINGS' && ` · ${a.interestRate || 0}% (${CAPITALIZATION[a.capitalization]?.label?.toLowerCase() || '—'} kapitalizacja)`}
                </div>
              </div>
              <IconButton icon={Pencil} label="Edytuj konto" onClick={() => setForm({ ...a })} />
              <IconButton icon={Trash2} label="Usuń konto" onClick={() => setToDelete(a)} className="hover:text-red-600" />
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edytuj konto' : 'Nowe konto'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Anuluj</Button>
            <Button
              variant="primary"
              disabled={!form?.name?.trim()}
              onClick={() => {
                const fx = form.fxConversionPct;
                const item = {
                  ...form,
                  name: form.name.trim(),
                  interestRate: Number(form.interestRate) || 0,
                  fxConversionPct: fx === '' || fx === undefined || fx === null ? undefined : Number(fx) || 0,
                };
                actions.upsert('accounts', item);
                actions.notify('Zapisano konto', 'success');
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
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. IKE – XTB" autoFocus />
            </Field>
            <Field label="Typ konta" hint={ACCOUNT_TYPES[form.type]?.fullName}>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {ACCOUNT_TYPE_LIST.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            {form.type === 'SAVINGS' ? (
              <BankField form={form} setForm={setForm} />
            ) : (
              <Field label="Instytucja">
                <Input value={form.institution || ''} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder={form.type === 'BONDS' ? 'np. PKO BP, Pekao' : 'np. XTB, mBank'} />
              </Field>
            )}
            <Field label="Data otwarcia">
              <Input type="date" value={form.openedAt || ''} onChange={(e) => setForm({ ...form, openedAt: e.target.value })} />
            </Field>
            {form.type !== 'SAVINGS' && form.type !== 'BONDS' && (
              <Field
                label="Przewalutowanie przy kupnie i sprzedaży (%)"
                hint={`Konto w PLN, a instrument w USD/EUR – prowizja doliczana przy zakupie i potrącana przy sprzedaży. Puste = domyślnie ${String(accountFxPct({ ...form, fxConversionPct: undefined })).replace('.', ',')}% (XTB/IKE: ${String(XTB_FX_FEE_PCT).replace('.', ',')}%)`}
                className="sm:col-span-2"
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  value={form.fxConversionPct ?? ''}
                  placeholder={String(accountFxPct({ ...form, fxConversionPct: undefined }))}
                  onChange={(e) => setForm({ ...form, fxConversionPct: e.target.value })}
                />
              </Field>
            )}
            {ACCOUNT_TYPES[form.type]?.belkaRate > 0 && (
              <div className="space-y-3 sm:col-span-2">
                <Toggle
                  checked={form.belkaEnabled !== false}
                  onChange={(v) => setForm({ ...form, belkaEnabled: v })}
                  label="Wliczaj podatek Belki (19%)"
                  description="Odsetki i zyski pokazywane netto. Wyłącz, aby liczyć je brutto."
                />
                {form.type === 'SAVINGS' && (
                  <Toggle
                    checked={!!form.belkaDeferred}
                    onChange={(v) => setForm({ ...form, belkaDeferred: v })}
                    label="Podatek Belki odroczony (rozliczenie samodzielne w PIT)"
                    description="Bank nie pobiera podatku – odsetki trafiają na konto brutto, a 19% rozliczasz w zeznaniu rocznym (PIT-38)."
                  />
                )}
              </div>
            )}
            {form.type === 'SAVINGS' && (
              <>
                <Field label="Oprocentowanie (% w skali roku)">
                  <Input type="number" step="0.01" value={form.interestRate ?? ''} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
                </Field>
                <Field label="Kapitalizacja">
                  <Select value={form.capitalization || 'MONTHLY'} onChange={(e) => setForm({ ...form, capitalization: e.target.value })}>
                    {Object.values(CAPITALIZATION).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć konto?"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Anuluj</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                actions.deleteAccount(toDelete.id);
                actions.notify('Usunięto konto wraz z historią', 'info');
                setToDelete(null);
              }}
            >
              Usuń konto i historię
            </Button>
          </>
        }
      >
        {toDelete && (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Konto „{toDelete.name}” zostanie usunięte razem z powiązanymi wpłatami, transakcjami, dywidendami i obligacjami. Rozważ wcześniejszy eksport danych.
          </p>
        )}
      </Modal>
    </Card>
  );
}

function BelkaBadge({ account }) {
  const t = ACCOUNT_TYPES[account.type];
  if (t?.belkaRate === 0) return <Badge tone="green">Belka 0%</Badge>;
  if (account.belkaDeferred) return <Badge tone="violet">Belka odroczona (PIT)</Badge>;
  if (account.belkaEnabled === false) return <Badge>bez Belki (brutto)</Badge>;
  return <Badge tone="amber">Belka {Math.round(belkaRateForAccount(account) * 100)}%</Badge>;
}

// Bank konta oszczędnościowego – Revolut automatycznie oznacza podatek jako odroczony (rozliczany w PIT)
function BankField({ form, setForm }) {
  const known = SAVINGS_BANKS.find((b) => b.id === form.institution);
  const value = known ? known.id : form.institution ? 'Inny' : '';
  return (
    <Field label="Bank" hint={known?.belkaDeferred ? 'Revolut nie pobiera podatku Belki – rozliczasz go sam w PIT' : undefined}>
      <Select
        value={value}
        onChange={(e) => {
          const bank = SAVINGS_BANKS.find((b) => b.id === e.target.value);
          setForm({ ...form, institution: e.target.value, belkaDeferred: !!bank?.belkaDeferred });
        }}
      >
        <option value="" disabled>
          Wybierz bank…
        </option>
        {SAVINGS_BANKS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </Select>
    </Field>
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
            <option value="auto">Na żywo (Yahoo + NBP) z fallbackiem do symulacji</option>
            <option value="mock">Tylko dane symulowane (offline)</option>
          </Select>
        </Field>
        <Field
          label="Proxy CORS dla Yahoo Finance"
          hint="Yahoo blokuje bezpośrednie zapytania z przeglądarki. W trybie deweloperskim działa wbudowane proxy Vite (/api/yahoo). Prefiks URL lub szablon z {url}. Puste = wyłączone."
        >
          <Input value={s.corsProxy || ''} onChange={(e) => actions.updateSettings({ corsProxy: e.target.value })} placeholder="https://corsproxy.io/?url=" />
        </Field>
        <Field label="Automatyczne odświeżanie">
          <Select value={s.autoRefreshMinutes || 0} onChange={(e) => actions.updateSettings({ autoRefreshMinutes: Number(e.target.value) })}>
            <option value={0}>Wyłączone</option>
            <option value={5}>Co 5 minut</option>
            <option value={15}>Co 15 minut</option>
            <option value={60}>Co godzinę</option>
          </Select>
        </Field>
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
      subtitle="Opcjonalnie wliczane do Majątku Całkowitego (wartość − zobowiązania)"
      icon={Building2}
      actions={
        <Button icon={Plus} onClick={() => setForm({ name: '', category: 'REAL_ESTATE', value: '', liabilities: '', includeInNetWorth: true, note: '' })}>
          Dodaj aktywo
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <div className="border-b border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
        <Toggle
          checked={!!state.settings.includeOtherAssets}
          onChange={(v) => actions.updateSettings({ includeOtherAssets: v })}
          label="Uwzględniaj tę kategorię w Majątku Całkowitym"
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
            <Toggle checked={!!a.includeInNetWorth} onChange={(v) => actions.upsert('otherAssets', { ...a, includeInNetWorth: v })} />
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
              <Toggle checked={!!form.includeInNetWorth} onChange={(v) => setForm({ ...form, includeInNetWorth: v })} label="Wliczaj do majątku" />
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
