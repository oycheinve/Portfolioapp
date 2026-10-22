// Import z XTB. Plik .xlsx z arkuszem „Open Positions” → import wyłącznie otwartych pozycji (każda transza osobno).
// Bez tego arkusza (np. CSV) → historia operacji gotówkowych („Cash Operations” / „Historia operacji gotówkowych”).
// Rozpoznaje wpłaty, wypłaty, zakupy i sprzedaże akcji/ETF, dywidendy, odsetki oraz podatki (dopinane do dywidend/odsetek).
// Identyfikatory wpisów oparte na ID operacji XTB (bez kolumny ID – na treści operacji), a operacje już obecne w danych
// (także wpisane ręcznie lub z innego arkusza) rozpoznawane po treści – ponowny / zaktualizowany import nie tworzy duplikatów.

import { dedupeImport } from './importDedupe.js';

const HEADER_ALIASES = {
  id: ['id'],
  type: ['type', 'typ', 'rodzaj'],
  time: ['time', 'czas', 'data', 'date', 'data operacji'],
  comment: ['comment', 'komentarz', 'opis'],
  symbol: ['ticker', 'symbol', 'instrument'],
  amount: ['amount', 'kwota', 'wartość', 'wartosc'],
  name: ['instrument', 'nazwa instrumentu', 'nazwa'],
};

// Znane ETF-y (symbol bez sufiksu giełdy) – pozostałe instrumenty traktowane jako akcje (można zmienić przed importem)
const KNOWN_ETF = new Set([
  'IUSQ', 'SXRV', 'VWCE', 'VWRA', 'VWRL', 'IWDA', 'EUNL', 'SXR8', 'CSPX', 'VUAA', 'VUSA', 'EIMI', 'IS3N', 'SPPW', 'XDWD', 'CNDX', 'EQQQ', 'SXRT',
  'ISAC', 'IUSN', 'ZPRV', 'ZPRX', 'SPYW', 'VHYL', 'IBCF', 'CBU0', 'EXSA', 'XDEW', 'SPYD', 'EXS1', 'IQQH', 'VGWL', 'SWDA', 'IMAE', 'EMIM', 'SPXS',
  'QDVE', 'IUIT', 'XAIX', 'SEMI', 'ECAR', 'INRG', 'IGLN', 'SGLN', 'PHAU', '4GLD', 'VEUR', 'MEUD', 'XDAX', 'DBXD', 'LYPS', 'LCUW', 'ACWI', 'SSAC',
]);

const EXCHANGES = {
  PL: { currency: 'PLN', yahoo: (b) => `${b}.WA` },
  DE: { currency: 'EUR', yahoo: (b) => `${b}.DE` },
  NL: { currency: 'EUR', yahoo: (b) => `${b}.AS` },
  FR: { currency: 'EUR', yahoo: (b) => `${b}.PA` },
  IT: { currency: 'EUR', yahoo: (b) => `${b}.MI` },
  ES: { currency: 'EUR', yahoo: (b) => `${b}.MC` },
  BE: { currency: 'EUR', yahoo: (b) => `${b}.BR` },
  PT: { currency: 'EUR', yahoo: (b) => `${b}.LS` },
  FI: { currency: 'EUR', yahoo: (b) => `${b}.HE` },
  IE: { currency: 'EUR', yahoo: (b) => `${b}.IR` },
  US: { currency: 'USD', yahoo: (b) => b },
  // ETF-y UCITS z Londynu w XTB notowane zwykle w USD (CSPX, VWRA, EIMI) – walutę można zmienić w podglądzie
  UK: { currency: 'USD', yahoo: (b) => `${b}.L` },
  CH: { currency: 'CHF', yahoo: (b) => `${b}.SW` },
};

function norm(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

// Liczby w formacie XTB: „1 234,56”, „-1234.56”, „0,4146”, liczba z Excela
export function parseNumber(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '')
    .replace(/[\s ]/g, '')
    .replace(/[^\d,.\-−]/g, '')
    .replace('−', '-');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return Number(s);
}

// Godzina operacji (HH:MM:SS) z tej samej komórki co data – do rozpoznawania duplikatów przy ponownym imporcie
export function parseTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const secs = Math.round((v - Math.floor(v)) * 86400) % 86400;
    if (!secs) return null;
    return [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60].map((n) => String(n).padStart(2, '0')).join(':');
  }
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v ?? ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3] || '00'}` : null;
}

// Stabilny identyfikator operacji bez kolumny ID: z treści (data, czas, typ, kwota, symbol, komentarz) zamiast
// numeru wiersza – w zaktualizowanym pliku wiersze się przesuwają, a ta sama operacja dostaje ten sam identyfikator
function contentId(parts) {
  const str = parts.join('|');
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Daty: „17.01.2025 10:23:45”, „2025-01-17 10:23:45”, „01/17/2025”, numer seryjny Excela
export function parseDate(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) {
    const sep = s[m[1].length];
    // Format z kropkami (PL/EU): dd.mm.rrrr; z ukośnikami: mm/dd/rrrr (eksport anglojęzyczny)
    const [day, month] = sep === '.' ? [m[1], m[2]] : [m[2], m[1]];
    return `${m[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i += 1) {
    const cells = rows[i].map(norm);
    const col = {};
    // Priorytet aliasów wg kolejności (np. „Ticker” przed „Instrument”)
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      for (const alias of aliases) {
        const idx = cells.indexOf(alias);
        if (idx >= 0) {
          col[key] = idx;
          break;
        }
      }
    }
    if (col.type !== undefined && col.amount !== undefined && col.time !== undefined) return { index: i, col };
  }
  return null;
}

