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
- **Pulpit (Majątek)**: Majątek Całkowity (bezpieczne vs rynkowe vs inne, podział na klasy, historia), Statystyki i Prawdziwy Zysk (Całość/YTD/1M, filtr konta, TWR, CAGR, ważony TER, limity IKE/IKZE + kalkulator zwrotu PIT z IKZE), Mapa Cieplna Dnia, Notowania z przelicznikiem walut.
- **Rejestr Wpłat/Wypłat**: filtrowanie, dodawanie/edycja/usuwanie, ostrzeżenia o limitach i dostępnej gotówce.
- **Konta i ustawienia**: konta, podatki i limity, źródła notowań, nieruchomości/inne aktywa, eksport/import JSON.

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
- **Zamknięcie roku i przenoszenie celów**: przy pierwszym uruchomieniu w nowym roku ekran podsumowania poprzedniego roku (Sukces / Niezrealizowane) i kreator: „Przerzuć na nowy rok” (postęp od zera, edytowalny cel) lub „Archiwizuj” (wynik zamrożony w historii roku). Cele limitów IKE/IKZE dostają nowe limity z Ustawień. Ręcznie: przycisk „Zamknij rok”, cofnięcie: „Otwórz ponownie” (`src/lib/goalsRollover.js`).

## Porządkowanie interfejsu (po Etapie 6)

- **Przewalutowanie (XTB IKE 0,05%)**: pole konta `fxConversionPct` – przy zakupie instrumentu w walucie obcej z konta w PLN prowizja doliczana jest do kosztu zakupu i bazy kosztowej (sprzedaż: odejmowana od wpływu). Szybki przełącznik „IKE w XTB” w Ustawieniach; kalkulator dopłat używa ceny z prowizją. Silnik: `tradeAmounts` / `tradeCashDelta` w `src/lib/engine.js`.
- **Pulpit (minimalny)**: Majątek Całkowity z dużym wykresem kołowym struktury, kluczowe wskaźniki (zysk total, YTD, CAGR, dywidendy, limit IKE), konta i szybki dostęp.
- **Portfel** (nowa zakładka, dolny pasek): tabela pozycji w kategoriach (konta gotówkowe, akcje GPW/zagraniczne, ETF-y polskie/zagraniczne, obligacje, nieruchomości) z podsumowaniem sekcji (wartość, zysk, zmiana dzienna, udział) i filtrem checkboxów kategorii i kont (`src/lib/portfolioTable.js`).
- **Statystyki** (nowa): Prawdziwy Zysk i wskaźniki + podsumowania miesięczne i roczne.
- **Wykresy**: centrum wykresów z benchmarkami i mapa cieplna dnia.
- **Kapitał bezpieczny** (nowa): obligacje, konta oszczędnościowe i gotówka na rachunkach w jednym module + odczyty CPI.
- **Notowania** (nowa): kursy, waluty i przelicznik. **FIRE** zawiera kartę dochodu pasywnego. **Raport na X** – sam generator.

## Przebudowa zakładek (Portfel, Wykresy, Dywidendy, Symulacje)

- **Portfel**: filtr w rozwijanym przycisku „Filtruj portfel”; tabela w zwijalnych sekcjach z kolumnami: Walor, Operacje (historia w oknie), Zmiana dzienna, Liczba jednostek, Śr. cena zakupu [PLN], Cena aktualna [PLN], Okres inwestycji, Wartość waloru [PLN], Udział [%], Stopa zwrotu [%], Zysk [PLN].
- **Pulpit**: tylko Majątek Całkowity z wykresem kołowym i podsumowanie kont.
- **Wykresy i notowania**: wybór wykresu z listy (wartość vs wkład, zysk, drawdown, dywidendy, mapa cieplna, notowania i waluty), obok wybór aktywów i benchmarków.
- **Dywidendy**: automatyczna synchronizacja (historia dywidend z Yahoo Finance; offline – prognoza z historii wypłat), opcjonalne automatyczne księgowanie wypłat; usunięto sekcję raportów/WZA (`src/lib/dividendSync.js`).
- **Symulacje i kalkulator** (nowa zakładka): Symulacja FIRE (opcje celu w zwijanym panelu, dochód pasywny), Stress test / Co jeśli, Kalkulator inwestycyjny (`src/lib/calculator.js`) – układ: dane wejściowe → wykres → wyniki.
- Dolny pasek na telefonie: Pulpit, Portfel, Statystyki, Wykresy, Dywidendy, Więcej. Stare adresy `#/fire`, `#/stress`, `#/quotes` przekierowują do nowych miejsc.

