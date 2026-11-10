import { Layers, LayoutGrid, ScanLine } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { TOGGLEABLE_MODULES, navLabel } from '../Layout.jsx';
import { BetaBadge, Card, Toggle } from '../ui.jsx';

// Personalizacja: widoczność modułów w menu (zapis w ustawieniach użytkownika – Supabase przez user_id i localStorage)
// oraz tryb weryfikacji paragonów (podgląd i potwierdzenie albo zapis automatyczny w tle)
export default function ModulesCard() {
  const { state, actions } = useApp();
  const modules = state.settings.modules || {};
  const setModule = (id, on) => actions.updateSettings({ modules: { ...modules, [id]: on } });
  const receiptReview = state.settings.receiptReview !== false;
  const hidden = TOGGLEABLE_MODULES.filter((n) => modules[n.id] === false).length;
  return (
    <div className="space-y-4">
      <Card title="Widoczne moduły" subtitle={hidden ? `Ukryte: ${hidden} – nadal dostępne z adresu, dane nie są usuwane` : 'Wszystkie moduły widoczne w menu'} icon={LayoutGrid}>
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Widoczność modułów">
          {TOGGLEABLE_MODULES.map((n) => {
            const Icon = n.icon;
            return (
              <Toggle
                key={n.id}
                checked={modules[n.id] !== false}
                onChange={(v) => setModule(n.id, v)}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Icon size={15} className="text-stone-400" /> {navLabel(n, state.settings)}
                    {n.beta && <BetaBadge />}
                  </span>
                }
              />
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">Pulpit i Ustawienia są zawsze widoczne. Ukrycie modułu nie usuwa jego danych – po ponownym włączeniu wszystko wraca.</p>
      </Card>
      <Card title="Porządkowanie list" subtitle="Zakupy i Zadania" icon={Layers}>
        <Toggle
          checked={state.settings.groupByCategory !== false}
          onChange={(v) => actions.updateSettings({ groupByCategory: v })}
          label="Grupuj elementy według kategorii (AI i pamięć)"
          description={state.settings.groupByCategory !== false ? 'Produkty w Zakupach i zadania w Zadaniach są dzielone na sekcje kategorii; nowe pozycje rozpoznaje pamięć i AI.' : 'Wyłączone – zwykłe listy bez sekcji (kategorie i pamięć zostają zapisane).'}
        />
      </Card>
      <Card title={<>Skanowanie paragonów<BetaBadge /></>} subtitle="Podgląd przed zapisem" icon={ScanLine}>
        <Toggle
          checked={receiptReview}
          onChange={(v) => actions.updateSettings({ receiptReview: v })}
          label="Wymagaj potwierdzenia i podglądu po zeskanowaniu paragonu"
          description={receiptReview ? 'Po odczycie otwiera się ekran weryfikacji: sklep, data, pozycje, ceny i kategorie do poprawy przed zapisem.' : 'Paragon zapisuje się automatycznie w tle (wydatek w budżecie i historia paragonów) – korekty możliwe później.'}
        />
        <div className="mt-4 border-t border-stone-100 pt-4 dark:border-white/5">
          <Toggle
            checked={state.settings.receiptSplit === true}
            onChange={(v) => actions.updateSettings({ receiptSplit: v })}
            label="Włącz opcję dzielenia pozycji z paragonu na pół (np. ze współlokatorem/partnerem)"
            description={
              state.settings.receiptSplit === true
                ? `Na ekranie weryfikacji przy każdej pozycji (i dla całego paragonu) pojawi się „Podziel na pół (50/50)” – do budżetu i statystyk trafi połowa kwoty.${receiptReview ? '' : ' Wymaga włączonego podglądu paragonu powyżej.'}`
                : 'Wyłączone – cała kwota paragonu trafia do budżetu.'
            }
          />
        </div>
      </Card>
    </div>
  );
}