// Rodzaj operacji z kolumny „Type” (EN/PL) i komentarza
export const KIND_LABELS = {
  DEPOSIT: { label: 'Wpłata', tone: 'green' },
  WITHDRAWAL: { label: 'Wypłata', tone: 'red' },
  BUY: { label: 'Kupno', tone: 'blue' },
  SELL: { label: 'Sprzedaż', tone: 'amber' },
  DIVIDEND: { label: 'Dywidenda', tone: 'green' },
  INTEREST: { label: 'Odsetki', tone: 'green' },
  TAX: { label: 'Podatek', tone: 'violet' },
  INTEREST_TAX: { label: 'Podatek od odsetek', tone: 'violet' },
  FEE: { label: 'Prowizja', tone: 'neutral' },
  UNKNOWN: { label: 'Nierozpoznane', tone: 'neutral' },
};

export function classifyOperation(type, comment, amount) {
  const t = norm(type);
  const c = String(comment || '').toUpperCase();
  if (/withholding|podatek|tax/.test(t)) return /interest|odset/.test(t) ? 'INTEREST_TAX' : 'TAX';
  if (/divid|dywid/.test(t)) return 'DIVIDEND';
  if (/interest|odset/.test(t)) return 'INTEREST';
  if (/purchase|zakup|kupno/.test(t) || /^OPEN BUY/.test(c)) return 'BUY';
  if (/sale|sell|sprzeda/.test(t) || (/close/.test(t) && /CLOSE BUY/.test(c)) || /^CLOSE BUY/.test(c)) return 'SELL';
  if (/withdraw|wypłat|wyplat/.test(t)) return 'WITHDRAWAL';
  if (/deposit|wpłat|wplat/.test(t)) return 'DEPOSIT';
  if (/transfer|przelew/.test(t)) return amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL';
  if (/commission|prowizj|fee|opłat|oplat/.test(t)) return 'FEE';
  return 'UNKNOWN';
}

// „OPEN BUY 2/3 @ 66.88” → ilość 2, cena 66,88
export function parseTradeComment(comment) {
  // Formaty: „OPEN BUY 10 @ 66.88”, „OPEN BUY 2/3 @ 66.88”, „OPEN BUY LPP.PL 0.0011 @ 25200.00”, „CLOSE BUY KRU.PL 0.1393/1 @ 382.70”
  const m = /(?:OPEN|CLOSE)\s+(?:BUY|SELL)\s+(?:[A-Z0-9_-]+\.[A-Z]{2}\s+)?([\d.,]+)(?:\/[\d.,]+)?\s*@\s*([\d.,\s]+)/i.exec(String(comment || ''));
  if (!m) return null;
  const quantity = parseNumber(m[1]);
  const price = parseNumber(m[2]);
  return Number.isFinite(quantity) && Number.isFinite(price) && quantity > 0 && price > 0 ? { quantity, price } : null;
}

// „KTY.PL PLN 16.32/ SHR” → { dps: 16.32, currency: 'PLN' }
export function parseDividendRate(comment) {
  const m = /\b([A-Z]{3})\s+([\d.,]+)\s*\/\s*SHR/i.exec(String(comment || ''));
  if (!m) return null;
  const dps = parseNumber(m[2]);
  return dps > 0 ? { dps, currency: m[1].toUpperCase() } : null;
}

export function describeSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase();
  const [base, suffix] = raw.includes('.') ? [raw.slice(0, raw.lastIndexOf('.')), raw.slice(raw.lastIndexOf('.') + 1)] : [raw, 'PL'];
  const ex = EXCHANGES[suffix] || EXCHANGES.PL;
  const kind = KNOWN_ETF.has(base) || /^ETF/.test(base) ? 'ETF' : 'STOCK';
  return { symbol: raw, ticker: base, currency: ex.currency, yahooSymbol: ex.yahoo(base), kind };
}

// Dopasowanie symbolu XTB do istniejącego instrumentu (po symbolu Yahoo lub tickerze)
export function matchInstrument(state, info) {
  return (
    state.instruments.find((i) => (i.yahooSymbol || '').toUpperCase() === info.yahooSymbol.toUpperCase()) ||
    state.instruments.find((i) => (i.ticker || '').toUpperCase() === info.ticker && (i.currency || 'PLN') === info.currency) ||
    null
  );
}

// Analiza arkuszy → plan importu (bez zapisu do stanu)
export function analyzeXtb(sheets, { state, accountId }) {
  let found = null;
  for (const sheet of sheets) {
    const header = findHeader(sheet.rows);
    if (header) {
      found = { sheet, header };
      break;
    }
  }
  if (!found) {
    throw new Error('Nie znaleziono tabeli operacji gotówkowych (kolumny Type/Typ, Time/Czas, Amount/Kwota). Wyeksportuj z XTB „Historię operacji gotówkowych”.');
  }
  const { sheet, header } = found;
  const { col } = header;
  const ops = [];
  const seen = {};
  for (let r = header.index + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    const type = row[col.type];
    const amount = parseNumber(row[col.amount]);
    const date = parseDate(row[col.time]);
    if (!type || !Number.isFinite(amount) || !date) continue;
    const time = parseTime(row[col.time]);
    const comment = col.comment !== undefined ? String(row[col.comment] ?? '') : '';
    // Symbol z kolumny albo z komentarza (np. „XTB.PL PLN WHT 19%” przy podatku bez symbolu)
    const symbol = (col.symbol !== undefined ? String(row[col.symbol] ?? '').trim() : '') || (/^([A-Z0-9]+\.[A-Z]{2})\b/.exec(comment.trim()) || [])[1] || '';
    let xtbId = col.id !== undefined && row[col.id] !== '' && row[col.id] !== undefined ? String(row[col.id]).trim() : '';
    if (!xtbId) {
      // Bez kolumny ID: identyfikator z treści (+ numer kolejny identycznych operacji w pliku)
      const base = `c${contentId([date, time || '', String(type).trim(), Math.round(amount * 100), symbol.toUpperCase(), comment.trim()])}`;
      seen[base] = (seen[base] || 0) + 1;
      xtbId = seen[base] > 1 ? `${base}_${seen[base]}` : base;
    }
    const name = col.name !== undefined && col.name !== col.symbol ? String(row[col.name] ?? '').trim() : '';
    ops.push({ row: r + 1, xtbId, type: String(type), kind: classifyOperation(type, comment, amount), date, time, amount, comment, symbol, name });
  }

  const symbols = {};
  for (const o of ops) {
    if (!o.symbol || !['BUY', 'SELL', 'DIVIDEND', 'TAX', 'FEE'].includes(o.kind)) continue;
    if (!symbols[o.symbol.toUpperCase()]) {
      const info = describeSymbol(o.symbol);
      const existing = matchInstrument(state, info);
      symbols[info.symbol] = { ...info, name: o.name || info.ticker, instrumentId: existing?.id || null, existingLabel: existing ? `${existing.ticker} · ${existing.name}` : null };
    }
  }

  return { sheetName: sheet.name, ops, symbols, accountId };
}

