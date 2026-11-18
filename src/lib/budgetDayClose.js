// Zamknięcie dnia w Budżecie: gdy dzienne zadanie o spisaniu wydatków (tytuł z „wydatk…”, np. „Spisać wydatki”,
// „Zapisanie wydatków”) jest dziś odhaczone w Zadaniach, dzisiejszy dzień uznajemy za rozliczony – średnia na dzień
// w kafelku „Na co dzień” liczona jest od jutra (pozostałe dni bez dzisiejszego).
import { loadAllTasks } from './taskStats.js';
import { tasksForDay } from './dailyTasks.js';

const fold = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
export const isExpenseTask = (title) => /wydat(k|e)/.test(fold(title));
const today = (d = new Date()) => d.toLocaleDateString('sv');

// { closed, title } – czy dzisiejsze zadanie o wydatkach jest odhaczone (null – brak takiego zadania na dziś)
export async function expensesClosedToday(userId, now = new Date()) {
  const { daily } = await loadAllTasks(userId);
  const day = today(now);
  const tasks = tasksForDay(daily?.tasks || [], day).filter((t) => isExpenseTask(t.title));
  if (!tasks.length) return null;
  const done = new Set((daily?.logs || []).filter((l) => l.day === day).map((l) => l.taskId));
  const hit = tasks.find((t) => done.has(t.id));
  return { closed: !!hit, title: (hit || tasks[0]).title };
}
