// Formularz konta (Ustawienia: konta inwestycyjne; Poduszka finansowa: konta oszczędnościowe) i usuwanie konta
import { Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ACCOUNT_TYPES, CAPITALIZATION, SAVINGS_BANKS, XTB_FX_FEE_PCT } from '../../lib/constants.js';
import { belkaRateForAccount } from '../../lib/tax.js';
import { accountFxPct } from '../../lib/engine.js';
import { Badge, Button, Field, Input, Modal, Select, Toggle } from '../ui.jsx';

// Konta tworzone przez użytkownika. Obligacje skarbowe i konta oszczędnościowe są wbudowane w Poduszkę finansową.
export const INVEST_ACCOUNT_TYPES = ['IKE', 'IKZE', 'BROKERAGE'];

export function AccountFormModal({ form, setForm, types = INVEST_ACCOUNT_TYPES }) {
  const { actions } = useApp();
  return (
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
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={types.length === 1}>
              {types.map((id) => ACCOUNT_TYPES[id]).map((t) => (
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
          {form.type !== 'SAVINGS' && (
            <div className="sm:col-span-2">
              <Toggle
                checked={!!form.allowNegativeCash}
                onChange={(v) => setForm({ ...form, allowNegativeCash: v })}
                label="Konto debetowe (dopuszczaj ujemne saldo gotówki)"
                description="Domyślnie wyłączone: zakup ponad dostępne środki dopisuje automatyczną wpłatę „Uzupełnienie środków”, więc gotówka nigdy nie jest ujemna."
              />
            </div>
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
  );
}

export function DeleteAccountModal({ account, onClose }) {
  const { actions } = useApp();
  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title="Usunąć konto?"
      footer={
        <>
          <Button onClick={onClose}>Anuluj</Button>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => {
              actions.deleteAccount(account.id);
              actions.notify('Usunięto konto wraz z historią', 'info');
              onClose();
            }}
          >
            Usuń konto i historię
          </Button>
        </>
      }
    >
      {account && (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Konto „{account.name}” zostanie usunięte razem z powiązanymi wpłatami, transakcjami, dywidendami i obligacjami. Rozważ wcześniejszy eksport danych.
        </p>
      )}
    </Modal>
  );
}

export function BelkaBadge({ account }) {
  const t = ACCOUNT_TYPES[account.type];
  if (t?.belkaRate === 0) return <Badge tone="green">Belka 0%</Badge>;
  if (account.belkaDeferred) return <Badge tone="violet">Belka odroczona (PIT)</Badge>;
  if (account.belkaEnabled === false) return <Badge>bez Belki (brutto)</Badge>;
  return <Badge tone="amber">Belka {Math.round(belkaRateForAccount(account) * 100)}%</Badge>;
}

// Bank konta oszczędnościowego – Revolut automatycznie oznacza podatek jako odroczony (rozliczany w PIT)
export function BankField({ form, setForm }) {
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
