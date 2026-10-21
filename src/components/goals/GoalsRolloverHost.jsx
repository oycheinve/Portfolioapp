import { useState } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { yearNeedingReview } from '../../lib/goalsRollover.js';
import YearReviewModal from './YearReviewModal.jsx';

const LATER_KEY = 'wealth-app-goals-review-later';

function laterYear() {
  try {
    return Number(sessionStorage.getItem(LATER_KEY)) || null;
  } catch {
    return null;
  }
}

// Ekran powitalny po Nowym Roku: przy pierwszym uruchomieniu w nowym roku pokazuje podsumowanie
// poprzedniego roku i kreator przenoszenia celów („Przypomnij później” ukrywa go do końca sesji).
export default function GoalsRolloverHost({ onNavigate }) {
  const { state } = useApp();
  const [later, setLater] = useState(laterYear);
  const year = yearNeedingReview(state);
  if (!year || later === year) return null;

  const remindLater = () => {
    try {
      sessionStorage.setItem(LATER_KEY, String(year));
    } catch {
      // brak sessionStorage – przypomnienie wróci przy następnym renderze
    }
    setLater(year);
  };

  return (
    <YearReviewModal
      year={year}
      onLater={remindLater}
      onClose={(toYear) => {
        if (toYear) onNavigate('goals');
        else remindLater();
      }}
    />
  );
}
