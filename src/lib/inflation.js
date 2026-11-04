// Inflacja CPI w Polsce – czyste funkcje wspólne dla serwera (/api/inflation-sync, /api/inflation) i aplikacji:
// parsowanie danych GUS (CSV „Miesięczne wskaźniki cen towarów i usług konsumpcyjnych”), zapasowo Eurostat HICP,
// scalanie z tabelą wbudowaną i ręcznymi korektami z Ustawień.
// Wiersz: { year, month, yoy, mom, source } – yoy: zmiana r/r w %, mom: zmiana m/m w % (np. 4.9 = +4,9%).

export const monthKeyOf = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/["']/g, '')
    .trim();

function splitCsv(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// CSV GUS: kolumny m.in. „Sposób prezentacji”, „Rok”, „Miesiąc” (numer lub nazwa), „Wartość” (indeks, poprzedni
// okres = 100). Wiersze „Analogiczny miesiąc poprzedniego roku = 100” → r/r, „Poprzedni miesiąc = 100” → m/m.
// Rozpoznawanie kolumn po nazwach nagłówka (kolejność i dodatkowe kolumny bez znaczenia).
export function parseGusCsv(text) {
  const lines = String(text || '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = splitCsv(lines[0], sep).map(norm);
  const col = (re) => head.findIndex((h) => re.test(h));
  const cWay = col(/sposob prezentacji|prezentacj/);
  const cYear = col(/^rok$|^rok\b/);
  const cMonth = col(/^miesiac|okres/);
  const cValue = col(/^wartosc|^value/);
  const cArea = col(/jednostka terytorialna|terytor/);
  const cName = col(/nazwa zmiennej|zmienna|grupa|pozycja/);
  if (cYear < 0 || cMonth < 0 || cValue < 0) return [];
  const rows = new Map();
  for (const line of lines.slice(1)) {
    const c = splitCsv(line, sep);
    if (cArea >= 0 && c[cArea] && !/polska/i.test(c[cArea])) continue;
    if (cName >= 0 && c[cName] && !/ogolem|wskaznik cen towarow i uslug konsumpcyjnych$|^towary i uslugi konsumpcyjne/.test(norm(c[cName]))) continue;
    const way = cWay >= 0 ? norm(c[cWay]) : 'analogiczny';
    const kind = /analogiczn.*poprzedniego roku|rok poprzedni|r\/r/.test(way) ? 'yoy' : /poprzedni miesiac|okres poprzedni|m\/m/.test(way) ? 'mom' : null;
    if (!kind) continue;
    const year = Number(c[cYear]);
    const mRaw = norm(c[cMonth]);
    const month = /^\d{1,2}$/.test(mRaw) ? Number(mRaw) : MONTHS_PL.findIndex((m) => norm(m) === mRaw) + 1;
    const v = num(c[cValue]);
    if (!(year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && v !== null && v > 50 && v < 200)) continue;
    const key = monthKeyOf(year, month);
    const row = rows.get(key) || { year, month, yoy: null, mom: null, source: 'GUS' };
    row[kind] = Math.round((v - 100) * 100) / 100;
    rows.set(key, row);
  }
  return [...rows.values()].filter((r) => r.yoy !== null || r.mom !== null).sort((a, b) => a.year - b.year || a.month - b.month);
}

// Eurostat (JSON-stat 2.0, zbiory prc_hicp_manr – r/r i prc_hicp_mmor – m/m dla geo=PL, coicop=CP00) – zapas,
// gdy plik GUS jest niedostępny; HICP różni się nieznacznie od CPI GUS (oznaczane w źródle)
export function parseEurostat(json, kind) {
  const idx = json?.dimension?.time?.category?.index;
  if (!idx || !json.value) return [];
  const out = [];
  for (const [period, pos] of Object.entries(idx)) {
    const m = period.match(/^(\d{4})-?M?(\d{2})$/); // „2025-09” albo „2025M09”
    const v = Array.isArray(json.value) ? json.value[pos] : json.value[String(pos)];
    if (!m || !Number.isFinite(v)) continue;
    out.push({ year: Number(m[1]), month: Number(m[2]), [kind]: v, source: 'Eurostat HICP' });
  }
  return out;
}

// Połączenie list wierszy: wcześniejsza lista ma pierwszeństwo, późniejsze uzupełniają tylko brakujące pola
export function mergeRows(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const r of list || []) {
      const key = monthKeyOf(r.year, r.month);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { year: r.year, month: r.month, yoy: r.yoy ?? null, mom: r.mom ?? null, source: r.source });
        continue;
      }
      if (prev.yoy === null && r.yoy !== undefined && r.yoy !== null) prev.yoy = r.yoy;
      if (prev.mom === null && r.mom !== undefined && r.mom !== null) prev.mom = r.mom;
    }
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

// Tabela CPI używana w aplikacji: { 'RRRR-MM': { value: r/r %, mom: m/m % | null, estimate, manual, source } }
// Kolejność ważności: wbudowane odczyty → dane z bazy (GUS, inflation_rates) → ręczne korekty z Ustawień.
export function buildCpiTable(builtin = {}, fetched = {}, overrides = {}, momOverrides = {}) {
  const table = {};
  for (const [k, v] of Object.entries(builtin)) table[k] = { value: v.value, mom: null, estimate: !!v.estimate, manual: false, source: 'wbudowane' };
  for (const [k, v] of Object.entries(fetched || {})) {
    if (!Number.isFinite(v?.yoy) && !Number.isFinite(v?.mom)) continue;
    const prev = table[k];
    table[k] = {
      value: Number.isFinite(v.yoy) ? v.yoy : prev?.value ?? null,
      mom: Number.isFinite(v.mom) ? v.mom : null,
      estimate: !Number.isFinite(v.yoy) && !!prev?.estimate,
      manual: false,
      source: v.source || 'GUS',
    };
  }
  const isNum = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
  for (const [k, v] of Object.entries(overrides || {})) {
    if (isNum(v)) table[k] = { ...(table[k] || { mom: null }), value: Number(v), estimate: false, manual: true, source: 'ręcznie' };
  }
  for (const [k, v] of Object.entries(momOverrides || {})) {
    if (isNum(v)) table[k] = { ...(table[k] || { value: null, estimate: false }), mom: Number(v), manualMom: true, source: table[k]?.manual ? 'ręcznie' : `${table[k]?.source || ''} · m/m ręcznie`.replace(/^ · /, '') };
  }
  for (const k of Object.keys(table)) if (table[k].value === null && table[k].mom === null) delete table[k];
  return table;
}

// Indeks cen (poziom 1 na początku pierwszego miesiąca tabeli): miesięczny łańcuch z odczytów m/m, a gdy ich brak –
// przybliżenie z r/r ((1 + r/r)^(1/12)). Zwraca funkcję (RRRR-MM-DD) → poziom; wewnątrz miesiąca liniowo w dniach,
// po ostatnim odczycie – kontynuacja ostatniej dynamiki miesięcznej.
export function cpiIndexFn(table) {
  const keys = Object.keys(table)
    .filter((k) => Number.isFinite(table[k].mom) || Number.isFinite(table[k].value))
    .sort();
  if (!keys.length) return () => 1;
  const factor = (k) => (Number.isFinite(table[k].mom) ? 1 + table[k].mom / 100 : Math.pow(1 + table[k].value / 100, 1 / 12));
  const index = {};
  let level = 1;
  for (const k of keys) {
    index[k] = level;
    level *= factor(k);
  }
  const lastKey = keys[keys.length - 1];
  // Kontynuacja: średnia dynamika miesięczna z r/r ostatniego odczytu (m/m bywa sezonowe), inaczej ostatnie m/m
  const lastMonthly = Number.isFinite(table[lastKey].value) ? Math.pow(1 + table[lastKey].value / 100, 1 / 12) : factor(lastKey);
  const lastLevel = level;
  return (iso) => {
    const key = iso.slice(0, 7);
    const day = Number(iso.slice(8, 10)) || 1;
    const frac = (day - 1) / 30;
    if (index[key] !== undefined) {
      const next = keys[keys.indexOf(key) + 1];
      const nextLevel = next ? index[next] : lastLevel;
      return index[key] * Math.pow(nextLevel / index[key], frac);
    }
    if (key < keys[0]) return 1;
    const [y, m] = key.split('-').map(Number);
    const [ly, lm] = lastKey.split('-').map(Number);
    const months = (y - ly) * 12 + (m - lm) - 1 + frac;
    return lastLevel * Math.pow(lastMonthly, Math.max(0, months));
  };
}

// Wiersze z bazy / API → mapa 'RRRR-MM' → { yoy, mom, source }
export function rowsToMap(rows) {
  const out = {};
  for (const r of rows || []) {
    const yoy = r.yoy === null || r.yoy === undefined ? null : Number(r.yoy);
    const mom = r.mom === null || r.mom === undefined ? null : Number(r.mom);
    if (!Number.isFinite(yoy) && !Number.isFinite(mom)) continue;
    out[monthKeyOf(r.year, r.month)] = { yoy: Number.isFinite(yoy) ? yoy : null, mom: Number.isFinite(mom) ? mom : null, source: r.source || 'GUS' };
  }
  return out;
}
