import { CalendarDays, CalendarRange } from 'lucide-react';
import Summaries from '../components/reports/Summaries.jsx';
import { Accordion } from '../components/ui.jsx';

// Sekcje analityczne pod wykresami (zakładka Wykresy): tylko podsumowanie roku z miesiącami i lata kalendarzowe,
// liczone dla portfela inwestycyjnego (bez poduszki finansowej)
const FILTER = 'INVEST';

export default function StatsSummaries() {
  const items = [
    { id: 'year', title: 'Podsumowanie roku i miesiące', subtitle: 'Wynik roku kalendarzowego, najlepszy i najsłabszy miesiąc, tabela miesięcy', icon: CalendarDays, render: () => <Summaries parts={['year', 'months']} filter={FILTER} /> },
    { id: 'years', title: 'Lata kalendarzowe', subtitle: '1 stycznia – 31 grudnia każdego roku', icon: CalendarRange, render: () => <Summaries parts={['years']} filter={FILTER} /> },
  ];
  return (
    <div id="podsumowania">
      <Accordion items={items} storageKey="wealth-app-charts-summaries-open" defaultOpen={['year']} />
    </div>
  );
}
