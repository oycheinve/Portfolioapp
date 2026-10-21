# Mój Majątek – aplikacja do zarządzania majątkiem i portfelem

React + Vite + Tailwind CSS v4 + Recharts + Lucide Icons. Dane trzymane lokalnie (`localStorage`) z eksportem/importem całego stanu do pliku JSON.

## Uruchomienie

```bash
npm install
npm run dev      # http://localhost:5173 (z proxy /api/yahoo do Yahoo Finance)
npm run build    # build produkcyjny do dist/
npm run preview  # podgląd buildu (również z proxy /api/yahoo)
```

## Etap 1 – zakres

- Szkielet: motyw jasny/ciemny/systemowy, nawigacja boczna (desktop) i dolna (mobile).
- **Pulpit (Majątek)**: Majątek Całkowity (bezpieczne vs rynkowe vs inne, podział na klasy, historia), Statystyki i Prawdziwy Zysk (Całość/YTD/1M, filtr konta, TWR, CAGR, ważony TER, limity IKE/IKZE/OKI + kalkulator zwrotu PIT z IKZE), Mapa Cieplna Dnia, Notowania z przelicznikiem walut.
- **Rejestr Wpłat/Wypłat**: filtrowanie, dodawanie/edycja/usuwanie, ostrzeżenia o limitach i dostępnej gotówce.
- **Konta i ustawienia**: konta, podatki i limity, parametry OKI, źródła notowań, nieruchomości/inne aktywa, eksport/import JSON.

## Etap 2 – Alokacja i Dopłaty

- Wagi docelowe dla klas aktywów (udział w całym portfelu) i instrumentów (udział w części akcje + ETF), z przyciskami „Do 100%”, „Jak obecnie”, „Wyczyść”.
- Podwójny wykres pierścieniowy: zewnętrzny pierścień = stan obecny, wewnętrzny = cel.
- Lista odchyleń z paskami (niedowaga na niebiesko, nadwaga na pomarańczowo) w pp i PLN, alert po przekroczeniu progu (domyślnie 5 pp) oraz znaczek przy zakładce.
- Kalkulator Inteligentnej Dopłaty (water-filling bez sprzedaży): szybkie kwoty, konto docelowe, minimalne zlecenie, akcje ułamkowe, wolna gotówka, limit IKE/IKZE, „Kopiuj plan zakupów”.
- Analiza kosztów TER z edycją TER, kosztem rocznym i 10-letnim oraz TER przy wagach docelowych.

Ustawienia zapisywane są w `settings.allocation` (`src/state/schema.js`), logika w `src/lib/allocation.js`.

## Etap 3 – Wykresy i Obligacje

- **Centrum wykresów**: zakres 1M / YTD / 1 rok / Max / wybrany rok; filtr kont, klas aktywów i porównanie wybranych instrumentów; benchmarki S&P 500 (PLN), WIG20TR, WIG, MSCI World (PLN), inflacja CPI.
- 5 wykresów: wartość vs wkład (z symulacją „gdyby wpłaty szły w benchmark”), zysk w czasie (PLN z rozbiciem lub % TWR), dywidendy miesięczne (r/r), dywidendy roczne ze średnią miesięczną, drawdown.
- Historia cen: Yahoo Finance (tygodniowo, 5 lat) → offline rekonstrukcja z cen transakcji; dla całego portfela wartości z dziennych migawek (`src/lib/history.js`, `src/lib/series.js`).
- **Obligacje skarbowe**: formularz transz EDO/COI/TOS/ROR (konto z Belką 19% lub IKE 0%, odczyty inflacji per rok, opcjonalna wpłata nominału), narosłe odsetki na dziś, kupony, harmonogram i daty wykupu. Inflacja COI/EDO z tabeli CPI (`settings.cpiOverrides` nadpisuje odczyty).
- **Konto oszczędnościowe**: saldo, oprocentowanie, kapitalizacja, odsetki netto po Belce, automatyczne księgowanie odsetek za każdy okres kapitalizacji; karta dochodu pasywnego (12 mies.).

## Architektura danych (`src/state/schema.js`)

| Kolekcja | Zawartość |
|---|---|
| `accounts` | Konta: `IKE`, `IKZE`, `OKI`, `BROKERAGE`, `SAVINGS` (oprocentowanie, kapitalizacja) |
| `instruments` | Akcje/ETF: ticker, symbol Yahoo (`.WA` dla GPW), waluta, TER |
| `trades` | Kupno/sprzedaż (cena, kurs waluty, prowizja) – z nich liczone są pozycje (średni koszt) |
| `cashflows` | Wpłaty/wypłaty własne – podstawa wkładu netto |
| `income` | Dywidendy/odsetki brutto + podatek u źródła; Belka 19% liczona automatycznie poza IKE/IKZE/OKI |
| `bonds` | Obligacje EDO/COI/TOS/ROR: data zakupu, sztuki, oprocentowanie 1. roku, marża, inflacja |
| `otherAssets` | Nieruchomości/inne z przełącznikiem uwzględniania w majątku |
| `goals` | Cele roczne (kolejne etapy) |
| `snapshots` | Dzienne migawki wartości i wkładu per konto (historia, TWR, start okresów YTD/1M) |
| `prices` | Notowania, kursy walut, status i dziennik odświeżania |
| `priceHistory` | Tygodniowa historia cen instrumentów, benchmarków i walut (Etap 3) |

**Prawdziwy Zysk Total** = Wartość portfela − wartość na początku okresu − wpłaty netto w okresie
= zysk kursowy + dywidendy netto + odsetki netto (wypłacone i naliczone w obligacjach).

Silnik obliczeń: `src/lib/engine.js`, podatki: `src/lib/tax.js`, obligacje: `src/lib/bonds.js`, notowania: `src/lib/prices.js`.

## Notowania

Kolejność źródeł: proxy Vite `/api/yahoo` → konfigurowalne proxy CORS → dane symulowane. Kursy walut: API NBP (tabela A) → Yahoo FX → symulacja.
