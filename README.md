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

## Etap 4 – Dywidendy i FIRE 2055

- **Dywidendy**: kafelki (suma netto w roku, średnia miesięczna, „w drodze”, stopa dywidendy portfela + YoC), kalendarz 12 miesięcy (wypłacona / w drodze / ogłoszona / prognoza), przypomnienia o Ex-Date, wypłatach i raportach, ogłoszone dywidendy z księgowaniem do rejestru, prognoza 5–10 lat z suwakiem DGR i DRIP, daty raportów/WZA z eksportem do Kalendarza Google i pliku .ics (Apple/Outlook).
- **FIRE 2055**: cel dochodu pasywnego i majątku (w dzisiejszych zł), kryterium (oba / dochód / majątek), suwaki wpłaty, stóp zwrotu dla 3 scenariuszy, stopy dywidendy, DGR i inflacji; wskaźnik postępu, prognozowana data FIRE, wymagana wpłata, Coast FIRE i dwuosiowy wykres ścieżki do roku docelowego.
- Nawigacja mobilna: 4 główne zakładki + arkusz „Więcej”.
- Logika: `src/lib/dividends.js`, `src/lib/fire.js`, `src/lib/calendarExport.js`; stan: `dividendSchedule`, `settings.fire`, `settings.dividendPrefs`, `instrument.dividend` (DPS, najbliższe wydarzenie).

## Etap 5 – Raport na X i podsumowania

- **Raport na X**: okres tygodniowy (ISO) / miesięczny / roczny, wybór bieżącego lub wcześniejszego okresu; automatyczny tekst posta (wartość, wpłacone, zysk total, dywidendy, wynik okresu, najlepsze i najsłabsze spółki), licznik znaków X, tryb „ukryj kwoty”, hashtagi i nick, przycisk „Kopiuj tekst na X” oraz otwarcie okna publikacji X.
- **Karta graficzna** (SVG, ciemny motyw, 16:9 lub 1:1): wynik okresu, statystyki, wykres TWR okresu, największe ruchy z monogramami spółek; eksport do PNG (2×) i kopiowanie obrazu.
- **Podsumowania**: rok kalendarzowy 1.01–31.12 (bieżący do dziś) z wykresem wyników miesięcy, tabela każdego miesiąca i każdego roku: wartość, wpłaty netto, zysk/strata PLN i %, dywidendy, najlepszy i najgorszy instrument.
- Logika: `src/lib/reports.js`, `src/lib/xReport.js`. Migawki dzienne zapisują teraz także ceny instrumentów (`snapshots[].prices`), co zasila historię cen raportów i wykresów.

## Etap 6 – Dodatki specjalne

- **Limity IKE/IKZE na kolejne lata** (Ustawienia): podgląd bieżącego i 2 kolejnych lat, edycja ręczna, wyliczenie z prognozowanego przeciętnego wynagrodzenia (IKE 3×, IKZE 1,2×, JDG 1,8×) lub szacunek o % wzrostu; automatyczne uzupełnienie po Nowym Roku (`settings.limitsPolicy`).
- **Symulator „Co jeśli”**: korekta akcji/ETF (0 … −50%), kursy USD/PLN i EUR/PLN (±10%), nieruchomości; scenariusze gotowe; wpływ na majątek, klasy aktywów, konta, waluty i pozycje (`src/lib/stress.js`).
- **Dziennik decyzji**: wpisy z datą, tytułem, powiązaną transakcją/instrumentem/kontem, tagami i treścią; oś czasu z wyszukiwarką i filtrami (`journal`).
- **Kopia zapasowa**: eksport `majatek-backup-RRRR-MM-DD_GG-MM.json` z metadanymi, import z podglądem i walidacją struktury (`src/lib/backup.js`), opcja kopii przed importem, przypomnienie o ostatniej kopii.
- **Cele roczne**: kategorie Finansowe / Rozwój / Inne, cele ręczne (+/−) lub automatyczne z danych portfela, % każdego celu i zbiorczy wskaźnik kołowy (`src/lib/goals.js`).

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
| `goals` | Cele roczne: kategoria, wartość docelowa i aktualna, źródło automatyczne (Etap 6) |
| `journal` | Dziennik decyzji inwestycyjnych (Etap 6) |
| `dividendSchedule` | Ogłoszone dywidendy: DPS, Ex-Date, wypłata, podatek u źródła, status księgowania (Etap 4) |
| `snapshots` | Dzienne migawki wartości i wkładu per konto oraz ceny instrumentów (historia, TWR, raporty okresowe) |
| `prices` | Notowania, kursy walut, status i dziennik odświeżania |
| `priceHistory` | Tygodniowa historia cen instrumentów, benchmarków i walut (Etap 3) |

**Prawdziwy Zysk Total** = Wartość portfela − wartość na początku okresu − wpłaty netto w okresie
= zysk kursowy + dywidendy netto + odsetki netto (wypłacone i naliczone w obligacjach).

Silnik obliczeń: `src/lib/engine.js`, podatki: `src/lib/tax.js`, obligacje: `src/lib/bonds.js`, notowania: `src/lib/prices.js`.

## Notowania

Kolejność źródeł: proxy Vite `/api/yahoo` → konfigurowalne proxy CORS → dane symulowane. Kursy walut: API NBP (tabela A) → Yahoo FX → symulacja.
