import { COLLECTIONS, createEmptyState, migrateState } from './schema.js';
import { createDemoState } from './demoData.js';

function touch(state) {
  return { ...state, meta: { ...state.meta, updatedAt: new Date().toISOString() } };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'UPDATE_SETTINGS':
      return touch({ ...state, settings: { ...state.settings, ...action.payload } });

    case 'UPSERT': {
      const { collection, item } = action.payload;
      if (!COLLECTIONS.includes(collection)) return state;
      const list = state[collection];
      const idx = list.findIndex((x) => x.id === item.id);
      const next = idx >= 0 ? list.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...list, item];
      return touch({ ...state, [collection]: next });
    }

    case 'ADD_MANY': {
      // Etap 3: wsadowe dodanie rekordów (np. automatyczne odsetki), z pominięciem istniejących id
      const { collection, items } = action.payload;
      if (!COLLECTIONS.includes(collection) || !items?.length) return state;
      const existing = new Set(state[collection].map((x) => x.id));
      const fresh = items.filter((x) => !existing.has(x.id));
      if (fresh.length === 0) return state;
      return touch({ ...state, [collection]: [...state[collection], ...fresh] });
    }

    case 'SET_PRICE_HISTORY':
      return {
        ...state,
        priceHistory: {
          ...state.priceHistory,
          ...action.payload,
          series: { ...state.priceHistory.series, ...(action.payload.series || {}) },
        },
      };

    case 'DELETE': {
      const { collection, id } = action.payload;
      if (!COLLECTIONS.includes(collection)) return state;
      return touch({ ...state, [collection]: state[collection].filter((x) => x.id !== id) });
    }

    case 'DELETE_ACCOUNT': {
      // Usuwa konto wraz z powiązanymi rekordami
      const id = action.payload;
      const drop = (arr) => arr.filter((x) => x.accountId !== id);
      return touch({
        ...state,
        accounts: state.accounts.filter((a) => a.id !== id),
        trades: drop(state.trades),
        cashflows: drop(state.cashflows),
        income: drop(state.income),
        bonds: drop(state.bonds),
        snapshots: state.snapshots.map((s) => {
          const accounts = { ...s.accounts };
          delete accounts[id];
          return { ...s, accounts };
        }),
      });
    }

    case 'MERGE_QUOTES':
      // Notowania z zewnętrznego źródła (np. ceny bieżące z raportu XTB) – nadpisywane przy kolejnym odświeżeniu
      return { ...state, prices: { ...state.prices, quotes: { ...(state.prices?.quotes || {}), ...action.payload } } };

    case 'REMOVE_MANY': {
      const { collection, ids } = action.payload;
      if (!COLLECTIONS.includes(collection) || !ids?.length) return state;
      const drop = new Set(ids);
      return touch({ ...state, [collection]: state[collection].filter((x) => !drop.has(x.id)) });
    }

    case 'SYNC_BOND_FUNDING': {
      // Podmienia automatyczne wpłaty finansujące zakup obligacji na aktualnie wyliczone
      const items = action.payload || [];
      return touch({ ...state, cashflows: [...state.cashflows.filter((c) => !String(c.id).startsWith('bondfund_')), ...items] });
    }

    case 'CLEAR_HISTORY': {
      // Usuwa całą historię operacji (transakcje, wpłaty/wypłaty, dywidendy/odsetki, harmonogram dywidend, migawki).
      // Konta, ustawienia i cele zostają; obligacje i instrumenty – opcjonalnie.
      const { bonds = false, instruments = false, today } = action.payload || {};
      return touch({
        ...state,
        meta: { ...state.meta, demo: false },
        trades: [],
        cashflows: [],
        income: [],
        dividendSchedule: [],
        snapshots: [],
        bonds: bonds ? [] : state.bonds,
        instruments: instruments ? [] : state.instruments,
        // Automatyczne odsetki liczone od dziś – inaczej zostałyby ponownie dopisane za przeszłe okresy
        accounts: state.accounts.map((a) => (a.autoInterest ? { ...a, autoInterestFrom: today } : a)),
        settings: instruments
          ? { ...state.settings, allocation: { ...state.settings.allocation, instrumentTargets: {} } }
          : state.settings,
      });
    }

    case 'GOALS_ROLLOVER': {
      // Zamknięcie roku celów: archiwizacja (zamrożony wynik) + utworzenie celów na nowy rok – jedna operacja
      const { updates, creates, year } = action.payload;
      const byId = new Map(updates.map((u) => [u.id, u]));
      const existing = new Set(state.goals.map((g) => g.id));
      const goals = [...state.goals.map((g) => (byId.has(g.id) ? { ...g, ...byId.get(g.id) } : g)), ...creates.filter((c) => !existing.has(c.id))];
      const reviewed = new Set(state.settings.goalsReview?.reviewedYears || []);
      reviewed.add(year);
      return touch({
        ...state,
        goals,
        settings: { ...state.settings, goalsReview: { ...(state.settings.goalsReview || {}), reviewedYears: [...reviewed].sort() } },
      });
    }

    case 'SET_META':
      // Etap 6: metadane (np. data ostatniej kopii zapasowej) – bez zmiany updatedAt
      return { ...state, meta: { ...state.meta, ...action.payload } };

    case 'SET_PRICES':
      return { ...state, prices: { ...state.prices, ...action.payload } };

    case 'UPSERT_SNAPSHOT': {
      const snap = action.payload;
      const others = state.snapshots.filter((s) => s.date !== snap.date);
      const next = [...others, snap].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return { ...state, snapshots: next };
    }

    case 'IMPORT_STATE':
      return migrateState(action.payload);

    case 'LOAD_DEMO': {
      const demo = createDemoState();
      return { ...demo, settings: { ...demo.settings, theme: state.settings.theme } };
    }

    case 'RESET_EMPTY': {
      const empty = createEmptyState();
      return { ...empty, settings: { ...empty.settings, theme: state.settings.theme } };
    }

    default:
      return state;
  }
}
