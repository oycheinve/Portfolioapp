// Wskaźnik konsekwencji (skuteczności) zadań – wspólny dla zadań dziennych, tygodniowych i miesięcznych.
// Liczony w aplikacji z tych samych danych co widoki (bez dodatkowych tabel w bazie):
//  • bieżący okres – zadania wymagane do tej pory: dziś (dzienne), ten tydzień (tygodniowe), ten miesiąc (miesięczne);
//    wynik = wykonane / wszystkie widoczne w tych okresach;
//  • ostatnie 30 dni – okresy zakończone w ciągu ostatnich 30 dni (dni do wczoraj, tygodnie i miesiące, które się
//    w tym czasie skończyły); pokazuje, jak regularnie zadania są domykane.
import { MissingTablesError, cloudStore, localStore, logKey, shiftWeek, weekId, weekProgress, weekStart } from './weeklyTasks.js';
import { dailyCloudStore, dailyLocalStore, dayId, dayKey, dayProgress, shiftDay } from './dailyTasks.js';
import { monthBounds, monthId, monthKey, monthProgress, monthlyCloudStore, monthlyLocalStore, shiftMonthId } from './monthlyTasks.js';

const EMPTY = { tasks: [], logs: [] };

// Wczytanie wszystkich kategorii (chmura po zalogowaniu; brak tabel lub błąd – zapis lokalny / puste dane)
export async function loadAllTasks(userId) {
  const loadOne = async (cloud, local) => {
    if (!userId) return local.load();
    try {
      return await cloud.load();
    } catch (e) {
      return e instanceof MissingTablesError ? local.load() : EMPTY;
    }
  };
  const [daily, weekly, monthly] = await Promise.all([
    loadOne(userId ? dailyCloudStore(userId) : null, dailyLocalStore),
    loadOne(userId ? cloudStore(userId) : null, localStore),
    loadOne(userId ? monthlyCloudStore(userId) : null, monthlyLocalStore),
  ]);
  return { daily, weekly, monthly };
}

const sets = ({ daily = EMPTY, weekly = EMPTY, monthly = EMPTY }) => ({
  daily: new Set(daily.logs.map((l) => dayKey(l.taskId, l.day))),
  weekly: new Set(weekly.logs.map((l) => logKey(l.taskId, l.weekId))),
  monthly: new Set(monthly.logs.map((l) => monthKey(l.taskId, l.month))),
});
const sum = (parts) => {
  const done = parts.reduce((s, p) => s + p.done, 0);
  const total = parts.reduce((s, p) => s + p.total, 0);
  return { done, total, pct: total ? done / total : null };
};
const pick = (p) => ({ done: p.done, total: p.total, pct: p.total ? p.done / p.total : null });

export function consistencyScore(data, now = new Date()) {
  const { daily = EMPTY, weekly = EMPTY, monthly = EMPTY } = data;
  const s = sets(data);
  const today = dayId(now);
  const week = weekId(now);
  const month = monthId(now);

  const current = {
    daily: pick(dayProgress(daily.tasks, s.daily, today)),
    weekly: pick(weekProgress(weekly.tasks, s.weekly, week)),
    monthly: pick(monthProgress(monthly.tasks, s.monthly, month)),
  };

  // Okresy zakończone w ostatnich 30 dniach (koniec okresu: od dziś−30 do wczoraj)
  const from = shiftDay(today, -30);
  const yesterday = shiftDay(today, -1);
  const dParts = [];
  for (let d = yesterday; d >= from; d = shiftDay(d, -1)) dParts.push(dayProgress(daily.tasks, s.daily, d));
  const wParts = [];
  for (let w = shiftWeek(week, -1); ; w = shiftWeek(w, -1)) {
    const end = new Date(weekStart(w));
    end.setDate(end.getDate() + 6);
    if (dayId(end) < from) break;
    wParts.push(weekProgress(weekly.tasks, s.weekly, w));
  }
  const mParts = [];
  for (let m = shiftMonthId(month, -1); dayId(monthBounds(m).end) >= from; m = shiftMonthId(m, -1)) mParts.push(monthProgress(monthly.tasks, s.monthly, m));
  const rolling = { daily: sum(dParts), weekly: sum(wParts), monthly: sum(mParts) };

  return {
    current: { ...sum(Object.values(current)), byKind: current },
    rolling: { ...sum(Object.values(rolling)), byKind: rolling },
  };
}
