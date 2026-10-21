// Minimalny czytnik plików .xlsx (bez zależności): rozpakowanie ZIP przez DecompressionStream
// i odczyt arkuszy z XML. Zwraca [{ name, rows: [[wartość komórki, …], …] }].

function u16(view, o) {
  return view.getUint16(o, true);
}
function u32(view, o) {
  return view.getUint32(o, true);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Przeglądarka nie obsługuje rozpakowywania plików Excel – zapisz plik jako CSV.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Spis plików archiwum ZIP: { ścieżka: async () => Uint8Array }
export function readZip(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i -= 1) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('To nie jest prawidłowy plik .xlsx (brak struktury ZIP).');
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const files = {};
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    if (u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    const compSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOffset = u32(view, p + 42);
    const name = decoder.decode(new Uint8Array(buffer, p + 46, nameLen));
    files[name] = async () => {
      const lNameLen = u16(view, localOffset + 26);
      const lExtraLen = u16(view, localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = new Uint8Array(buffer.slice(start, start + compSize));
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error(`Nieobsługiwana kompresja w pliku (${method}).`);
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function readText(files, path) {
  const f = files[path];
  if (!f) return null;
  return new TextDecoder().decode(await f());
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, 'application/xml');
}

// Elementy po nazwie lokalnej (niezależnie od przestrzeni nazw)
function byTag(node, tag) {
  return Array.from(node.getElementsByTagNameNS('*', tag));
}

function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(el) {
  return byTag(el, 't')
    .map((t) => t.textContent)
    .join('');
}

export async function readXlsx(buffer) {
  const files = readZip(buffer);
  const sharedXml = await readText(files, 'xl/sharedStrings.xml');
  const shared = sharedXml ? byTag(parseXml(sharedXml), 'si').map(textOf) : [];
  const workbook = parseXml((await readText(files, 'xl/workbook.xml')) || '<workbook/>');
  const relsXml = await readText(files, 'xl/_rels/workbook.xml.rels');
  const rels = {};
  if (relsXml) for (const r of byTag(parseXml(relsXml), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  const sheets = [];
  const sheetRefs = [];
  byTag(workbook, 'sheet').forEach((s, index) => sheetRefs.push({ s, index }));
  for (const { s, index } of sheetRefs) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = rels[rid] || '';
    // Brak relacji w pliku → standardowa ścieżka arkusza
    target = !target ? `xl/worksheets/sheet${index + 1}.xml` : target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = await readText(files, target);
    if (!xml) continue;
    const rows = [];
    for (const row of byTag(parseXml(xml), 'row')) {
      const out = [];
      for (const c of byTag(row, 'c')) {
        const t = c.getAttribute('t');
        const v = byTag(c, 'v')[0]?.textContent;
        let value;
        if (t === 's') value = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') value = textOf(c);
        else if (t === 'str' || t === 'e') value = v ?? '';
        else if (t === 'b') value = v === '1';
        else value = v === undefined || v === '' ? '' : Number(v);
        out[colIndex(c.getAttribute('r') || '')] = value;
      }
      rows.push(Array.from(out, (x) => (x === undefined ? '' : x)));
    }
    sheets.push({ name: s.getAttribute('name') || target, rows });
  }
  return sheets;
}

// CSV z automatycznym wykryciem separatora (; , tab) i obsługą cudzysłowów
export function readCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLines = clean.split(/\r?\n/).slice(0, 20).join('\n');
  const delim = [';', '\t', ','].map((d) => [d, firstLines.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return [{ name: 'CSV', rows }];
}

export async function readSpreadsheet(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls')) throw new Error('Stary format .xls nie jest obsługiwany – zapisz plik jako .xlsx lub CSV.');
  return readCsv(await file.text());
}