// Plan → wpisy do kolekcji (cashflows, trades, income) i nowe instrumenty.
// mapping: { [symbol]: { instrumentId | null, kind, currency, ticker, yahooSymbol, name } }
export function buildXtbImport(analysis, mapping, { state, account, fxPct = 0 }) {
  const accountId = account.id;
  const prefix = `xtb_${accountId}_`;
  const newInstruments = [];
  const instIdFor = {};
  for (const [sym, m] of Object.entries(mapping)) {
    if (m.instrumentId) {
      instIdFor[sym] = m.instrumentId;
      continue;
    }
    const id = `inst_xtb_${m.ticker.toLowerCase().replace(/[^a-z0-9]/g, '')}_${m.currency.toLowerCase()}`;
    instIdFor[sym] = id;
    if (!state.instruments.some((i) => i.id === id)) {
      newInstruments.push({ id, ticker: m.ticker, yahooSymbol: m.yahooSymbol, name: m.name || m.ticker, kind: m.kind, currency: m.currency, ter: 0, sector: '' });
    }
  }
  const instById = Object.fromEntries([...state.instruments, ...newInstruments].map((i) => [i.id, i]));

  const cashflows = [];
  const trades = [];
  const income = [];
  const skipped = [];
  const taxes = [];
  const fees = [];
  for (const o of analysis.ops) {
    const id = `${prefix}${o.xtbId}`;
    const sym = o.symbol.toUpperCase();
    if (o.kind === 'DEPOSIT' || o.kind === 'WITHDRAWAL') {
      cashflows.push({ id, accountId, date: o.date, ...(o.time ? { time: o.time } : {}), type: o.amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL', amount: Math.round(Math.abs(o.amount) * 100) / 100, note: `XTB: ${o.type}${o.comment ? ` – ${o.comment}` : ''}`, source: 'XTB' });
    } else if (o.kind === 'BUY' || o.kind === 'SELL') {
      const parsed = parseTradeComment(o.comment);
      const instrumentId = instIdFor[sym];
      if (!parsed || !instrumentId) {
        skipped.push({ ...o, reason: !instrumentId ? 'brak symbolu instrumentu' : 'nie odczytano ilości i ceny z komentarza' });
        continue;
      }
      const inst = instById[instrumentId];
      const ccy = inst?.currency || 'PLN';
      const cash = Math.abs(o.amount);
      const gross = parsed.quantity * parsed.price;
      let fxRate = 1;
      let fee = 0;
      if (ccy === 'PLN') fee = Math.max(0, Math.round((o.kind === 'BUY' ? cash - gross : gross - cash) * 100) / 100);
      // Kwota z XTB zawiera już przewalutowanie – kurs wyliczamy tak, by koszt w aplikacji (z prowizją FX) był równy kwocie z wyciągu
      else fxRate = o.kind === 'BUY' ? cash / (gross * (1 + fxPct / 100)) : cash / (gross * (1 - fxPct / 100));
      trades.push({
        id,
        accountId,
        instrumentId,
        date: o.date,
        ...(o.time ? { time: o.time } : {}),
        side: o.kind,
        quantity: parsed.quantity,
        price: parsed.price,
        currency: ccy,
        fxRate: Math.round(fxRate * 1e6) / 1e6,
        fee: fee > 0.01 ? fee : 0,
        note: `XTB: ${o.comment}`,
        source: 'XTB',
      });
    } else if (o.kind === 'DIVIDEND') {
      // Stawka na akcję z komentarza XTB („DIG.PL PLN 5.0/ SHR”) – podstawa DPS, gdy nie da się odtworzyć liczby sztuk
      const rate = parseDividendRate(o.comment);
      income.push({
        id,
        accountId,
        instrumentId: instIdFor[sym] || null,
        date: o.date,
        ...(o.time ? { time: o.time } : {}),
        type: 'DIVIDEND',
        gross: Math.round(o.amount * 100) / 100,
        foreignTax: 0,
        ...(rate ? { dps: rate.dps, dpsCurrency: rate.currency } : {}),
        note: `XTB: ${o.comment || o.type}`,
        source: 'XTB',
      });
    } else if (o.kind === 'INTEREST') {
      income.push({ id, accountId, date: o.date, ...(o.time ? { time: o.time } : {}), type: 'INTEREST', gross: Math.round(o.amount * 100) / 100, foreignTax: 0, note: `XTB: ${o.type}`, source: 'XTB' });
    } else if (o.kind === 'TAX' || o.kind === 'INTEREST_TAX') {
      taxes.push(o);
    } else if (o.kind === 'FEE' && sym) {
      fees.push(o);
    } else {
      skipped.push({ ...o, reason: o.kind === 'FEE' ? 'opłata bez powiązanej transakcji' : 'nieznany typ operacji' });
    }
  }

  // Podatki: dopięcie do dywidendy tego samego instrumentu (±5 dni) albo do odsetek z tego samego dnia
  const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
  for (const t of taxes) {
    const sym = t.symbol.toUpperCase();
    const target =
      t.kind === 'TAX' && sym
        ? income.filter((i) => i.type === 'DIVIDEND' && i.instrumentId === instIdFor[sym] && dayDiff(i.date, t.date) <= 5).sort((a, b) => dayDiff(a.date, t.date) - dayDiff(b.date, t.date))[0]
        : income.filter((i) => i.type === 'INTEREST' && dayDiff(i.date, t.date) <= 5)[0];
    if (target) target.foreignTax = Math.round((target.foreignTax + Math.abs(t.amount)) * 100) / 100;
    else skipped.push({ ...t, reason: 'podatek bez dopasowanej dywidendy/odsetek' });
  }

  // Prowizje: dopięcie do transakcji tego samego instrumentu z tego samego dnia
  for (const f of fees) {
    const target = trades.find((t) => t.instrumentId === instIdFor[f.symbol.toUpperCase()] && t.date === f.date);
    if (target) target.fee = Math.round(((Number(target.fee) || 0) + Math.abs(f.amount)) * 100) / 100;
    else skipped.push({ ...f, reason: 'prowizja bez transakcji z tego dnia' });
  }

  // Operacje już obecne w danych (ten sam identyfikator z poprzedniego importu albo ta sama treść – np. wpis ręczny
  // lub import innego arkusza) są pomijane: zaktualizowany plik dodaje wyłącznie nowe operacje
  const opts = { extraInstruments: newInstruments };
  const dd = { cashflows: dedupeImport(state, 'cashflows', cashflows, opts), trades: dedupeImport(state, 'trades', trades, opts), income: dedupeImport(state, 'income', income, opts) };
  const fresh = { cashflows: dd.cashflows.fresh, trades: dd.trades.fresh, income: dd.income.fresh };
  const contentDuplicates = [...dd.cashflows.byContent, ...dd.trades.byContent, ...dd.income.byContent];
  return {
    newInstruments,
    allIncome: income,
    allCashflows: cashflows,
    ...fresh,
    duplicates: cashflows.length + trades.length + income.length - fresh.cashflows.length - fresh.trades.length - fresh.income.length,
    contentDuplicates,
    incomeContentMatches: dd.income.byContent,
    skipped,
  };
}

// ---------------------------------------------------------------------------------------------
// Otwarte pozycje („Open Positions”): wiersz zbiorczy instrumentu + wiersze transz (ID pozycji, BUY, wolumen,
// wartość w PLN, cena bieżąca, cena otwarcia, data otwarcia, zysk netto w PLN).

const OPEN_ALIASES = {
  product: ['product', 'produkt'],
  position: ['instrument/position', 'instrument/pozycja', 'instrument', 'pozycja'],
  ticker: ['ticker', 'symbol'],
  category: ['category', 'kategoria'],
  type: ['type', 'typ'],
  volume: ['volume', 'wolumen', 'liczba'],
  value: ['value', 'wartość', 'wartosc'],
  currentPrice: ['current price', 'cena bieżąca', 'cena biezaca', 'aktualna cena'],
  openPrice: ['open price', 'cena otwarcia'],
  openTime: ['open time (utc)', 'open time', 'czas otwarcia (utc)', 'czas otwarcia', 'data otwarcia'],
  profit: ['net profit', 'zysk netto', 'profit', 'zysk'],
};

function findOpenHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i += 1) {
    const cells = rows[i].map(norm);
    const col = {};
    for (const [key, aliases] of Object.entries(OPEN_ALIASES)) {
      for (const alias of aliases) {
        const idx = cells.indexOf(alias);
        if (idx >= 0) {
          col[key] = idx;
          break;
        }
      }
    }
    if (col.ticker !== undefined && col.volume !== undefined && col.openPrice !== undefined && col.value !== undefined) return { index: i, col };
  }
  return null;
}

