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
