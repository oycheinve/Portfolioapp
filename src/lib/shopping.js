// Listy zakupów: wiele list z pozycjami (nazwa, ilość, „kupione”). Zapis w Supabase (tabele shopping_lists /
// shopping_items, supabase/shopping_lists.sql) po zalogowaniu, a w trybie lokalnym (albo gdy tabel jeszcze nie
// utworzono) w localStorage `wealth-app-shopping-v1` (także w kopii zapasowej JSON). Moduł nie zmienia portfela.
import { getClient } from './cloud.js';

export const LOCAL_KEY = 'wealth-app-shopping-v1';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
const order = () => Date.now();

export function makeList(name) {
  return { id: newId(), name: String(name).trim().slice(0, 60), sortOrder: order(), createdAt: new Date().toISOString() };
}

// „Mleko 2 l” / „2x chleb” – ilość opcjonalna, wpisywana osobno
export function makeItem(listId, title, quantity = '') {
  const q = String(quantity || '').trim().slice(0, 30);
  return { id: newId(), listId, title: String(title).trim().slice(0, 120), quantity: q || null, done: false, doneAt: null, sortOrder: order(), createdAt: new Date().toISOString() };
}

// Kolejność: listy od najstarszej, pozycje – najpierw do kupienia (od najnowszej), potem kupione (ostatnio kupione na górze)
export const sortLists = (lists) => [...lists].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
export function sortItems(items) {
  const open = items.filter((i) => !i.done).sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));
  const done = items.filter((i) => i.done).sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));
  return [...open, ...done];
}

// ── Zapis lokalny ──
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    return { lists: Array.isArray(v?.lists) ? v.lists : [], items: Array.isArray(v?.items) ? v.items : [] };
  } catch {
    return { lists: [], items: [] };
  }
}
function writeLocal(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: LOCAL_KEY } }));
  } catch {
    // brak localStorage
  }
}
const updateLocal = (fn) => writeLocal(fn(readLocal()));

export const localStore = {
  kind: 'local',
  async load() {
    return readLocal();
  },
  async addList(list) {
    updateLocal((d) => ({ ...d, lists: [...d.lists, list] }));
  },
  async renameList(id, name) {
    updateLocal((d) => ({ ...d, lists: d.lists.map((l) => (l.id === id ? { ...l, name } : l)) }));
  },
  async deleteList(id) {
    updateLocal((d) => ({ lists: d.lists.filter((l) => l.id !== id), items: d.items.filter((i) => i.listId !== id) }));
  },
  async addItem(item) {
    updateLocal((d) => ({ ...d, items: [...d.items, item] }));
  },
  async setDone(id, done, doneAt) {
    updateLocal((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, done, doneAt } : i)) }));
  },
  async deleteItem(id) {
    updateLocal((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
  },
  async deleteDone(listId) {
    updateLocal((d) => ({ ...d, items: d.items.filter((i) => !(i.listId === listId && i.done)) }));
  },
};

// ── Zapis w Supabase ──
export class MissingTablesError extends Error {}
function check(error) {
  if (!error) return;
  // Brak tabel (skrypt SQL nie został uruchomiony): 42P01 (Postgres) / PGRST205 (PostgREST)
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '')) throw new MissingTablesError(error.message);
  throw new Error(error.message || 'Błąd zapisu w chmurze');
}
const listFromRow = (r) => ({ id: r.id, name: r.name, sortOrder: Number(r.sort_order) || 0, createdAt: r.created_at });
const itemFromRow = (r) => ({ id: r.id, listId: r.list_id, title: r.title, quantity: r.quantity, done: !!r.done, doneAt: r.done_at, sortOrder: Number(r.sort_order) || 0, createdAt: r.created_at });

export function cloudStore(userId) {
  const now = () => new Date().toISOString();
  return {
    kind: 'cloud',
    async load() {
      const sb = await getClient();
      const [l, i] = await Promise.all([
        sb.from('shopping_lists').select('id, name, sort_order, created_at').eq('user_id', userId),
        sb.from('shopping_items').select('id, list_id, title, quantity, done, done_at, sort_order, created_at').eq('user_id', userId),
      ]);
      check(l.error);
      check(i.error);
      return { lists: (l.data || []).map(listFromRow), items: (i.data || []).map(itemFromRow) };
    },
    async addList(list) {
      const sb = await getClient();
      check((await sb.from('shopping_lists').insert({ id: list.id, user_id: userId, name: list.name, sort_order: list.sortOrder })).error);
    },
    async renameList(id, name) {
      const sb = await getClient();
      check((await sb.from('shopping_lists').update({ name, updated_at: now() }).eq('id', id).eq('user_id', userId)).error);
    },
    async deleteList(id) {
      const sb = await getClient();
      check((await sb.from('shopping_lists').delete().eq('id', id).eq('user_id', userId)).error); // pozycje: on delete cascade
    },
    async addItem(item) {
      const sb = await getClient();
      check((await sb.from('shopping_items').insert({ id: item.id, list_id: item.listId, user_id: userId, title: item.title, quantity: item.quantity, sort_order: item.sortOrder })).error);
    },
    async setDone(id, done, doneAt) {
      const sb = await getClient();
      check((await sb.from('shopping_items').update({ done, done_at: doneAt, updated_at: now() }).eq('id', id).eq('user_id', userId)).error);
    },
    async deleteItem(id) {
      const sb = await getClient();
      check((await sb.from('shopping_items').delete().eq('id', id).eq('user_id', userId)).error);
    },
    async deleteDone(listId) {
      const sb = await getClient();
      check((await sb.from('shopping_items').delete().eq('list_id', listId).eq('done', true).eq('user_id', userId)).error);
    },
  };
}