// Arkusz otwartych pozycji (po nazwie albo po nagłówku z kolumnami Volume / Open price / Value)
export function findOpenPositionsSheet(sheets) {
  const named = sheets.filter((s) => /open\s*position|otwarte\s*pozycje/i.test(s.name));
  for (const sheet of [...named, ...sheets.filter((s) => !named.includes(s))]) {
    const header = findOpenHeader(sheet.rows);
    if (header && (named.includes(sheet) || sheets.length === 1)) return { sheet, header };
  }
  return null;
}

// Waluta notowań z relacji wartość PLN / (wolumen × cena bieżąca) – najbliższy kurs z tabeli NBP/aplikacji
function inferCurrency(ticker, valuePLN, volume, currentPrice, fxRates) {
  const fallback = describeSymbol(ticker).currency;
  if (/\.PL$/i.test(ticker)) return 'PLN';
  const local = volume * currentPrice;
  if (!(local > 0) || !(valuePLN > 0)) return fallback;
  const ratio = valuePLN / local;
  const candidates = Object.entries({ PLN: 1, ...fxRates }).filter(([, r]) => Number(r) > 0);
  let best = fallback;
  let bestErr = Infinity;
  for (const [ccy, rate] of candidates) {
    const err = Math.abs(Math.log(ratio / Number(rate)));
    if (err < bestErr) {
      bestErr = err;
      best = ccy;
    }
  }
  return bestErr < 0.15 ? best : fallback;
}

