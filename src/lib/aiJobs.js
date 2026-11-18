// Zadania AI w tle (paragon, analiza wyników): aplikacja nadaje zadaniu identyfikator i zapisuje je na urządzeniu
// (`fintrack-ai-jobs`, bez synchronizacji – wynik odbiera to urządzenie). Serwer kończy pracę także po zamknięciu
// aplikacji i zapisuje wynik (tabela ai_jobs). Gdy odpowiedź dotrze od razu – zadanie jest potwierdzane i usuwane;
// gdy aplikację zamknięto wcześniej – przy następnym otwarciu `resumeAiJobs` odbiera wynik i przekazuje go dalej:
// paragon → kolejka `fintrack-pending-receipts` (Budżet otwiera ekran weryfikacji), analiza → zapis w Analityku.
import { ackAiJob, fetchAiJob } from './newsAi.js';

const JOBS_KEY = 'fintrack-ai-jobs';
export const PENDING_RECEIPTS_KEY = 'fintrack-pending-receipts';
export const PENDING_RECEIPT_EVENT = 'fintrack-pending-receipt';
const STALE_MS = 4 * 60 * 1000; // dłużej „w toku” – funkcja serwera już nie żyje (limit 60 s)
const active = new Set(); // zadania, na które ta sesja aplikacji jeszcze czeka

const read = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // brak localStorage – zadania w tle wyłączone
  }
};
export const readJobs = () => (Array.isArray(read(JOBS_KEY, [])) ? read(JOBS_KEY, []) : []);
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

// Nowe zadanie: { id } – przekazać jako jobId w zapytaniu
export function beginJob(mode, meta = {}) {
  const id = newId();
  write(JOBS_KEY, [...readJobs().filter((j) => Date.now() - j.at < 7 * 86400000), { id, mode, meta, at: Date.now() }]);
  active.add(id);
  return id;
}
// Odpowiedź dotarła do aplikacji (sukces albo błąd zapytania) – zadanie zamknięte, wynik na serwerze niepotrzebny
export function endJob(id, { keep = false } = {}) {
  active.delete(id);
  if (keep) return; // np. przerwane połączenie – wynik odbierzemy przy kolejnym otwarciu
  write(JOBS_KEY, readJobs().filter((j) => j.id !== id));
  ackAiJob(id);
}
// Błąd sieci (aplikacja zamknięta / wstrzymana w tle, brak zasięgu) – a nie odpowiedź serwera z błędem
export const isNetworkDrop = (e) => e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|network|aborted/i.test(String(e?.message || ''));

export const hasOpenJobs = () => readJobs().some((j) => !active.has(j.id));

export function readPendingReceipts() {
  const v = read(PENDING_RECEIPTS_KEY, []);
  return Array.isArray(v) ? v : [];
}
export function takePendingReceipt() {
  const list = readPendingReceipts();
  if (!list.length) return null;
  write(PENDING_RECEIPTS_KEY, list.slice(1));
  return list[0];
}

let resuming = false;
// Odbiór wyników zadań z poprzednich sesji. handlers: { notify(text, kind), earnings(result) }
export async function resumeAiJobs(handlers = {}) {
  if (resuming) return;
  resuming = true;
  try {
    for (const job of readJobs()) {
      if (active.has(job.id)) continue;
      const age = Date.now() - job.at;
      let r;
      try {
        r = await fetchAiJob(job.id);
      } catch {
        continue; // brak sieci – spróbujemy przy następnym otwarciu
      }
      if (r.status === 'pending' && age < STALE_MS) continue; // serwer jeszcze pracuje
      if (r.status === 'auth' || (r.status === 'unknown' && age < 30000)) continue;
      write(JOBS_KEY, readJobs().filter((j) => j.id !== job.id));
      if (r.status === 'done' && r.result) {
        if (job.mode === 'receipt' && r.result.receipt?.items?.length) {
          write(PENDING_RECEIPTS_KEY, [...readPendingReceipts(), { receipt: r.result.receipt, hash: job.meta?.hash || '', at: job.at }]);
          window.dispatchEvent(new CustomEvent(PENDING_RECEIPT_EVENT));
          handlers.notify?.(`🧾 Paragon${r.result.receipt.shop ? ` ${r.result.receipt.shop}` : ''} odczytany w tle – sprawdź i zatwierdź w Budżecie`, 'success');
          handlers.openBudget?.();
        } else if (job.mode === 'earnings' && r.result.analysis) {
          handlers.earnings?.(r.result);
        }
        ackAiJob(job.id);
      } else if (r.status === 'error') {
        handlers.notify?.(`${job.mode === 'receipt' ? 'Paragon' : 'Analityk wyników'} (w tle): ${r.result?.error || 'nie udało się'}`, 'warn');
        ackAiJob(job.id);
      } else if (r.status === 'pending') {
        handlers.notify?.(`${job.mode === 'receipt' ? 'Odczyt paragonu' : 'Analiza wyników'} w tle nie została dokończona – spróbuj ponownie`, 'warn');
        ackAiJob(job.id);
      }
      // 'unknown' (brak tabeli ai_jobs / zadanie nie dotarło do serwera) – po cichu usunięte
    }
  } finally {
    resuming = false;
  }
}
