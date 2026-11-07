// Izolacja localStorage per użytkownik (wieloużytkowość): po zalogowaniu klucze danych aplikacji
// („wealth-app-*”, „fintrack-*”, stan synchronizacji „portfolio-cloud-pending / synced-at / conflict-backup”)
// są zapisywane jako „u:<id użytkownika>:<klucz>”. Kod aplikacji dalej używa zwykłych nazw – warstwa działa
// przezroczyście na localStorage (getItem / setItem / removeItem / key / length). Klucze globalne (konfiguracja
// Supabase, sesja logowania „sb-*”, tryb i właściciel danych) pozostają bez prefiksu.
// Przed zalogowaniem (i w trybie lokalnym bez Supabase) – bez prefiksu, jak dotąd.
const SCOPED = /^(wealth-app-|fintrack-|portfolio-cloud-(pending|synced-at|conflict-backup|scope-owner)$)/;
const PREFIX = /^u:[^:]+:/;
export const LEGACY_OWNER_KEY = 'portfolio-cloud-owner';

let scope = null; // id zalogowanego użytkownika
let installed = false;
let raw = null; // oryginalne metody localStorage

const isScoped = (key) => SCOPED.test(String(key));
const mapKey = (key) => (scope && isScoped(key) ? `u:${scope}:${key}` : key);

function install() {
  if (installed || typeof window === 'undefined' || !window.localStorage || typeof Storage === 'undefined') return;
  const proto = Storage.prototype;
  const lenDesc = Object.getOwnPropertyDescriptor(proto, 'length');
  raw = { get: proto.getItem, set: proto.setItem, remove: proto.removeItem, key: proto.key, length: lenDesc?.get };
  const ls = window.localStorage;
  // Widok kluczy: globalne + klucze bieżącego użytkownika (bez prefiksu); dane innych użytkowników niewidoczne
  const visible = (store) => {
    const n = raw.length.call(store);
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const k = raw.key.call(store, i);
      if (k === null) continue;
      if (!scope) {
        if (!PREFIX.test(k)) out.push(k);
      } else if (k.startsWith(`u:${scope}:`)) out.push(k.slice(scope.length + 3));
      else if (!PREFIX.test(k) && !isScoped(k)) out.push(k);
    }
    return out;
  };
  proto.getItem = function getItem(key) {
    return raw.get.call(this, this === ls ? mapKey(key) : key);
  };
  proto.setItem = function setItem(key, value) {
    return raw.set.call(this, this === ls ? mapKey(key) : key, value);
  };
  proto.removeItem = function removeItem(key) {
    return raw.remove.call(this, this === ls ? mapKey(key) : key);
  };
  proto.key = function key(i) {
    if (this !== ls) return raw.key.call(this, i);
    return visible(this)[i] ?? null;
  };
  if (lenDesc?.configurable) {
    Object.defineProperty(proto, 'length', {
      configurable: true,
      get() {
        return this === ls ? visible(this).length : raw.length.call(this);
      },
    });
  }
  installed = true;
}

// Klucze danych zapisane bez prefiksu (sprzed wieloużytkowości) – przeniesienie do przestrzeni właściciela:
// do zalogowanego, gdy dane są jego albo nie mają właściciela; do dawnego właściciela, gdy należą do kogoś innego
// (wróci do nich po zalogowaniu – nie trafią do innej osoby)
function migrateLegacy(userId) {
  const ls = window.localStorage;
  const n = raw.length.call(ls);
  const legacy = [];
  for (let i = 0; i < n; i += 1) {
    const k = raw.key.call(ls, i);
    if (k && !PREFIX.test(k) && isScoped(k)) legacy.push(k);
  }
  if (!legacy.length) return 0;
  const owner = raw.get.call(ls, LEGACY_OWNER_KEY);
  const target = owner && owner !== userId ? owner : userId;
  for (const k of legacy) {
    const dest = `u:${target}:${k}`;
    const v = raw.get.call(ls, k);
    if (v !== null && raw.get.call(ls, dest) === null) raw.set.call(ls, dest, v);
    raw.remove.call(ls, k);
  }
  return legacy.length;
}

// Włączenie przestrzeni użytkownika (po zalogowaniu, przed wczytaniem danych aplikacji)
export function activateUserScope(userId) {
  if (!userId) return;
  install();
  if (!installed) return;
  scope = String(userId);
  try {
    migrateLegacy(scope);
  } catch {
    // migracja niekrytyczna
  }
}

export const activeUserScope = () => scope;