export function analyzeXtbOpenPositions(sheets, { state }) {
  const found = findOpenPositionsSheet(sheets);
  if (!found) throw new Error('W pliku nie ma arkusza „Open Positions” (Otwarte pozycje) z kolumnami Ticker, Volume, Value i Open price.');
  const { sheet, header } = found;
  const { col } = header;
  const fxRates = state.prices?.fx?.rates || {};
  const groups = [];
  let current = null;
  const cell = (row, key) => (col[key] === undefined ? '' : row[col[key]]);
  for (let r = header.index + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    const ticker = String(cell(row, 'ticker') ?? '').trim().toUpperCase();
    if (!ticker) continue;
    const type = norm(cell(row, 'type'));
    const volume = parseNumber(cell(row, 'volume'));
    const value = parseNumber(cell(row, 'value'));
    if (!type) {
      // Wiersz zbiorczy instrumentu: nazwa w kolumnie Instrument/Position, kategoria STOCK/ETF
      current = {
        ticker,
        name: String(cell(row, 'position') ?? '').trim() || ticker,
        category: String(cell(row, 'category') ?? '').trim().toUpperCase(),
        volume: Number.isFinite(volume) ? volume : 0,
        value: Number.isFinite(value) ? value : 0,
        profit: parseNumber(cell(row, 'profit')) || 0,
        lots: [],
      };
      groups.push(current);
      continue;
    }
    if (type !== 'buy' && type !== 'kupno') continue;
    if (!current || current.ticker !== ticker) {
      current = { ticker, name: ticker, category: '', volume: 0, value: 0, profit: 0, lots: [], synthetic: true };
      groups.push(current);
    }
    const lot = {
      positionId: String(cell(row, 'position') ?? '').trim() || `${ticker}_${r}`,
      quantity: volume,
      value,
      currentPrice: parseNumber(cell(row, 'currentPrice')),
      openPrice: parseNumber(cell(row, 'openPrice')),
      date: parseDate(cell(row, 'openTime')),
      profit: parseNumber(cell(row, 'profit')) || 0,
      row: r + 1,
    };
    if (!(lot.quantity > 0) || !(lot.openPrice >= 0) || !lot.date) continue;
    current.lots.push(lot);
  }
  const valid = groups.filter((g) => g.lots.length > 0);
  for (const g of valid) {
    if (g.synthetic) {
      g.volume = g.lots.reduce((s, l) => s + l.quantity, 0);
      g.value = g.lots.reduce((s, l) => s + (l.value || 0), 0);
      g.profit = g.lots.reduce((s, l) => s + l.profit, 0);
    }
    const ref = g.lots.find((l) => l.currentPrice > 0) || g.lots[0];
    g.currentPrice = ref.currentPrice;
    g.currency = inferCurrency(g.ticker, ref.value, ref.quantity, ref.currentPrice, fxRates);
    g.cost = g.lots.reduce((s, l) => s + (l.value - l.profit), 0);
  }
  const symbols = {};
  for (const g of valid) {
    const info = describeSymbol(g.ticker);
    const kind = g.category === 'ETF' || g.category === 'ETC' || g.category === 'ETN' ? 'ETF' : g.category === 'STOCK' ? 'STOCK' : info.kind;
    const merged = { ...info, currency: g.currency, kind, yahooSymbol: g.currency === 'USD' && info.symbol.endsWith('.US') ? info.ticker : info.yahooSymbol };
    const existing = matchInstrument(state, merged);
    symbols[g.ticker] = { ...merged, name: g.name, instrumentId: existing?.id || null, existingLabel: existing ? `${existing.ticker} · ${existing.name}` : null };
  }
  return {
    mode: 'OPEN',
    sheetName: sheet.name,
    groups: valid,
    symbols,
    totals: {
      value: valid.reduce((s, g) => s + g.value, 0),
      profit: valid.reduce((s, g) => s + g.profit, 0),
      cost: valid.reduce((s, g) => s + g.cost, 0),
      lots: valid.reduce((s, g) => s + g.lots.length, 0),
    },
  };
}

