// Import historii operacji gotówkowych z XTB (eksport „Cash operations” / „Historia operacji gotówkowych” – .xlsx lub CSV).
// Rozpoznaje wpłaty, wypłaty, zakupy i sprzedaże akcji/ETF, dywidendy, odsetki oraz podatki (dopinane do dywidend/odsetek).
// Identyfikatory wpisów oparte na ID operacji XTB – ponowny import tego samego pliku nie tworzy duplikatów.

const HEADER_ALIASES = {
  id: ['id'],
  type: ['type', 'typ', 'rodzaj'],
  time: ['time', 'czas', 'data', 'date', 'data operacji'],
  comment: ['comment', 'komentarz', 'opis'],
  symbol: ['symbol', 'instrument'],
  amount: ['amount', 'kwota', 'wartość', 'wartosc'],
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
  UK: { currency: 'GBP', yahoo: (b) => `${b}.L` },
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
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = cells.findIndex((c) => aliases.includes(c));
      if (idx >= 0) col[key] = idx;
    }
    if (col.type !== undefined && col.amount !== undefined && col.time !== undefined) return { index: i, col };
  }
  return null;
}

// Rodzaj operacji z kolumny „Type” (EN/PL) i komentarza
export function classifyOperation(type, comment, amount) {
  const t = norm(type);
  const c = String(comment || '').toUpperCase();
  if (/withholding|podatek|tax/.test(t)) return /interest|odsetk/.test(t) ? 'INTEREST_TAX' : 'TAX';
  if (/divid|dywid/.test(t)) return 'DIVIDEND';
  if (/interest|odsetk/.test(t)) return 'INTEREST';
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
  const m = /(?:OPEN|CLOSE)\s+(?:BUY|SELL)\s+([\d.,\s]+?)(?:\/[\d.,\s]+)?\s*@\s*([\d.,\s]+)/i.exec(String(comment || ''));
  if (!m) return null;
  const quantity = parseNumber(m[1]);
  const price = parseNumber(m[2]);
  return Number.isFinite(quantity) && Number.isFinite(price) && quantity > 0 && price > 0 ? { quantity, price } : null;
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
  for (let r = header.index + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    const type = row[col.type];
    const amount = parseNumber(row[col.amount]);
    const date = parseDate(row[col.time]);
    if (!type || !Number.isFinite(amount) || !date) continue;
    const comment = col.comment !== undefined ? String(row[col.comment] ?? '') : '';
    const symbol = col.symbol !== undefined ? String(row[col.symbol] ?? '').trim() : '';
    const xtbId = col.id !== undefined && row[col.id] !== '' ? String(row[col.id]).trim() : `${date}_${r}`;
    ops.push({ row: r + 1, xtbId, type: String(type), kind: classifyOperation(type, comment, amount), date, amount, comment, symbol });
  }

  const symbols = {};
  for (const o of ops) {
    if (!o.symbol || !['BUY', 'SELL', 'DIVIDEND', 'TAX'].includes(o.kind)) continue;
    if (!symbols[o.symbol.toUpperCase()]) {
      const info = describeSymbol(o.symbol);
      const existing = matchInstrument(state, info);
      symbols[info.symbol] = { ...info, instrumentId: existing?.id || null, existingLabel: existing ? `${existing.ticker} · ${existing.name}` : null };
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
  for (const o of analysis.ops) {
    const id = `${prefix}${o.xtbId}`;
    const sym = o.symbol.toUpperCase();
    if (o.kind === 'DEPOSIT' || o.kind === 'WITHDRAWAL') {
      cashflows.push({ id, accountId, date: o.date, type: o.amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL', amount: Math.round(Math.abs(o.amount) * 100) / 100, note: `XTB: ${o.type}${o.comment ? ` – ${o.comment}` : ''}`, source: 'XTB' });
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
      income.push({ id, accountId, instrumentId: instIdFor[sym] || null, date: o.date, type: 'DIVIDEND', gross: Math.round(o.amount * 100) / 100, foreignTax: 0, note: `XTB: ${o.comment || o.type}`, source: 'XTB' });
    } else if (o.kind === 'INTEREST') {
      income.push({ id, accountId, date: o.date, type: 'INTEREST', gross: Math.round(o.amount * 100) / 100, foreignTax: 0, note: `XTB: ${o.type}`, source: 'XTB' });
    } else if (o.kind === 'TAX' || o.kind === 'INTEREST_TAX') {
      taxes.push(o);
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

  const known = (col, item) => state[col].some((x) => x.id === item.id);
  const fresh = {
    cashflows: cashflows.filter((x) => !known('cashflows', x)),
    trades: trades.filter((x) => !known('trades', x)),
    income: income.filter((x) => !known('income', x)),
  };
  return {
    newInstruments,
    ...fresh,
    duplicates: cashflows.length + trades.length + income.length - fresh.cashflows.length - fresh.trades.length - fresh.income.length,
    skipped,
  };
}
