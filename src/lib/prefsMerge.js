// Scalanie ustawień-list przy synchronizacji z chmurą (ui_prefs): zamiast „ostatni zapis wygrywa” dla całej wartości –
// suma wpisów z urządzenia i chmury. Dotyczy list, które rosną na różnych urządzeniach i nie mogą znikać:
//  • analizy wyników (`wealth-app-earnings-v1`, tablica { key, at, … }) – wpis o tym samym kluczu: nowszy `at` wygrywa;
//    usunięte świadomie (✕) – zapamiętane w `wealth-app-earnings-deleted-v1` i nie wracają;
//  • historia spółek (`wealth-app-earnings-history-v1`) – spółki i okresy z obu stron (okres z obu: nowszy `at` wygrywa).
export const EARNINGS_KEY = 'wealth-app-earnings-v1';
export const EARNINGS_DELETED_KEY = 'wealth-app-earnings-deleted-v1';
export const EARNINGS_HISTORY_KEY = 'wealth-app-earnings-history-v1';

const parse = (s, d) => {
  try {
    const v = JSON.parse(s);
    return v ?? d;
  } catch {
    return d;
  }
};
const time = (t) => new Date(t || 0).getTime() || 0;

function mergeEarnings(localStr, remoteStr, deleted = {}) {
  const local = parse(localStr, []);
  const remote = parse(remoteStr, []);
  if (!Array.isArray(local) || !Array.isArray(remote)) return remoteStr;
  const byKey = new Map();
  for (const e of [...remote, ...local]) {
    if (!e?.key) continue;
    const prev = byKey.get(e.key);
    if (!prev || time(e.at) >= time(prev.at)) byKey.set(e.key, e);
  }
  const out = [...byKey.values()].filter((e) => !(deleted[e.key] && time(deleted[e.key]) >= time(e.at)));
  return JSON.stringify(out.sort((a, b) => String(b.at).localeCompare(String(a.at))));
}

function mergeHistory(localStr, remoteStr) {
  const local = parse(localStr, null);
  const remote = parse(remoteStr, null);
  if (!local || typeof local !== 'object') return remoteStr;
  if (!remote || typeof remote !== 'object') return localStr;
  const out = { ...remote };
  for (const [k, c] of Object.entries(local)) {
    const r = remote[k];
    if (!r) {
      out[k] = c;
      continue;
    }
    const periods = { ...(r.periods || {}) };
    for (const [q, p] of Object.entries(c.periods || {})) if (!periods[q] || time(p.at) >= time(periods[q].at)) periods[q] = p;
    out[k] = { ...r, ...c, periods };
  }
  return JSON.stringify(out);
}

// Wartość do zapisania na urządzeniu dla klucza z chmury (remoteStr); localStr – obecna wartość na urządzeniu
export function mergePref(key, localStr, remoteStr, allRemote = {}) {
  if (localStr === null || localStr === undefined || localStr === remoteStr) return remoteStr;
  try {
    if (key === EARNINGS_KEY) {
      const deleted = { ...parse(allRemote[EARNINGS_DELETED_KEY] || 'null', {}), ...parse(localStorage.getItem(EARNINGS_DELETED_KEY) || 'null', {}) };
      return mergeEarnings(localStr, remoteStr, deleted || {});
    }
    if (key === EARNINGS_DELETED_KEY) return JSON.stringify({ ...parse(remoteStr, {}), ...parse(localStr, {}) });
    if (key === EARNINGS_HISTORY_KEY) return mergeHistory(localStr, remoteStr);
  } catch {
    // przy błędzie – jak dotąd (wartość z chmury)
  }
  return remoteStr;
}
