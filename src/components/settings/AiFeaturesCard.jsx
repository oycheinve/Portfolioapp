import { Sparkles } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { AI_FEATURES, aiAllOn, aiOn } from '../../lib/aiFeatures.js';
import { Card, Toggle } from '../ui.jsx';

// Ustawienia → Funkcje AI: główny przełącznik i osobny dla każdej funkcji (ukrycie + brak zapytań do AI)
export default function AiFeaturesCard() {
  const { state, actions } = useApp();
  const ai = state.settings.ai || {};
  const set = (patch) => actions.updateSettings({ ai: { ...ai, ...patch } });
  const all = aiAllOn(state.settings);
  const off = AI_FEATURES.filter((f) => !aiOn(state.settings, f.id)).length;
  return (
    <Card title="Funkcje AI" subtitle={!all ? 'Wszystkie funkcje AI wyłączone' : off ? `Wyłączone: ${off} z ${AI_FEATURES.length}` : 'Wszystkie funkcje AI włączone'} icon={Sparkles}>
      <Toggle checked={all} onChange={(v) => set({ all: v })} label="Funkcje AI w aplikacji" description={all ? 'Poniżej możesz wyłączyć pojedyncze funkcje.' : 'Wyłączone – aplikacja nie wysyła żadnych zapytań do AI, a funkcje AI są ukryte.'} />
      <div className={`mt-4 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-2 dark:border-white/5 ${all ? '' : 'pointer-events-none opacity-50'}`} role="group" aria-label="Pojedyncze funkcje AI">
        {AI_FEATURES.map((f) => (
          <Toggle key={f.id} checked={ai[f.id] !== false} onChange={(v) => set({ [f.id]: v })} label={f.label} description={f.desc} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">Wyłączenie nie usuwa danych (analiz, paragonów, podsumowań, kategorii) – po ponownym włączeniu wszystko wraca.</p>
    </Card>
  );
}
