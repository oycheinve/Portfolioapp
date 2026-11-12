import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { readBlocked, readFilterOn, writeBlocked, writeFilterOn } from '../../lib/newsFilter.js';
import { Card, Toggle } from '../ui.jsx';

// Ustawienia → Filtr newsów: ukrywanie szumu konsumenckiego (promocje, sklepy, kolekcje, oferty pracy) i własne
// słowa do ukrycia; zapis per użytkownik (urządzenie + chmura). W Newsach – tylko linijka „Ukryto N · Pokaż”.
export default function NewsFilterCard() {
  const [on, setOn] = useState(readFilterOn);
  const [words, setWords] = useState(readBlocked);
  const [draft, setDraft] = useState('');
  const save = (list) => {
    setWords(list);
    writeBlocked(list);
  };
  const add = (e) => {
    e.preventDefault();
    const w = draft.trim().slice(0, 40);
    if (w && !words.some((x) => x.toLowerCase() === w.toLowerCase())) save([...words, w]);
    setDraft('');
  };
  return (
    <Card title="Filtr newsów" subtitle="Ukrywanie artykułów niezwiązanych z inwestowaniem" icon={Filter}>
      <Toggle
        checked={on}
        onChange={(v) => {
          setOn(v);
          writeFilterOn(v);
        }}
        label="Ukrywaj promocje, oferty sklepów, kolekcje i oferty pracy"
        description="Tytuły ze słowami inwestycyjnymi (wyniki, zysk, akcje, dywidenda, prognoza, rekomendacja…) zostają zawsze. Ukryte artykuły można podejrzeć w Newsach („Pokaż”). Dotyczy też powiadomień o nowych artykułach."
      />
      <div className={`mt-4 border-t border-stone-100 pt-3 dark:border-white/5 ${on ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="text-sm font-medium">Własne słowa do ukrycia</div>
        <p className="text-[11px] text-stone-500 dark:text-stone-400">Artykuł z takim słowem w tytule jest ukrywany zawsze (wystarczy początek słowa, np. „paliw”).</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {words.map((w) => (
            <span key={w} className="inline-flex h-7 items-center gap-1 rounded-full border border-stone-200 pr-1 pl-2.5 text-xs text-stone-700 dark:border-white/10 dark:text-stone-200">
              {w}
              <button type="button" onClick={() => save(words.filter((x) => x !== w))} aria-label={`Usuń słowo ${w}`} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-stone-400 hover:text-red-600">
                <X size={12} />
              </button>
            </span>
          ))}
          <form onSubmit={add}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} placeholder="+ dodaj słowo" aria-label="Własne słowo do ukrycia" className="h-7 w-36 rounded-full border border-dashed border-stone-300 bg-transparent px-2.5 text-xs outline-none focus:border-blue-500 dark:border-white/15" />
          </form>
        </div>
      </div>
    </Card>
  );
}
