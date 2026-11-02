// Digital Asset Links dla aplikacji Android (TWA z PWABuilder) – zapis public/.well-known/assetlinks.json.
// Użycie:
//   node scripts/assetlinks.mjs <nazwa_pakietu> <SHA256> [<SHA256> …]
//     np. node scripts/assetlinks.mjs com.fintrack.app 14:6D:E9:…:B2
//     (kilka odcisków: klucz z PWABuilder + klucz „App signing” z Google Play Console)
//   node scripts/assetlinks.mjs --from <ścieżka do assetlinks.json z paczki PWABuilder>
//     – przepisuje plik z paczki po sprawdzeniu poprawności
// Skrypt sprawdza format nazwy pakietu i odcisków (32 bajty w zapisie HEX z dwukropkami) i zapisuje poprawny JSON.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/.well-known/assetlinks.json');
const PKG = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

function normFingerprint(raw) {
  const hex = String(raw).replace(/^SHA-?256:?\s*/i, '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 64) throw new Error(`Odcisk SHA-256 musi mieć 32 bajty (64 znaki HEX) – podano ${hex.length} znaków: ${raw}`);
  if (/^0+$/.test(hex)) throw new Error('Odcisk z samych zer to tylko wzór – wpisz prawdziwy odcisk klucza');
  return hex.match(/../g).join(':');
}

function build(pkg, fingerprints) {
  if (!PKG.test(pkg)) throw new Error(`Niepoprawna nazwa pakietu: ${pkg} (np. com.fintrack.app)`);
  if (!fingerprints.length) throw new Error('Podaj co najmniej jeden odcisk SHA-256');
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [...new Set(fingerprints.map(normFingerprint))] },
    },
  ];
}

try {
  const args = process.argv.slice(2);
  let data;
  if (args[0] === '--from') {
    const src = JSON.parse(readFileSync(args[1], 'utf8'));
    const entry = (Array.isArray(src) ? src : [src]).find((e) => e?.target?.namespace === 'android_app');
    if (!entry) throw new Error('W pliku nie ma wpisu android_app');
    data = build(entry.target.package_name, entry.target.sha256_cert_fingerprints || []);
  } else {
    const [pkg, ...fps] = args;
    if (!pkg) throw new Error('Użycie: node scripts/assetlinks.mjs <nazwa_pakietu> <SHA256> [<SHA256> …]');
    data = build(pkg, fps);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Zapisano ${OUT}\n  pakiet: ${data[0].target.package_name}\n  odciski: ${data[0].target.sha256_cert_fingerprints.join('\n           ')}`);
} catch (e) {
  console.error(`Błąd: ${e.message}`);
  process.exit(1);
}