## Usprawnienia: Portfel, akordeony, własne benchmarki, koszty FX

- **Portfel**: wiersz „Cały portfel” na górze i na dole tabeli; kolumny: Walor (z ikonami operacji: dochód, sprzedaż, przewalutowanie), Operacje, Zmiana dzienna [%], Liczba jednostek, Śr. cena zakupu, Cena aktualna, Okres inwestycji [dni], Wartość, Udział [%], Stopa zwrotu, Zysk. Sekcje: Konta gotówkowe, Akcje GPW, ETF-y zagraniczne, ETF/ETC/ETN GPW, Obligacje skarbowe.
- **Akordeony**: Statystyki (Prawdziwy Zysk · Podsumowanie roku i miesiące · Lata kalendarzowe), Dywidendy (Kalendarz · Rejestr wypłat · Prognoza DGR), Alokacja (Wagi klas · Wagi instrumentów · Kalkulator dopłaty · Analiza TER). Rozwinięte sekcje są zapamiętywane.
- **Własne benchmarki**: w Wykresach → Benchmarki → „Stwórz własny benchmark / stała stopa” (nazwa + % rocznie); linia przerywana obok indeksów (`settings.customBenchmarks`).
- **Przewalutowanie XTB 0,05%**: domyślnie dla IKE i rachunków w XTB (gdy pole konta jest puste), doliczane przy kupnie i potrącane przy sprzedaży; widoczne w Analizie TER (zapłacone + szacunek przy sprzedaży) i w kalkulatorze dopłat.
- **Porządki**: zakładka „Poduszka finansowa” (dawniej „Kapitał bezpieczny”); Dziennik ukryty w menu; OKI usunięte (migracja: puste konto znika, z historią → maklerskie); typ konta „Obligacje skarbowe”; przełącznik „Wliczaj podatek Belki (19%)” dla kont oszczędnościowych i obligacji; wybór banku (Revolut → podatek odroczony, rozliczenie w PIT); limity IKE/IKZE tylko dla bieżącego roku (ręcznie lub automatycznie po Nowym Roku).

## Import XTB, rejestr operacji, Portfel w układzie tabelarycznym

- **Import z XTB** (Rejestr Wpłat/Wypłat): plik .xlsx lub CSV z „Historii operacji gotówkowych”. Rozpoznawane: wpłaty (także IKE/IKZE), wypłaty, zakupy i sprzedaże (ilość i cena z komentarza „OPEN BUY 10 @ 66.88”), dywidendy, odsetki od wolnych środków i podatki (dopinane do dywidend/odsetek). Podgląd z mapowaniem symboli na instrumenty; ID operacji XTB chroni przed duplikatami. Excel czytany wbudowanym czytnikiem (`src/lib/xlsx.js`) – bez zewnętrznych bibliotek.
- **Dodaj operację**: dla kont maklerskich/IKE/IKZE wybór aktywa (opcjonalny przy wpłacie, wymagany przy kupnie/sprzedaży, z możliwością dodania nowego instrumentu); dla konta oszczędnościowego tryb „Ustal saldo” – różnica do podanej wartości jako wpłata lub odsetki.
- **Suwaki**: kliknięcie w wartość pozwala wpisać dokładną liczbę (jednostka zostaje obok).
- **Cele FIRE** w Ustawieniach; **Kalkulator Inteligentnej Dopłaty** w Symulacjach.
- **Benchmarki**: czyste nazwy (S&P 500, WIG20TR, MSCI World, Inflacja CPI, własne).
- **Dywidendy**: bez sekcji przypomnień; zwijane sekcje Kalendarz / Rejestr wypłat / Prognoza DGR.
- **Raport na X**: tydzień i miesiąc dosłownie wg szablonów („📊 Raport portfela | Tydzień N…”, „📊 Podsumowanie miesiąca:…”).
- **Portfel**: ciemny nagłówek, wiersz „Cały Portfel”, sekcje z opisem w jednej linii (wartość, zysk, wartość zakupu, zysk dzienny, zwrot, zmiana dzienna, udział), ikony operacji (kup, sprzedaj, historia, notowania), strzałki zmian, stopka „Razem (N)”.