// Otwarte pozycje → transakcje kupna (każda transza osobno, koszt w PLN = wartość − zysk netto z XTB),
// opcjonalnie zastąpienie wcześniejszych transakcji konta. realCashflows – prawdziwe wpłaty/wypłaty z arkusza
// „Cash Operations”. Bez nich import nie tworzy wpłat na pełny koszt transz: zakup opłacony z wolnych środków
// (dywidendy, sprzedaż, wcześniejsze wpłaty) tylko je zmniejsza, a brakującą część pokrywa automatyczne
// „Uzupełnienie środków” (silnik autoFundingCashflows) – bez fałszywych dopłat w sumie wpłat.
export function buildXtbOpenImport(analysis, mapping, { state, account, replaceAccount = false, realCashflows = null }) {
  const accountId = account.id;
  const tradePrefix = `xtbpos_${accountId}_`;
  const fundPrefix = `xtbposfund_${accountId}_`;
  const newInstruments = [];
  const instIdFor = {};
  for (const g of analysis.groups) {
    const m = mapping[g.ticker];
    if (m?.instrumentId) {
      instIdFor[g.ticker] = m.instrumentId;
      continue;
    }
    const id = `inst_xtb_${m.ticker.toLowerCase().replace(/[^a-z0-9]/g, '')}_${m.currency.toLowerCase()}`;
    instIdFor[g.ticker] = id;
    if (!state.instruments.some((i) => i.id === id) && !newInstruments.some((i) => i.id === id)) {
      newInstruments.push({ id, ticker: m.ticker, yahooSymbol: m.yahooSymbol, name: m.name || m.ticker, kind: m.kind, currency: m.currency, ter: 0, sector: '', mockPrice: g.currentPrice || undefined });
    }
  }
  const trades = [];
  const cashflows = [];
  for (const g of analysis.groups) {
    const m = mapping[g.ticker];
    const ccy = m?.instrumentId ? state.instruments.find((i) => i.id === m.instrumentId)?.currency || m.currency : m.currency;
    for (const lot of g.lots) {
      const cost = Math.round((lot.value - lot.profit) * 100) / 100;
      const gross = lot.quantity * lot.openPrice;
      const trade = {
        id: `${tradePrefix}${lot.positionId}`,
        accountId,
        instrumentId: instIdFor[g.ticker],
        date: lot.date,
        side: 'BUY',
        quantity: lot.quantity,
        price: lot.openPrice,
        currency: ccy,
        note: `XTB: otwarta pozycja ${lot.positionId}`,
        source: 'XTB_OPEN',
      };
      if (ccy === 'PLN') {
        trade.fxRate = 1;
        trade.fee = Math.max(0, Math.round((cost - gross) * 100) / 100);
        if (trade.fee < 0.01) trade.fee = 0;
      } else {
        // Koszt z XTB zawiera już przewalutowanie – kurs dobrany tak, by koszt w aplikacji = koszt z raportu
        trade.fxRate = gross > 0 ? Math.round((cost / gross) * 1e6) / 1e6 : 1;
        trade.fee = 0;
        trade.fxFeePct = 0;
      }
      trades.push(trade);
    }
  }
  // Ceny bieżące z raportu XTB jako notowania – tylko gdy brak notowania na żywo (live z Yahoo ma pierwszeństwo)
  const quotes = {};
  const now = new Date().toISOString();
  for (const g of analysis.groups) {
    const id = instIdFor[g.ticker];
    const existing = state.prices?.quotes?.[id];
    const live = existing && existing.source && !/mock|xtb/i.test(existing.source);
    if (!live && g.currentPrice > 0) {
      const ccy = mapping[g.ticker]?.instrumentId ? state.instruments.find((i) => i.id === id)?.currency || g.currency : mapping[g.ticker]?.currency || g.currency;
      quotes[id] = { price: g.currentPrice, prevClose: g.currentPrice, currency: ccy, source: 'XTB (raport)', updatedAt: now };
    }
  }

  if (realCashflows) cashflows.push(...realCashflows);
  // Bez zastępowania historii: transze i wpłaty już obecne w danych pod innym identyfikatorem (wpis ręczny, import
  // historii operacji) są pomijane – zostaje istniejący wpis. Zamknięte pozycje (xtbcl_) to osobne transze.
  let contentDuplicates = 0;
  if (!replaceAccount) {
    const own = (x) => String(x.id).startsWith(tradePrefix) || String(x.id).startsWith(`xtbcl_${accountId}_`);
    const stTrades = { ...state, trades: state.trades.filter((t) => !own(t)) };
    const dt = dedupeImport(stTrades, 'trades', trades, { extraInstruments: newInstruments });
    const dc = dedupeImport(state, 'cashflows', cashflows, { ignoreIds: new Set(state.cashflows.filter((c) => c.accountId === accountId && String(c.id).startsWith(`xtb_${accountId}_`)).map((c) => c.id)) });
    const skipT = new Set(dt.byContent.map((d) => d.item.id));
    const skipC = new Set(dc.byContent.map((d) => d.item.id));
    contentDuplicates = skipT.size + skipC.size;
    trades.splice(0, trades.length, ...trades.filter((t) => !skipT.has(t.id)));
    cashflows.splice(0, cashflows.length, ...cashflows.filter((c) => !skipC.has(c.id)));
  }
  const newTradeIds = new Set(trades.map((t) => t.id));
  const newCashIds = new Set(cashflows.map((c) => c.id));
  // Usuwane: transze z poprzedniego importu, których już nie ma (sprzedane), albo – przy zastąpieniu – wszystkie transakcje i wpłaty konta
  const removeTrades = state.trades.filter((t) => t.accountId === accountId && (replaceAccount ? !newTradeIds.has(t.id) : String(t.id).startsWith(tradePrefix) && !newTradeIds.has(t.id))).map((t) => t.id);
  const removeCashflows = state.cashflows
    .filter(
      (c) =>
        c.accountId === accountId &&
        (replaceAccount
          ? !newCashIds.has(c.id) && c.source !== 'AUTO_BOND' && c.source !== 'AUTO_FUND'
          : (String(c.id).startsWith(fundPrefix) || (realCashflows && String(c.id).startsWith(`xtb_${accountId}_`))) && !newCashIds.has(c.id)),
    )
    .map((c) => c.id);
  const existingTrade = new Set(state.trades.map((t) => t.id));
  const existingCash = new Set(state.cashflows.map((c) => c.id));
  return {
    newInstruments,
    trades,
    cashflows,
    quotes,
    upsertTrades: trades,
    upsertCashflows: cashflows,
    added: trades.filter((t) => !existingTrade.has(t.id)).length,
    updated: trades.filter((t) => existingTrade.has(t.id)).length,
    addedCash: cashflows.filter((c) => !existingCash.has(c.id)).length,
    contentDuplicates,
    removeTrades,
    removeCashflows,
    otherTrades: state.trades.filter((t) => t.accountId === accountId && !String(t.id).startsWith(tradePrefix) && !String(t.id).startsWith(`xtbcl_${accountId}_`)).length,
  };
}

