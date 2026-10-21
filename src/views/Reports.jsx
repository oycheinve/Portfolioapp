import { useState } from 'react';
import { Segmented } from '../components/ui.jsx';
import XReportGenerator from '../components/reports/XReportGenerator.jsx';
import Summaries from '../components/reports/Summaries.jsx';

const TAB_KEY = 'wealth-app-reports-tab';

function readTab() {
  try {
    return localStorage.getItem(TAB_KEY) || 'x';
  } catch {
    return 'x';
  }
}

export default function ReportsView() {
  const [tab, setTab] = useState(readTab);
  const change = (t) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // brak localStorage – zakładka nie zostanie zapamiętana
    }
  };
  return (
    <div className="space-y-4 sm:space-y-6">
      <Segmented
        value={tab}
        onChange={change}
        ariaLabel="Sekcja raportów"
        options={[
          { value: 'x', label: 'Raport na X' },
          { value: 'summaries', label: 'Podsumowania miesięczne i roczne' },
        ]}
      />
      {tab === 'x' ? <XReportGenerator /> : <Summaries />}
    </div>
  );
}