## Zarządzanie historią i dopracowany Portfel

- **Usuń wszystkie transakcje** (Rejestr Wpłat/Wypłat → Zarządzanie danymi oraz Ustawienia → Kopia zapasowa): czyści transakcje, wpłaty/wypłaty, dywidendy i odsetki, harmonogram dywidend i migawki (opcjonalnie obligacje i listę instrumentów). Potwierdzenie: zaznaczenie „Rozumiem…” i wpisanie „USUŃ”; konta, ustawienia i cele zostają.
- **Portfel**: liczby jak we wzorcu (kropka dziesiętna, spacje tysięcy), wiersz „Cały Portfel” liczony jak fundusz (cena jednostki od 100, stopa TWR, liczba jednostek), jednoliniowe nazwy walorów z paskiem koloru konta, nagłówki sekcji w jednej linii, ikony operacji: kup, sprzedaj, historia transakcji, dywidendy (z kropką, gdy były wypłaty), wykres notowań, edycja waloru.

## Architektura danych (`src/state/schema.js`)

| Kolekcja | Zawartość |
|---|---|
| `accounts` | Konta: `IKE`, `IKZE`, `BROKERAGE`, `BONDS` (obligacje skarbowe), `SAVINGS` (bank, oprocentowanie, kapitalizacja); `belkaEnabled`, `belkaDeferred`, `fxConversionPct` |
| `instruments` | Akcje/ETF: ticker, symbol Yahoo (`.WA` dla GPW), waluta, TER |
| `trades` | Kupno/sprzedaż (cena, kurs waluty, prowizja) – z nich liczone są pozycje (średni koszt) |
| `cashflows` | Wpłaty/wypłaty własne – podstawa wkładu netto |
| `income` | Dywidendy/odsetki brutto + podatek u źródła; Belka 19% liczona automatycznie poza IKE/IKZE (można wyłączyć per konto/transza) |
| `bonds` | Obligacje EDO/COI/TOS/ROR: data zakupu, sztuki, oprocentowanie 1. roku, marża, inflacja |
| `otherAssets` | Nieruchomości/inne z przełącznikiem uwzględniania w majątku |
| `goals` | Cele roczne: kategoria, wartość docelowa i aktualna, źródło automatyczne (Etap 6) |
| `journal` | Dziennik decyzji inwestycyjnych (Etap 6) – dane zachowane, zakładka chwilowo ukryta w menu |
| `dividendSchedule` | Ogłoszone dywidendy: DPS, Ex-Date, wypłata, podatek u źródła, status księgowania (Etap 4) |
| `snapshots` | Dzienne migawki wartości i wkładu per konto oraz ceny instrumentów (historia, TWR, raporty okresowe) |
| `prices` | Notowania, kursy walut, status i dziennik odświeżania |
| `priceHistory` | Tygodniowa historia cen instrumentów, benchmarków i walut (Etap 3) |

**Prawdziwy Zysk Total** = Wartość portfela − wartość na początku okresu − wpłaty netto w okresie
= zysk kursowy + dywidendy netto + odsetki netto (wypłacone i naliczone w obligacjach).

Silnik obliczeń: `src/lib/engine.js`, podatki: `src/lib/tax.js`, obligacje: `src/lib/bonds.js`, notowania: `src/lib/prices.js`.

## Notowania

Kolejność źródeł: proxy Vite `/api/yahoo` → konfigurowalne proxy CORS → dane symulowane. Kursy walut: API NBP (tabela A) → Yahoo FX → symulacja.