// Dywidendy, podatki i odsetki z arkusza „Cash Operations” tego samego raportu – uzupełnienie importu otwartych pozycji.
// Instrumenty otwartych pozycji mapowane tak samo; spółki już sprzedane dostają własne instrumenty (dla historii dywidend).
export function buildXtbIncomeImport(cashAnalysis, openMapping, { state, account, fxPct = 0 }) {
  const mapping = {};
  for (const [sym, s] of Object.entries(cashAnalysis.symbols)) {
    if (!cashAnalysis.ops.some((o) => o.symbol.toUpperCase() === sym && (o.kind === 'DIVIDEND' || o.kind === 'TAX'))) continue;
    mapping[sym] = openMapping[sym] ? { ...openMapping[sym] } : { ...s };
  }
  const incomeOnly = { ...cashAnalysis, ops: cashAnalysis.ops.filter((o) => ['DIVIDEND', 'INTEREST', 'TAX', 'INTEREST_TAX'].includes(o.kind)) };
  const plan = buildXtbImport(incomeOnly, mapping, { state, account, fxPct });
  // Pełna lista (także już zaimportowane) – przy zastępowaniu historii konta nie mogą zostać usunięte; operacje
  // rozpoznane po treści (np. dywidenda wpisana ręcznie) nie są dodawane drugi raz, a istniejący wpis zostaje
  const dupIds = new Set(plan.incomeContentMatches.map((d) => d.item.id));
  const all = plan.allIncome.filter((i) => !dupIds.has(i.id));
  const existing = new Set(state.income.map((i) => i.id));
  const allIds = new Set([...all.map((i) => i.id), ...plan.incomeContentMatches.map((d) => d.match.id)]);
  return {
    income: all,
    newInstruments: plan.newInstruments,
    duplicates: plan.duplicates,
    contentDuplicates: plan.incomeContentMatches.length,
    dividends: all.filter((i) => i.type === 'DIVIDEND').length,
    interest: all.filter((i) => i.type === 'INTEREST').length,
    gross: all.filter((i) => i.type === 'DIVIDEND').reduce((sum, i) => sum + i.gross, 0),
    tax: all.reduce((sum, i) => sum + (i.foreignTax || 0), 0),
    allIds,
    existingCount: [...allIds].filter((id) => existing.has(id)).length,
  };
}

// Prawdziwe wpłaty i wypłaty z arkusza „Cash Operations” (np. „IKE deposit”) – podstawa wkładu i limitu IKE/IKZE
export function buildXtbRealCashflows(cashAnalysis, { state, account }) {
  const ops = { ...cashAnalysis, ops: cashAnalysis.ops.filter((o) => o.kind === 'DEPOSIT' || o.kind === 'WITHDRAWAL') };
  const plan = buildXtbImport(ops, {}, { state, account, fxPct: 0 });
  return plan.allCashflows;
}

// ---------------------------------------------------------------------------------------------
// Zamknięte pozycje („Closed Positions”): każda transza = kupno (otwarcie) + sprzedaż (zamknięcie) z wartościami
// zakupu i sprzedaży w PLN wg XTB. Daje historię posiadania sprzedanych spółek (dywidendy sprzed sprzedaży),
// zrealizowany zysk i rotację (sprzedaż → zakup) widoczną w limicie IKE/IKZE.

const CLOSED_ALIASES = {
  name: ['instrument'],
  ticker: ['ticker', 'symbol'],
  category: ['category', 'kategoria'],
  type: ['type', 'typ'],
  volume: ['volume', 'wolumen', 'liczba'],
  openPrice: ['open price', 'cena otwarcia'],
  openTime: ['open time (utc)', 'open time', 'czas otwarcia (utc)', 'czas otwarcia'],
  closePrice: ['close price', 'cena zamknięcia', 'cena zamkniecia'],
  closeTime: ['close time (utc)', 'close time', 'czas zamknięcia (utc)', 'czas zamknięcia', 'czas zamkniecia'],
  purchaseValue: ['purchase value', 'wartość zakupu', 'wartosc zakupu'],
  saleValue: ['sale value', 'wartość sprzedaży', 'wartosc sprzedazy'],
  profit: ['profit/loss', 'zysk/strata', 'gross profit'],
  positionId: ['position id', 'id pozycji', 'position'],
};

function findClosedHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i += 1) {
    const cells = rows[i].map(norm);
    const col = {};
    for (const [key, aliases] of Object.entries(CLOSED_ALIASES)) {
      for (const alias of aliases) {
        const idx = cells.indexOf(alias);
        if (idx >= 0) {
          col[key] = idx;
          break;
        }
      }
    }
    if (col.ticker !== undefined && col.volume !== undefined && col.openTime !== undefined && col.closeTime !== undefined && col.closePrice !== undefined) return { index: i, col };
  }
  return null;
}

export function analyzeXtbClosedPositions(sheets, { state }) {
  const named = sheets.filter((s) => /closed\s*position|zamknięte\s*pozycje|zamkniete\s*pozycje/i.test(s.name));
  let found = null;
  for (const sheet of named) {
    const header = findClosedHeader(sheet.rows);
    if (header) {
      found = { sheet, header };
      break;
    }
  }
  if (!found) return null;
  const { sheet, header } = found;
  const { col } = header;
  const cell = (row, key) => (col[key] === undefined ? '' : row[col[key]]);
  const lots = [];
  for (let r = header.index + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    const ticker = String(cell(row, 'ticker') ?? '').trim().toUpperCase();
    const type = norm(cell(row, 'type'));
    if (!ticker || (type && type !== 'buy' && type !== 'kupno')) continue;
    const lot = {
      ticker,
      name: String(cell(row, 'name') ?? '').trim() || ticker,
      category: String(cell(row, 'category') ?? '').trim().toUpperCase(),
      quantity: parseNumber(cell(row, 'volume')),
      openPrice: parseNumber(cell(row, 'openPrice')),
      closePrice: parseNumber(cell(row, 'closePrice')),
      openDate: parseDate(cell(row, 'openTime')),
      closeDate: parseDate(cell(row, 'closeTime')),
      purchaseValue: parseNumber(cell(row, 'purchaseValue')),
      saleValue: parseNumber(cell(row, 'saleValue')),
      profit: parseNumber(cell(row, 'profit')),
      positionId: String(cell(row, 'positionId') ?? '').trim().replace(/\.0+$/, '') || `${ticker}_${r + 1}`,
      row: r + 1,
    };
    if (!(lot.quantity > 0) || !(lot.openPrice > 0) || !(lot.closePrice > 0) || !lot.openDate || !lot.closeDate) continue;
    // Brak wartości w PLN (starsze eksporty) – wartość z ceny (instrumenty w PLN)
    if (!(lot.purchaseValue > 0)) lot.purchaseValue = lot.quantity * lot.openPrice;
    if (!(lot.saleValue >= 0)) lot.saleValue = lot.quantity * lot.closePrice;
    lots.push(lot);
  }
  if (!lots.length) return null;
  const symbols = {};
  for (const l of lots) {
    if (symbols[l.ticker]) continue;
    const info = describeSymbol(l.ticker);
    const kind = ['ETF', 'ETC', 'ETN'].includes(l.category) ? 'ETF' : l.category === 'STOCK' ? 'STOCK' : info.kind;
    const merged = { ...info, kind };
    const existing = matchInstrument(state, merged);
    symbols[l.ticker] = { ...merged, name: l.name, instrumentId: existing?.id || null };
  }
  return {
    sheetName: sheet.name,
    lots,
    symbols,
    totals: {
      lots: lots.length,
      tickers: Object.keys(symbols).length,
      purchase: lots.reduce((s, l) => s + l.purchaseValue, 0),
      sale: lots.reduce((s, l) => s + l.saleValue, 0),
      profit: lots.reduce((s, l) => s + (l.saleValue - l.purchaseValue), 0),
    },
  };
}

