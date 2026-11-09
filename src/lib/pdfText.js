// Tekst z PDF w przeglądarce (pdf.js, ładowany dopiero przy pierwszym użyciu) – duże raporty okresowe wysyłamy do AI
// jako tekst (limit treści zapytania na Vercelu to 4,5 MB). Strony przetwarzane po kolei i zwalniane (pamięć iOS).
let lib = null;
async function pdfjs() {
  if (!lib) {
    const [mod, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
    mod.GlobalWorkerOptions.workerSrc = worker.default;
    lib = mod;
  }
  return lib;
}

export async function pdfToText(file, { maxChars = 140000, onProgress } = {}) {
  const { getDocument } = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;
  let out = '';
  let pages = 0;
  try {
    for (let i = 1; i <= doc.numPages && out.length < maxChars; i += 1) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      // Wiersze: nowa linia przy zmianie pozycji pionowej (tabele z raportów zachowują układ kolumn)
      let lastY = null;
      let line = '';
      const lines = [];
      for (const it of tc.items) {
        const y = Math.round(it.transform?.[5] ?? 0);
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push(line.trim());
          line = '';
        }
        line += `${it.str}${it.hasEOL ? '' : ' '}`;
        lastY = y;
      }
      if (line.trim()) lines.push(line.trim());
      out += `\n[strona ${i}]\n${lines.filter(Boolean).join('\n')}`;
      pages = i;
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return { text: out.slice(0, maxChars), pages, totalPages: doc.numPages ?? pages, truncated: out.length > maxChars };
}