function xtbInstrumentId(m) {
  return `inst_xtb_${m.ticker.toLowerCase().replace(/[^a-z0-9]/g, '')}_${m.currency.toLowerCase()}`;
}

// Zamknięte transze → para transakcji (kupno w dniu otwarcia, sprzedaż w dniu zamknięcia). Koszt i przychód
// w PLN dokładnie jak w raporcie XTB; sprzedaż zdejmuje koszt tej transzy (costBasisPLN), nie średnią –
// koszt pozostałych otwartych transz tej samej spółki zgadza się z XTB.
export function buildXtbClosedImport(closed, openMapping, { state, account, replaceAccount = false }) {
  const accountId = account.id;
  const prefix = `xtbcl_${accountId}_`;
  const newInstruments = [];
  const instIdFor = {};
  const ccyFor = {};
  for (const [ticker, s] of Object.entries(closed.symbols)) {
    const m = openMapping?.[ticker] || s;
    const id = m.instrumentId || xtbInstrumentId(m);
    instIdFor[ticker] = id;
    ccyFor[ticker] = state.instruments.find((i) => i.id === id)?.currency || m.currency;
    if (!m.instrumentId && !state.instruments.some((i) => i.id === id) && !newInstruments.some((i) => i.id === id)) {
      newInstruments.push({ id, ticker: m.ticker, yahooSymbol: m.yahooSymbol, name: m.name || m.ticker, kind: m.kind, currency: m.currency, ter: 0, sector: '' });
    }
  }
  const trades = [];
  const round = (v) => Math.round(v * 100) / 100;
  for (const l of closed.lots) {
    const ccy = ccyFor[l.ticker];
    const base = { accountId, instrumentId: instIdFor[l.ticker], quantity: l.quantity, currency: ccy, source: 'XTB_CLOSED' };
    const grossBuy = l.quantity * l.openPrice;
    const grossSell = l.quantity * l.closePrice;
    const buy = { ...base, id: `${prefix}${l.positionId}_b`, date: l.openDate, side: 'BUY', price: l.openPrice, note: `XTB: zamknięta pozycja ${l.positionId} (otwarcie)` };
    const sell = { ...base, id: `${prefix}${l.positionId}_s`, date: l.closeDate, side: 'SELL', price: l.closePrice, costBasisPLN: round(l.purchaseValue), note: `XTB: zamknięta pozycja ${l.positionId} (zamknięcie)` };
    if (ccy === 'PLN') {
      buy.fxRate = 1;
      sell.fxRate = 1;
      buy.fee = Math.max(0, round(l.purchaseValue - grossBuy));
      sell.fee = Math.max(0, round(grossSell - l.saleValue));
    } else {
      // Wartości z XTB zawierają przewalutowanie – kurs dobrany tak, by kwoty w PLN = kwoty z raportu
      buy.fxRate = grossBuy > 0 ? Math.round((l.purchaseValue / grossBuy) * 1e6) / 1e6 : 1;
      sell.fxRate = grossSell > 0 ? Math.round((l.saleValue / grossSell) * 1e6) / 1e6 : 1;
      buy.fee = 0;
      sell.fee = 0;
      buy.fxFeePct = 0;
      sell.fxFeePct = 0;
    }
    if (buy.fee < 0.01) buy.fee = 0;
    if (sell.fee < 0.01) sell.fee = 0;
    trades.push(buy, sell);
  }
  // Bez zastępowania historii: kupno/sprzedaż już obecne w danych (wpis ręczny, import historii operacji) – pomijane
  let contentDuplicates = 0;
  if (!replaceAccount) {
    const own = (x) => String(x.id).startsWith(prefix) || String(x.id).startsWith(`xtbpos_${accountId}_`);
    const dt = dedupeImport({ ...state, trades: state.trades.filter((t) => !own(t)) }, 'trades', trades, { extraInstruments: newInstruments });
    const skip = new Set(dt.byContent.map((d) => d.item.id));
    contentDuplicates = skip.size;
    trades.splice(0, trades.length, ...trades.filter((t) => !skip.has(t.id)));
  }
  const ids = new Set(trades.map((t) => t.id));
  return {
    newInstruments,
    trades,
    contentDuplicates,
    removeTrades: state.trades.filter((t) => t.accountId === accountId && String(t.id).startsWith(prefix) && !ids.has(t.id)).map((t) => t.id),
  };
}
