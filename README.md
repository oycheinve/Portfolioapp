# FinTrack – aplikacja do zarządzania majątkiem, portfelem, budżetem i zadaniami

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
- **Podsumowania w Wykresach** (dawna zakładka Statystyki): „Podsumowanie roku i miesiące” oraz „Lata kalendarzowe” to zwykłe pozycje listy „Wybierz wykres” (grupa Podsumowania) – po wyborze strona pokazuje tylko ten moduł. Liczone dla portfela inwestycyjnego. Linki `#/charts/year`, `#/charts/years`; stary `#/stats` prowadzi do Wykresów.
- **Wykresy**: centrum wykresów z benchmarkami i mapa cieplna dnia.
- **Kapitał bezpieczny** (nowa): obligacje, konta oszczędnościowe i gotówka na rachunkach w jednym module + odczyty CPI.
- **Notowania** (nowa): kursy, waluty i przelicznik. **FIRE** zawiera kartę dochodu pasywnego. **Raport na X** – sam generator.

## Przebudowa zakładek (Portfel, Wykresy, Dywidendy, Symulacje)

- **Portfel**: filtr w rozwijanym przycisku „Filtruj portfel”; tabela w zwijalnych sekcjach z kolumnami: Walor, Operacje (historia w oknie), Zmiana dzienna, Liczba jednostek, Śr. cena zakupu [PLN], Cena aktualna [PLN], Okres inwestycji, Wartość waloru [PLN], Udział [%], Stopa zwrotu [%], Zysk [PLN].
- **Pulpit**: tylko Majątek Całkowity z wykresem kołowym i podsumowanie kont.
- **Wykresy i notowania**: wybór wykresu z listy (wartość vs wkład, zysk, drawdown, dywidendy, mapa cieplna, notowania i waluty), obok wybór aktywów i benchmarków.
- **Dywidendy**: automatyczna synchronizacja (historia dywidend z Yahoo Finance; offline – prognoza z historii wypłat), opcjonalne automatyczne księgowanie wypłat; usunięto sekcję raportów/WZA (`src/lib/dividendSync.js`).
- **Symulacje i kalkulator** (nowa zakładka): Symulacja FIRE (opcje celu w zwijanym panelu, dochód pasywny), Stress test / Co jeśli, Kalkulator inwestycyjny (`src/lib/calculator.js`) – układ: dane wejściowe → wykres → wyniki.
- Dolny pasek na telefonie: Pulpit, Portfel, Wykresy, Budżet, Zadania, Więcej (pozostałe sekcje w arkuszu „Więcej”; kolejność w `MOBILE_ORDER` w `src/components/Layout.jsx`, menu boczne bez zmian). Stare adresy `#/fire`, `#/stress`, `#/quotes` przekierowują do nowych miejsc.

## Usprawnienia: Portfel, akordeony, własne benchmarki, koszty FX

- **Portfel**: wiersz „Cały portfel” na górze i na dole tabeli; kolumny: Walor (z ikonami operacji: dochód, sprzedaż, przewalutowanie), Operacje, Zmiana dzienna [%], Liczba jednostek, Śr. cena zakupu, Cena aktualna, Okres inwestycji [dni], Wartość, Udział [%], Stopa zwrotu, Zysk. Sekcje: Konta gotówkowe, Akcje GPW, ETF-y zagraniczne, ETF/ETC/ETN GPW, Obligacje skarbowe.
- **Akordeony**: Dywidendy (Kalendarz · Rejestr wypłat · Prognoza DGR), Alokacja (Wagi klas · Wagi instrumentów · Kalkulator dopłaty · Analiza TER). Rozwinięte sekcje są zapamiętywane.
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

## Import XTB z wyborem konta, Portfel na telefonie, kalkulator ETF

- **Import z XTB**: najpierw wybór konta docelowego z listy (lub „Nowe konto XTB”), potem plik; konto można zmienić także po wczytaniu. Rozpoznawanie typów po polsku i angielsku (wpłata, wypłata, kupno, sprzedaż, dywidenda, odsetki, podatki, prowizje – prowizja dopinana do transakcji z tego dnia, symbol podatku odczytywany z komentarza). Podgląd: liczniki typów i tabela rozpoznanych operacji.
- **Portfel na telefonie**: przełącznik Tabela / Karty; tabela przewijana w poziomie z przypiętą kolumną „Walor” i przyklejonym opisem sekcji.
- **Dywidendy**: zwijana lista z jedną rozwiniętą sekcją naraz – Podsumowanie, Kalendarz i przypomnienia (najbliższe 60 dni), Rejestr wypłat, Prognoza DGR, Automatyczne dane dywidend (synchronizacja działa przy otwarciu zakładki).
- **Raport na X**: miesięczny szablon dosłownie („📊Podsumowanie miesiąca:” …) i wyłącznie dla pełnych, zamkniętych miesięcy.
- **Wagi instrumentów**: tylko aktywa obecne w portfelu (wartość > 0 zł) – w Alokacji, kalkulatorze dopłat i liście aktywów w Wykresach.
- **Kalkulator opłacalności ETF** (Symulacje): porównanie do 5 ETF-ów – TER, przewalutowanie XTB 0,05% (kupno i sprzedaż), podatek wg konta; wykres utraconego wyniku lub wartości, tabela z kosztem TER/FX, stopą netto i różnicą do najtańszego; pod spodem analiza TER ETF-ów z portfela.

## Obligacje bez ujemnej gotówki, import otwartych pozycji XTB

- **Gotówka zawsze ≥ 0**: gdy zakup (akcje, ETF, obligacje – także różnica groszowa z zaokrągleń) przekracza gotówkę na koncie, aplikacja dopisuje automatyczną wpłatę „Uzupełnienie środków” na dokładnie brakującą kwotę (oznaczenie „auto · uzupełnienie” w rejestrze). Liczone od nowa przy każdej zmianie; ręczna wpłata przed zakupem sprawia, że automatyczna znika. Wyjątek: konta oznaczone jako „Konto debetowe” w ustawieniach konta.
- **Import XTB – „Open Positions”**: z raportu .xlsx importowane są wyłącznie otwarte pozycje: każda transza jako kupno (ID pozycji, data i cena otwarcia, koszt w PLN = wartość − zysk netto wg XTB), ceny bieżące z raportu jako notowania (do czasu odświeżenia z Yahoo), opcjonalnie wpłaty pokrywające zakupy i zastąpienie dotychczasowych transakcji konta. Ponowny import aktualizuje transze i usuwa sprzedane. Waluta instrumentu wykrywana z relacji wartość PLN / cena. Pliki CSV bez tego arkusza – historia operacji gotówkowych (obsługa formatu „OPEN BUY LPP.PL 0.0011 @ 25200.00” i kolumny Ticker).

## Pasy sekcji w Portfelu i gładkie wykresy

- **Portfel**: wiersz sekcji to jeden zwarty pas – nazwa i liczba pozycji w kolumnie „Walor”, a zmiana dzienna, okres, wartość, udział, stopa zwrotu i zysk w swoich kolumnach (pełny opis w podpowiedzi). W widoku kart nagłówek sekcji: nazwa + wartość oraz linia z zyskiem, zwrotem, zmianą dzienną i udziałem.
- **Wykresy**: wszystkie linie i obszary wygładzone (`type="monotone"`).
- Po imporcie z XTB zapisane migawki historii są czyszczone, aby wykresy liczyły się od nowa z zaimportowanych transakcji.

## Stabilne pobieranie z Yahoo Finance

- **Trasy (bez blokady CORS)**: 1) `/api/yahoo?path=…` – funkcja serwerowa Vercel (`api/yahoo.js`) z tej samej domeny co aplikacja; lokalnie ta sama logika działa w serwerze Vite (dev i preview); 2) opcjonalne własne proxy z ustawień; 3) publiczne proxy: corsproxy.io, allorigins, codetabs. Działająca trasa jest zapamiętywana, niedziałające odpoczywają 5 minut; najwyżej 3–4 zapytania naraz. Funkcja serwerowa przepuszcza wyłącznie zapytania o wykresy (`/v8/finance/chart/…`).
- **Tickery**: automatyczna normalizacja – GPW `.WA`, Xetra `.DE`, Londyn `.L`, USA bez końcówki; końcówki XTB (`.PL`, `.UK`, `.US`, `.NL`…) zamieniane przy pobieraniu; instrument bez symbolu → ticker + `.WA` dla PLN.
- **Bez sieci**: ostatnie znane notowanie (bez zmiany dziennej) albo cena z ostatniej transakcji; kursy walut z ostatnich danych. Brak komunikatów o błędach – tylko status w nagłówku („Kursy z ostatnich danych”). Wykresy korzystają z migawek i rekonstrukcji z transakcji. Tryb „Tylko dane symulowane” działa jak dotąd.

## Kwoty dywidend z rejestru (naprawa „0 zł”)

- Import raportu XTB z arkuszem „Open Positions” pobiera też dywidendy, podatki u źródła i odsetki z arkusza „Cash Operations” (opcja zaznaczona domyślnie) – rejestr wypłat nie jest pusty. Spółki już sprzedane dostają instrumenty, aby ich dywidendy trafiły do historii.
- Przy każdej dywidendzie z XTB zapisywana jest stawka na akcję z komentarza („DIG.PL PLN 5.0/ SHR”). DPS = brutto / liczba sztuk z transakcji, a gdy liczby sztuk nie da się odtworzyć – zapisana stawka (przeliczona na PLN), więc prognoza 12 mies., stopa dywidendy i prognoza z historii nie spadają do 0.
- Wpisy harmonogramu z Yahoo bez kwoty są pomijane, a prognoza opiera się wtedy na rejestrze wypłat; sumy w kalendarzu i kafelkach odporne na brakujące wartości. „Średnia miesięczna” liczona z ostatnich 12 miesięcy.

## Portfel inwestycyjny vs poduszka, prawdziwy zysk, dywidendy bez klikania, cele „w dół”

- **Zysk Total %** = (wartość + wypłaty − wpłaty) / kapitał zaangażowany (wartość na start okresu + wpłaty w okresie). Dywidendy i odsetki są już w wartości (gotówka), więc nie są liczone podwójnie. Dawna stopa Modified Dietz zawyżała wynik przy dużych wpłatach pod koniec okresu (np. 45% zamiast 23%); jest dostępna w podpowiedzi jako MWR. TWR liczony z miesięcznych wycen (migawki lub ceny historyczne) – bez skoków przy braku migawek. Wartość na start okresu bez migawki wyceniana cenami historycznymi.
- **Poduszka finansowa** = konta oszczędnościowe i konta obligacji skarbowych. Portfel inwestycyjny = pozostałe konta (także ich wolna gotówka). Alokacja domyślnie dla portfela inwestycyjnego; w Portfelu wiersze „↳ Portfel inwestycyjny” i „↳ Poduszka finansowa”; cele: wpłaty liczone dla portfela inwestycyjnego, nowe źródła „Wartość portfela inwestycyjnego” i „Poduszka finansowa”.
- **Dywidendy historycznie**: DPS z liczby akcji na koncie, na które wpłynęła wypłata, w dniu przed wypłatą; harmonogram – akcje na każdym koncie przed dniem dywidendy; spółki sprzedane mają dywidendy tylko sprzed sprzedaży.
- **Bez „Zaksięguj”**: wypłaty z rejestru (np. import XTB) parowane z harmonogramem Yahoo/historii (ta sama spółka, okno dni), pozostałe księgowane automatycznie po dniu wypłaty; gdy później przyjdzie prawdziwa wypłata z XTB, automatyczny wpis jest zastępowany. Synchronizacja dywidend także po starcie aplikacji (raz na 12 h, w godzinach sesji).
- **Cele**: kierunek automatyczny (docelowa niższa niż wartość startowa = cel „w dół”) lub wybrany ręcznie; postęp liczony od wartości startowej, cel osiągnięty dopiero po spadku do wartości docelowej.

## Limit IKE przy rotacji, zakres raportu na X, nieruchomości, odświeżanie kursów

- **Limit IKE/IKZE przy rotacji**: do limitu liczą się wyłącznie prawdziwe wpłaty z bieżącego roku. Automatyczne pokrycie zakupów (`AUTO_FUND`, import otwartych pozycji) nie jest wpłatą – gdy konto ma tylko takie wpisy, limit = pokrycia − przychody ze sprzedaży w roku, więc sprzedaż i odkupienie (rotacja) daje bilans 0 zł. Import arkusza „Open Positions” może pobrać rzeczywiste wpłaty z „Cash Operations” (domyślnie, gdy są w pliku) zamiast pokrycia każdej transzy.
- **Raport na X – zakres**: domyślnie tylko konta IKE i wyłącznie akcje + ETF-y (bez gotówki i obligacji). Panel z checkboxami (konta, rodzaje aktywów, przycisk „Domyślnie: tylko IKE”) zmienia wartość portfela, zysk, wynik okresu, najlepsze/najsłabsze spółki i wykres na karcie; wybór zapamiętywany w przeglądarce.
- **Nieruchomości i ruchomości** zawsze wliczają się do Majątku Całkowitego (pulpit, udział poduszki, stress test). Przełącznik przy pozycji („Pokaż w zakładce Portfel”) i globalny przełącznik w ustawieniach decydują tylko o widoczności w zakładce Portfel. Nowa kategoria „Ruchomość (sprzęt, wyposażenie)”.
- **Odświeżanie kursów** wyłącznie przy wejściu do aplikacji (start, powrót do karty lub okna) i tylko w godzinach sesji GPW: pn–pt 9:00–16:50 czasu polskiego (najczęściej raz na 5 minut). Brak timerów w tle. Automatyczna synchronizacja dywidend i historii cen też tylko w godzinach sesji (wyjątek: pierwsze pobranie, gdy danych jeszcze nie ma). Ręczne „Odśwież kursy” działa zawsze.
- **Portfel**: sekcje w kolejności Akcje → ETF → Obligacje → Konta gotówkowe/oszczędnościowe → Nieruchomości. **Wykresy dywidend**: grubsze słupki (miesięczne i roczne).

## Cele od stanu startowego, obligacje wbudowane, zamknięte pozycje XTB, logotypy

- **Postęp celów** liczony od wartości w chwili ustawienia celu: cel 450 przy starcie 435 → 435 = 0%, 442,5 = 50%, 450 = 100%. Liczniki roczne (wpłaty, dywidendy, limit) startują od 0.
- **Struktura majątku**: w środku wykresu kołowego kwota łącznego majątku.
- **Obligacje skarbowe i konta oszczędnościowe – wbudowane instrumenty poduszki**. W ustawieniach tworzy się tylko konta inwestycyjne (IKE, IKZE, maklerskie). Obligacje trafiają do jednego rejestru „Obligacje skarbowe” (osobna kategoria, nigdy w IKE/IKZE); konta oszczędnościowe dodaje się i edytuje w zakładce Poduszka finansowa. Migracja: kilka kont obligacji scalanych w jedno, transze z IKE/IKZE/maklerskiego przenoszone do rejestru (z wypłatą kosztu zakupu z konta źródłowego). Poduszka pokazuje dwie podkategorie z rozbiciem (transze, konta) i sumą.
- **Zamknięte pozycje XTB** (arkusz „Closed Positions”): przy imporcie otwartych pozycji dołączane domyślnie jako kupno + sprzedaż każdej transzy z wartościami w PLN z raportu. Sprzedaż zdejmuje koszt tej transzy (`costBasisPLN`), więc koszt otwartych pozycji zgadza się z XTB, a zrealizowany wynik = wynik z raportu. Dzięki temu znane są akcje posiadane w dniu dywidendy także dla spółek sprzedanych.
- **Dywidendy sprzedanych spółek** liczone we wszystkich sumach – także w wyniku okresu raportu na X (wcześniej pomijane, gdy spółki nie było w portfelu na początku ani na końcu okresu).
- **Limit IKE/IKZE**: prawdziwe wpłaty z „Cash Operations” (domyślny tryb importu). Bez nich: automatyczne uzupełnienia (rotacja już daje 0 zł) + wpłaty „na transzę” pomniejszone o sprzedaże. Uzupełnienia zaokrąglane w górę do grosza – gotówka nie spada do −0,02 zł.
- **Logotypy na karcie raportu X**: obok nazw spółek na liście największych ruchów. Domena z edycji waloru („Strona firmy”) albo z wbudowanej listy (GPW, USA, emitenci ETF); ikona pobierana przez `/api/logo` (funkcja Vercel / middleware Vite) lub publiczne proxy i osadzana jako data URI – eksport PNG zawiera logo. Bez logo – monogram.

## Konto oszczędnościowe bez banku, podatek odroczony w ustawieniach

- **Konto oszczędnościowe** – jeden uniwersalny instrument poduszki o nazwie „Konto oszczędnościowe” (przy kilku kontach z numerem). Bez wyboru banku: w formularzu tylko data otwarcia, Belka, oprocentowanie i kapitalizacja. Starsze nazwy z bankiem („Konto oszczędnościowe – ING”) zmieniane automatycznie.
- **Podatek Belki odroczony (np. Revolut)** – przełącznik dla każdego konta maklerskiego i konta oszczędnościowego na dole sekcji kont w zakładce Ustawienia (dochody brutto, 19% rozliczane w PIT-38).

## Panel statystyk na Pulpicie, limit IKE z pliku, daty dywidend, wykresy

- **Panel statystyk na górze Pulpitu**: wartość, wkład własny, zysk całkowity (z dywidendami), stopa zwrotu z przełącznikiem Prosta / TWR / MWR (ze średnią roczną), zmiana i zysk dzienny (z notowań), zmiana tygodniowa i miesięczna, od początku roku, CAGR, zysk bieżący (niezrealizowany), walory z zyskiem / ze stratą. Zakres: portfel inwestycyjny (domyślnie), całościowy z poduszką albo sama poduszka.
- **Portfel**: tabela bez wierszy „Portfel inwestycyjny” i „Poduszka finansowa” – zaczyna się od grup aktywów.
- **Limit IKE/IKZE** = wyłącznie faktyczne wpłaty z bieżącego roku: gdy są wpłaty z pliku XTB („IKE deposit” z Cash Operations) – tylko one; bez importu – wpłaty ręczne. Wpłaty techniczne i rotacja kapitału nie są liczone. Przy braku faktycznych wpłat karta limitów podpowiada import raportu.
- **Dywidendy po konkretnej dacie**: wypłata z rejestru paruje się z pozycją harmonogramu tylko od dnia dywidendy do kilku dni po dniu wypłaty (wcześniejsza rata tej samej spółki nie oznacza kolejnej jako wypłaconej); wcześniejsze błędne parowania są cofane. Kalendarz – przeszłość: wszystkie faktycznie otrzymane wypłaty, także od spółek już sprzedanych (sprzed sprzedaży); przyszłość (w drodze, ogłoszone, prognozy), przypomnienia i synchronizacja harmonogramu – tylko spółki obecnie w portfelu.
- **Wykresy**: „Wartość vs wkład” bez benchmarków; „Zysk w czasie” z listą wyboru: zysk total / zysk kursowy (PLN) / stopa TWR – jedna seria zamiast dublujących się linii. Odsetki w statystykach, wykresach, raportach i dochodzie pasywnym – tylko z obligacji i konta oszczędnościowego (odsetki od wolnych środków na kontach inwestycyjnych zostają w gotówce konta).

## Wykup obligacji, kalkulator obligacyjny, saldo konta oszczędnościowego

- **Obligacje – tylko aktywne transze**: rejestr obligacji nie ma gotówki (pojęcie „gotówki z kuponów” usunięte). Zakup transzy to wpływ kapitału do rejestru; kupony i wykup w terminie opuszczają portfel bez żadnego zapisu – środki księgujesz sam tam, gdzie trafiły. W wyniku i stopach zwrotu zysk transzy = odsetki; kupony i wykupy nie są liczone jako wypłaty. Dawne wpłaty/wypłaty na koncie obligacji i automatyczne zapisy wykupu są usuwane przy wczytaniu; rejestr obligacji nie występuje w rejestrze wpłat/wypłat ani w formularzu operacji.
- **Kalkulator obligacyjny** (Symulacje): OTS, ROR, DOR, TOS, COI, EDO dla kwoty, miesiąca zakupu i horyzontu w miesiącach (suwak + skróty). Przedterminowy wykup z opłatą za każdą obligację (nie wyższą niż naliczone odsetki), podatek Belki od zysku po opłacie, reinwestycja po wykupie w terminie, kupony COI/ROR/DOR. Inflacja z miesięcznych odczytów CPI (tabela z możliwością wpisywania odczytów miesiąc po miesiącu – także w kalkulatorze), dla przyszłych miesięcy – założenie; stopa NBP dla ROR/DOR. Wynik: wartość netto, zysk, stopa roczna, wynik realny, opłaty; wykres wartości przy wykupie w każdym miesiącu i wskazanie najlepszej obligacji. Parametry ofert edytowalne.
- **Konto oszczędnościowe**: brak wpłat/wypłat – w formularzu operacji tylko „Ustal saldo” (zmiana salda albo dopisanie odsetek). Ręczne zmiany salda nie trafiają do rejestru wpłat/wypłat ani do sum wpłat i wypłat w statystykach i raportach; w wyniku i statystykach saldo tego konta zmienia się wyłącznie o odsetki.

## Kalkulator IKZE

- Symulacje → „Kalkulator IKZE”: forma opodatkowania (skala 12%/32% z progiem 120 tys. zł liczonym z dochodu i jego wzrostu, liniowy 19%, ryczałt – odliczenie od przychodu wg stawki), działalność gospodarcza (limit JDG), wpłata pełnego limitu lub własnej kwoty, wzrost limitu r/r, stopa zwrotu, horyzont.
- Reinwestycja zwrotu podatku: zwrot za rok N wpływa po rozliczeniu PIT i trafia do IKZE dopiero w roku N+1 (pierwszy rok bez reinwestycji). Jeśli razem z wpłatą własną mieści się w limicie roku – cały idzie na IKZE (i daje kolejny zwrot); nadwyżka ponad limit trafia na nieoprocentowane konto gotówkowe. Bez reinwestycji cały zwrot zostaje na koncie gotówkowym.
- Wynik: zwrot podatku w bieżącym roku, wpłaty własne, zwroty (w IKZE / na gotówce), wartość IKZE i zysk, IKZE netto po 10% podatku przy wypłacie, przewaga nad zwykłym kontem (te same wpłaty własne, Belka 19%); wykres kapitału, gotówki i porównania w czasie oraz tabela rok po roku (limit, wpłata własna, zwrot reinwestowany, nadwyżka na gotówkę, zwrot za rok, wartość IKZE, gotówka).

## Kopia zapasowa (Ustawienia)

- Na dole zakładki Ustawienia: „Pobierz kopię zapasową (JSON)” – cały stan (konta, transakcje, wpłaty, dywidendy, obligacje, cele, ustawienia) oraz ustawienia widoków i kalkulatorów w jednym pliku; „Wczytaj kopię zapasową” – podgląd i walidacja pliku, potem przywrócenie danych (np. po wyczyszczeniu przeglądarki lub na innym urządzeniu).
- Wczytywanie jest wyrozumiałe dla starszych kopii: brakujące lub inaczej nazwane pola rekordów dostają wartości domyślne (np. `type` → `side` w transakcji, brak id, liczby jako tekst, daty z godziną lub „dd.mm.rrrr”, wpłata/wypłata ze znaku kwoty, nieznany typ konta → maklerskie). Rekordy bez daty są pomijane z ostrzeżeniem; braki nie blokują „Przywróć dane z kopii”.

## Skład portfela (Wykresy)

- Nowy wykres „Skład portfela” (grupa Portfel): wykres kołowy z udziałem procentowym walorów – spółki i ETF-y zsumowane ze wszystkich kont, obligacje per seria, konta gotówkowe/oszczędnościowe per konto, nieruchomości (jeśli widoczne w Portfelu). Nad wykresem panel filtrów z checkboxami: grupy (spółki, ETF-y, obligacje, konta, nieruchomości) i pojedyncze pozycje, „Zaznacz / Odznacz wszystko”; udziały i suma przeliczają się dynamicznie, wybór jest zapamiętywany.

## Pobieranie kursów z Yahoo – trasy zapasowe i diagnostyka

- `fetchYahooData` (src/lib/yahooFetch.js): serwer aplikacji `/api/yahoo` → proxy z ustawień → publiczne proxy CORS (corsproxy.io, allorigins raw i get, codetabs, cors.lol, thingproxy); przy błędzie HTTP danej trasy także druga domena Yahoo (query2). Działająca trasa zapamiętywana, niedziałające odpoczywają 90 s; gdy wszystkie zawiodły przed chwilą – szybkie przejście na dane awaryjne bez długiego czekania.
- Po każdym odświeżeniu subtelny komunikat: „Kursy pobrane na żywo z Yahoo Finance (n) · trasa: …”, częściowo na żywo / z danych awaryjnych albo „Yahoo Finance niedostępne – kursy z danych awaryjnych (ostatnie znane i ceny z transakcji)”. W konsoli podsumowanie `[Kursy]` z listą walorów, które nie przyszły na żywo, i powodami; historia zapytań w `window.__yahooDiag`.
- Mapowanie tickerów przed zapytaniem: końcówki XTB → Yahoo (`.PL` → `.WA`, `.UK` → `.L`, `.US` → bez końcówki, `.DE`, `.NL` → `.AS` itd.), także gdy końcówka jest w samym tickerze; ticker bez końcówki – giełda wg waluty (PLN `.WA`, EUR `.DE`, GBP `.L`, CHF `.SW`, USD bez końcówki).

## Klasy aktywów – wagi docelowe z Poduszką finansową

- W Alokacji klasy aktywów liczone są ze stanu faktycznego: akcje i ETF (oraz wolna gotówka) z kont w wybranym zakresie, a obligacje i konto oszczędnościowe zawsze z Poduszki finansowej – aktywne transze z rejestru obligacji i saldo konta oszczędnościowego (także przy zakresie „Portfel inwestycyjny”). Klasy: Akcje, ETF, Obligacje (Poduszka), Oszczędności i gotówka. Przy wyborze pojedynczego konta lub typu konta – tylko ten zakres. TER portfela liczony względem kont w zakresie.

## Słownik logotypów (raport na X)

- `LOGO_DICTIONARY` w `src/lib/logos.js`: ręczne przypisanie tickerów z portfela do grafik – ma pierwszeństwo przed domeną firmy i monogramem. Logotypy dostarczone jako pliki aplikacji w `public/logos/` (Digital Network – `dig.png`, cyber_Folks – `cbf.png` na żółtym tle, iShares – `ishares.png` dla CSPX/EIMI/IWDA/SXR8/EUNL) ładują się zawsze, bez sieci; pozostałe spółki z portfela (LPP, XTB, SNT, KTY, KRU, ACP, DIA i in.) – ikony stron pod stałymi adresami, pobierane przez `/api/logo?url=` lub publiczne proxy. Ticker spoza słownika → domena z edycji waloru / wbudowanej listy → monogram.

## Karta raportu na X – lider i maruder

- Grafika raportu pokazuje zamiast listy ruchów dwa walory okresu: największy wzrost i największy spadek (zmiana ceny w PLN), w dużych kafelkach z logotypem (słownik logotypów / domena / monogram), tickerem, nazwą i zmianą %. Przy jednym walorze – jeden kafelek. Tekst posta na X bez zmian.

## Syn2Bio poza rankingami podsumowań

- Walory z listy `SUMMARY_EXCLUDED_TICKERS` (src/lib/engine.js; obecnie Syn2Bio – S2B) są pomijane wyłącznie w rankingach podsumowań: najlepsza / najsłabsza spółka roku i miesiąca, lata kalendarzowe, ruchy w tekście posta na X oraz lider i maruder na grafice X. Transakcje, historia operacji, wycena konta, zyski, stopy zwrotu i sumy okresów liczą się z tym walorem normalnie.

## Opłata za przedterminowy wykup obligacji

- Kalkulator obligacyjny: dla każdej obligacji „zysk przed opłatą” (po podatku, gdyby opłaty nie było), „opłata za wykup” i „zysk na rękę” – po odjęciu opłaty od wypracowanych odsetek i podatku Belki od odsetek pomniejszonych o opłatę. Stopa roczna, wynik realny, wykres i wybór najlepszej obligacji liczone z kwoty na rękę. Opłata zgodnie z listem emisyjnym nie wyższa niż naliczone odsetki (nie zmniejsza wpłaconego kapitału).
- Rejestr obligacji (Poduszka): kolumna „Na rękę przy wykupie dziś” – nominał + naliczone odsetki − opłata za wykup (ROR 0,50 zł, TOS i COI 0,70 zł, EDO 2,00 zł za sztukę) − podatek; wycena portfela bez zmian.

## Kalkulator opłacalności ETF – waluta

- Wybór waluty kalkulatora (PLN / USD / EUR) – waluta konta, kwot (kapitał, wpłata miesięczna) i wyników; przy zmianie kwoty przeliczane po aktualnym kursie (NBP z modułu kursów). Każdy ETF ma walutę notowań (PLN / USD / EUR / GBP); przewalutowanie liczone tylko, gdy waluta ETF-u różni się od waluty kalkulatora. Wyniki, koszty, wykres i podpowiedzi w wybranej walucie z równowartością w złotych.

## Budżet miesięczny (Demo)

Zakładka „Budżet” (`#/budget`, na dolnym pasku i w menu bocznym; `src/views/Budget.jsx`, `src/lib/budget.js`): minimalistyczna tabela wzorowana na arkuszu Excel – „Budżet na: {miesiąc}”, granatowy nagłówek, kolumny Kategoria, Planowany Budżet, Kwota Wydana, Pozostało (plan − wydane, na czerwono po przekroczeniu) i wyróżniony wiersz RAZEM. Domyślnie tryb podglądu: komórki tylko do odczytu („2 300,00 zł”, nazwy zawijane), panel „Dodaj zakup” i kafelek „Na co dzień”. Przycisk „Edytuj” (ołówek, prawy górny róg) włącza tryb edycji na kopii roboczej: pola nazw, planu i kwoty wydanej, usuwanie wierszy (kosz), „Dodaj kategorię”, „Kopiuj plan”, „Wyczyść”; zmiana miesiąca zablokowana. „Zapisz” zapisuje zmiany (puste wiersze pomijane) i wraca do podglądu, „Anuluj” je odrzuca. Panel „Dodaj zakup” pod tabelą: lista kategorii z tabeli + kwota (także z przecinkiem) → „Dodaj do wydanych” dopisuje kwotę do Kwoty Wydanej, Pozostało i RAZEM przeliczają się automatycznie (Enter też zatwierdza; potwierdzenie z kwotą pozostałą). Kafelek „Na co dzień”: dni do końca miesiąca (z dzisiejszym) i średnia kwota dzienna do wydania w kategorii jedzeniowej (automatycznie „Jedzenie…”, do zmiany z listy) – np. „Do końca miesiąca pozostało 10 dni. Na „Jedzenie (Reszta)” możesz wydawać średnio 73,45 zł dziennie”. Miesiąc bez danych pokazuje przykładowe kategorie (zapis przy pierwszej zmianie). Trwałość: każda zmiana zapisywana od razu w przeglądarce; po zalogowaniu zmiana budżetu wysyła też ustawienia do chmury (zdarzenie `wealth-app-prefs-changed`), a niewysłane zmiany mają pierwszeństwo przed kopią z chmury – odświeżenie nie przywraca starszego budżetu. Dane w localStorage `wealth-app-budget-v1` – w kopii zapasowej JSON i ustawieniach synchronizowanych z chmurą; nie wpływają na portfel.

**Dodaj zakup – domyślna kategoria i podział paragonu** – lista kategorii startuje od „Jedzenie (Reszta)” (pierwsza kategoria ze słowem „Jedzenie”, a bez niej pierwsza z tabeli). „Podziel zakup” rozwija wiersze części (kategoria + kwota, „+ Dodaj kolejną kategorię”, × usuwa); części odejmują się od kwoty paragonu, a podsumowanie na żywo pokazuje „W kategorii głównej (…) zostanie: X zł (kwota − części)”. Suma części nie może przekroczyć kwoty paragonu. „Dodaj do wydanych” dopisuje jednym ruchem resztę do kategorii głównej i części do wskazanych kategorii; każda część to osobny wpis w „Ostatnich wpisach” (z tą samą notatką, osobno do cofnięcia).

**Ostatnie wpisy i kopiowanie planu** – pod „Dodaj zakup” zwijana sekcja „Ostatnie wpisy (N)”: 10 najnowszych zakupów miesiąca (kategoria, opcjonalna notatka z panelu zakupu, data i godzina, kwota); `×` cofa wpis – odejmuje kwotę od „Kwoty Wydanej” kategorii (nie poniżej zera). Dziennik w localStorage `wealth-app-budget-log-v1` (`{ 'RRRR-MM': [...] }`, do 200 wpisów na miesiąc) – w kopii zapasowej JSON i ustawieniach synchronizowanych z chmurą. Nowy, pusty miesiąc pokazuje baner „Kopiuj plan z poprzedniego miesiąca” (kategorie i kwoty planowane z ostatniego wcześniejszego miesiąca z danymi, wydane = 0,00 zł); w trybie „Edytuj” przyciski „Kopiuj plan z poprzedniego miesiąca” i „Wyzeruj wydane” (po zapisie dziennik miesiąca jest czyszczony, bo nie odpowiada już tabeli).

## FIRE {rok} i porządek w „Więcej”

- **FIRE {rok docelowy}** (`#/fire`, `src/views/FireGoal.jsx`) – osobna sekcja w „Więcej” i w menu bocznym (nazwa z rokiem z celów FIRE): pierścień „osiągnięte”, główny wskaźnik „Do celu FIRE brakuje X%” wg kryterium (oba cele / dochód / majątek), karty postępu majątku i miesięcznego dochodu pasywnego (z kwotą brakującą), szacowany termin osiągnięcia z symulacji FIRE, przyciski „Symulacja i projekcja FIRE” i „Zmień cele FIRE” (`#/settings/fire`). Dawny adres `#/fire` prowadzi teraz tutaj (symulacja: `#/simulations/fire`).
- **Wykres prognozy FIRE** (`src/components/fire/FireProjectionChart.jsx`, w widoku FIRE i w symulacji FIRE): majątek i dochód pasywny na liniowej osi czasu kończącej się w miesiącu, w którym wybrany scenariusz osiąga cel FIRE (wg kryterium z ustawień) – wcześniej lub później niż rok docelowy; znacznik „FIRE” w punkcie osiągnięcia, pionowa linia roku docelowego (gdy wypada przed końcem), scenariusze skrajne ucięte w tym samym miejscu; bez osiągnięcia celu – prognoza do 2100 z komunikatem (`fireChartPoints` w `src/lib/fire.js`).
- **Ustawienia** – wszystkie sekcje (Konta inwestycyjne, Podatki, Notowania, Limity IKE/IKZE, Cele FIRE, Nieruchomości, Chmura, Kopia zapasowa) jako jednoliniowe belki z nazwą i strzałką, domyślnie zwinięte; kliknięcie płynnie rozwija / zwija sekcję (opis i przyciski sekcji widoczne po rozwinięciu). Mechanizm: `Card` z `collapsible` albo `CardCollapseContext` (włączony w widoku Ustawień); `#/settings/fire` otwiera Cele FIRE.
- **Dolny pasek (telefon)**: Pulpit, Portfel, Zakupy, Budżet, Zadania, Newsy, Więcej (`MOBILE_ORDER` w `Layout.jsx`). Wykresy i notowania – pierwszy kafelek w „Więcej” (oraz w menu bocznym na komputerze).
- **„Więcej” – płaska siatka 2 kolumn** (`MORE_ORDER` w `Layout.jsx`): Wykresy i notowania, Cele roczne, FIRE, Poduszka finansowa, Symulacje i kalkulator, Dywidendy; na dole przełącznik motywu, a tuż obok przycisk **Ustawienia**.
- **Rejestr wpłat i wypłat** – w Ustawieniach: Portfel i Aktywa → „Rejestr wpłat i wypłat” (`#/settings/cash`; dawny adres `#/cash` prowadzi tutaj); bez osobnej pozycji w menu.
- **Konta i ustawienia – trzy kategorie** (`src/views/Settings.jsx`): 💼 Portfel i Aktywa, 📈 Strategie, Cele i Giełda, ⚙️ System i Konto – akordeon, domyślnie zwinięty, otwarta najwyżej jedna kategoria (otwarcie innej zwija poprzednią). W środku płaskie kafelki podkategorii (bez rozwijania): kliknięcie otwiera osobny widok sekcji `#/settings/<id>` (`accounts`, `other-assets`, `limits`, `fire`, `tax`, `prices`, `cloud`, `notifications`, `backup`) z przyciskiem „← Konta i ustawienia”; po powrocie otwarta jest kategoria ostatniej sekcji. Skróty z aplikacji prowadzą wprost do sekcji (np. „Dodaj konto” na Pulpicie → konta, ikona chmury → konto i chmura, „Zmień cele FIRE” → Cele FIRE, dawny `#/notifications` → Powiadomienia).
- **Zadania – panel „Konsekwencja”**: pierścień z wynikiem bieżącego okresu (zielony ≥80%, bursztynowy ≥50%, czerwony niżej), znacznik „Ostatnie 30 dni” i trzy kolumny z akcentami: dziś – błękit, tydzień – fiolet, miesiąc – bursztyn. Zadania jednorazowe są zawsze rozwinięte.
- **Zadania – widok uproszczony**: bez etykiety „Zapis w chmurze / w przeglądarce” pod paskiem postępu; „Zaplanowane” oraz archiwum / historia („Archiwum tygodni”, „Historia dni”, „Historia miesięcy”) jako minimalistyczne akordeony z licznikiem i dyskretną strzałką, domyślnie zwinięte (`src/components/tasks/TaskAccordion.jsx`); mniejsze odstępy.
- **Konta i ustawienia** – ikona koła zębatego na górnym pasku, tuż obok przełącznika motywu (telefon i desktop; podświetlona, gdy widok jest otwarty). Prowadzi do `#/settings` (logowanie i chmura Supabase, konta, import XTB, kopie zapasowe, skrót do powiadomień); nie ma już osobnej pozycji w menu bocznym ani kafelka w „Więcej” (`topbar: true` w `NAV_ITEMS`).

## Odświeżony wygląd (UI)

- **Więcej** (telefon): arkusz z uchwytem, dwukolumnowa siatka zaokrąglonych kart z ikoną w kółku (te same sekcje co dotąd), przełącznik motywu (jasny / ciemny / systemowy) na dole.
- **Kalkulator Inteligentnej Dopłaty**: duże pole kwoty z dopiskiem PLN, szybkie kwoty 500 / 1000 / 1500 / 3000 jako pill-buttony, „min. zlecenie”, przycisk „Kopiuj plan” i tabela rozbicia Aktywo / Teraz / Cel / Dokup (wszystkie walory; bez zakupu – wyszarzone). Algorytm water-filling bez zmian.
- **Mapa cieplna dnia**: kafelki proporcjonalne do wartości pozycji, pastelowe zielenie (wzrost) i róże/czerwienie (spadek) w skali −2% … +2%, ticker z kropką koloru waloru i zmiana %.
- **Pasywny dochód** (Pulpit, `PassiveIncomeTile`): prognoza netto z posiadanych jednostek „X PLN / mc”, suma roczna i otrzymane łącznie, paski postępu celów (dywidendy / dochód pasywny z Celów rocznych, cel FIRE), karty „Ostatnie 12 mies.” i „W drodze”, przycisk „Projekcja” (symulacja FIRE).

## Kalkulator PPK (Symulacje)

`src/lib/ppkCalc.js`, `src/components/simulations/PpkCalculator.jsx` – symulacja miesiąc po miesiącu:
- wpłaty od wynagrodzenia brutto (rosnącego o założony % rocznie): pracownik 0,5–4% (domyślnie 2%; poniżej 2% tylko przy wynagrodzeniu ≤ 1,2× płacy minimalnej), pracodawca 1,5–4% (1,5% + dodatkowa do 2,5%);
- dopłaty państwa: powitalna 250 zł po 3 miesiącach (do wyłączenia) i roczna 240 zł, gdy wpłaty w roku ≥ 3,5% sześciokrotności płacy minimalnej (przy obniżonej składce – 25% progu);
- stopa zwrotu funduszu pomniejszona o opłatę za zarządzanie; horyzont w latach albo do wieku docelowego;
- wyniki: kapitał końcowy, trzy filary (pracownik / pracodawca / państwo + zyski), koszt z własnej kieszeni (wpłaty + PIT od wpłat pracodawcy), mnożnik „za 1 zł własną”, wypłata po 60. r.ż. (25% + 120 rat), wykres skumulowany i tabela rok po roku. Domyślne wynagrodzenie = przeciętne (limit IKE / 3); parametry zapamiętywane (także w kopii i chmurze).

## Bezpieczny ponowny import z XTB (bez duplikatów)

Zaktualizowany plik z XTB można wgrywać wielokrotnie – dodawane są wyłącznie nowe operacje (`src/lib/importDedupe.js`):
- operacja z poprzedniego importu rozpoznawana po ID operacji XTB; plik bez kolumny ID dostaje identyfikatory z treści (data, czas, typ, kwota, symbol, komentarz), a nie z numeru wiersza – przesunięcie wierszy w nowszym pliku nie tworzy duplikatów;
- operacja już obecna pod innym identyfikatorem (wpis ręczny, import innego arkusza: historia operacji ↔ otwarte/zamknięte pozycje) rozpoznawana po treści: konto, data, czas (gdy oba wpisy go mają), ticker, rodzaj, liczba jednostek i cena / kwota; dopasowanie jeden do jednego;
- zlecenia realizowane w częściach (jedna transza w raporcie pozycji = kilka realizacji w historii operacji) dopasowywane grupowo: suma jednostek i średnia cena z tego samego dnia;
- wpisy techniczne (automatyczne „Uzupełnienie środków”, dywidendy zaksięgowane z harmonogramu) nie blokują prawdziwych operacji z pliku;
- import zapamiętuje godzinę operacji – sprzedaż i kupno z tego samego dnia liczone w prawidłowej kolejności (sprzedaż przekraczająca stan posiadania, po której tego dnia jest kupno, liczona po nim).

Zakupy z importu finansowane z wolnych środków (wpłaty, dywidendy, sprzedaże) nie tworzą dopłat – automatyczne uzupełnienie powstaje tylko na faktyczny niedobór gotówki.

## Wolne środki, dywidendy i źródła zakupów

- **Wolne środki na IKE / IKZE / rachunku maklerskim** są częścią wartości tego konta (portfel inwestycyjny). W Portfelu mają osobną sekcję „Wolne środki na kontach inwestycyjnych” (filtr „Portfel inwestycyjny”), a nie trafiają do „Kont oszczędnościowych” ani do Poduszki finansowej. Na Pulpicie: „Wolne środki (IKE, IKZE, makl.)” osobno od „Oszczędności”.
- **Zmiana dnia wypłaty po zaksięgowaniu** (np. LPP przesunięte na 30.10): uzgadnianie harmonogramu (`reconcileDividends`) cofa księgowanie, gdy dzień wypłaty jest w przyszłości – kwota znika z wolnych środków i sumy otrzymanych dywidend, pozycja wraca do „W drodze”; zmiana na inny miniony dzień przeksięgowuje wpis na nową datę. Status „Wypłacona”, kalendarz, historia DPS, lista wypłat waloru i zestawienia liczą wyłącznie przychody z datą ≤ dziś.
- **Dywidendy zasilają wolne środki dopiero w dniu faktycznej wypłaty.** Przychody z datą w przyszłości nie liczą się do gotówki; automatycznie księgowane są wyłącznie wypłaty z potwierdzonym dniem wypłaty, który już minął. Przy szacowanym dniu wypłaty – tylko ręczne „Zaksięguj” po otrzymaniu środków (data = dzień potwierdzenia).
- **Zakup z wolnych środków nie jest wpłatą.** Kupno opłacone z gotówki konta (wcześniejsze wpłaty, dywidendy, sprzedaż) tylko zmniejsza wolne środki. Automatyczne „Uzupełnienie środków” powstaje wyłącznie na brakującą część zakupu. Import otwartych pozycji XTB nie tworzy już wpłat na pełny koszt każdej transzy (dawne wpłaty `xtbposfund_…` są usuwane przy wczytaniu danych i zastępowane faktycznym niedoborem).

## Konta użytkowników i synchronizacja w chmurze (Supabase)

Logowanie i rejestracja e-mail + hasło (z resetem hasła), dane portfela zapisane w bazie przypisanej do konta.

**Konfiguracja (jednorazowo):**
1. Załóż bezpłatny projekt na [supabase.com](https://supabase.com).
2. W projekcie: *SQL Editor* → wklej i uruchom `supabase/schema.sql` (tabela `portfolios` + Row Level Security – każdy użytkownik widzi wyłącznie swój wiersz).
3. *Project Settings → API*: skopiuj *Project URL* i klucz *anon public* do zmiennych `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (plik `.env.local` lokalnie albo zmienne środowiskowe hostingu, np. Vercel – wzór w `.env.example`). Alternatywnie wpisz je w aplikacji: Ustawienia → „Konto i synchronizacja w chmurze”.
4. *Authentication → URL Configuration*: ustaw *Site URL* na adres aplikacji (linki potwierdzające e-mail i reset hasła). Potwierdzanie adresu e-mail można wyłączyć w *Authentication → Providers → Email*.

**Działanie:**
- Bez konfiguracji aplikacja działa jak dotąd – dane tylko w tej przeglądarce. Z konfiguracją: ekran logowania przed startem, z opcją „Kontynuuj bez konta”.
- Po zalogowaniu stan portfela (transakcje, konta, obligacje, dywidendy, cele, ustawienia oraz ustawienia widoków i kalkulatorów) pobierany jest z chmury; każda zmiana zapisuje się w bazie po ~1 s. Ikona chmury w nagłówku pokazuje stan (zsynchronizowano / zapisywanie / błąd).
- Pierwsze logowanie na nowe konto przenosi do chmury dane z tej przeglądarki. Dane innego użytkownika z tej samej przeglądarki nigdy nie są przenoszone.
- localStorage pozostaje kopią roboczą: praca bez internetu, zaległe zmiany wysyłane automatycznie po odzyskaniu połączenia (ponawianie co 30 s i przy zdarzeniu `online`).
- Kilka urządzeń: po powrocie do aplikacji pobierana jest nowsza wersja z chmury; przed każdym zapisem sprawdzane jest, czy inne urządzenie nie zapisało nowszej wersji (wtedy wygrywa wersja z chmury, a lokalne zmiany trafiają do kopii awaryjnej `portfolio-cloud-conflict-backup`).
- Wylogowanie wysyła zaległe zmiany i usuwa dane portfela z tej przeglądarki (zostają w chmurze).
- Kopia zapasowa JSON w Ustawieniach działa bez zmian (eksport / import – po zalogowaniu wczytana kopia od razu trafia do chmury).

Pliki: `src/lib/cloud.js` (klient Supabase, ładowany dopiero przy skonfigurowanej chmurze), `src/components/auth/AuthGate.jsx` (ekran logowania i pobranie danych), `src/state/useCloudSync.js` (synchronizacja), `src/components/settings/CloudCard.jsx`, `supabase/schema.sql`.

## Architektura danych (`src/state/schema.js`)

| Kolekcja | Zawartość |
|---|---|
| `accounts` | Konta: `IKE`, `IKZE`, `BROKERAGE`; wbudowane `BONDS` (rejestr obligacji, `builtin`) i `SAVINGS` (bank, oprocentowanie, kapitalizacja); `belkaEnabled`, `belkaDeferred`, `fxConversionPct` |
| `instruments` | Akcje/ETF: ticker, symbol Yahoo (`.WA` dla GPW), waluta, TER |
| `trades` | Kupno/sprzedaż (cena, kurs waluty, prowizja) – z nich liczone są pozycje (średni koszt) |
| `cashflows` | Wpłaty/wypłaty własne – podstawa wkładu netto |
| `income` | Dywidendy/odsetki brutto + podatek u źródła; Belka 19% liczona automatycznie poza IKE/IKZE (można wyłączyć per konto/transza) |
| `bonds` | Obligacje EDO/COI/TOS/ROR: data zakupu, sztuki, oprocentowanie 1. roku, marża, inflacja |
| `otherAssets` | Nieruchomości/ruchomości – zawsze w majątku; `showInPortfolio` = widoczność w zakładce Portfel |
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

## Odświeżanie notowań – niezawodność

- **Parser notowania** (`parseYahooChart`): cena = `meta.regularMarketPrice` (albo `fulldayPrice`); poprzednie zamknięcie kolejno z `meta.regularMarketChange` / `fulldayChange` (prevClose = cena − zmiana) lub procentu zmiany, potem ze świec (pary data–zamknięcie bez `null`, ostatnia świeca z dnia wcześniejszego niż dzień ostatniej transakcji, czas giełdy), potem `meta.previousClose`. Nigdy `meta.chartPreviousClose` (przy `range=5d` to kurs sprzed całego zakresu).
- **Procent zmiany dziennej na Pulpicie** = zmiana dzienna pozycji / wczorajsza wartość tych samych pozycji (bez gotówki i obligacji w mianowniku).
- **1W / 1M / YTD na Pulpicie** (`computePeriodStats(..., { preferHistory: true })`): wartość na start okresu z kursów zamknięcia – 7 dni kalendarzowych temu, miesiąc temu, ostatnia sesja przed 1 stycznia – zamiast zapisanej migawki (mogła powstać w trakcie sesji lub z nieaktualnych kursów); zysk = wartość − start − wpłaty netto w okresie, stopa TWR dzielona w dniu każdej wpłaty/wypłaty (wpłata nie jest zyskiem ani nie zaniża stopy). Historia: tygodniowa 5 lat + **dzienna 2 lata**; dla instrumentów portfela zwykłe zamknięcie (dywidendy są w gotówce), dla benchmarków skorygowane; świeca tygodniowa datowana na koniec tygodnia (bez kursu „z przyszłości”), puste świece pominięte.
- **Zmiana / zysk dzienny** (`quoteDayBase`, `positionDayChange` w `src/lib/engine.js`; Pulpit, Portfel, Mapa cieplna, Notowania): cena bieżąca vs oficjalne zamknięcie poprzedniej sesji z Yahoo/Stooq. Notowanie z sesji wcześniejszej niż dziś (czas polski: rano przed otwarciem, weekend, kursy zapisane wczoraj) = dziś bez ruchu, zmiana 0 – wcześniej przez cały ranek pokazywał się wczorajszy ruch jako dzisiejszy. Akcje kupione dziś liczone od ceny zakupu, nie od wczorajszego zamknięcia.
- **Zmiana dzienna**: poprzednie zamknięcie to ostatnia świeca dzienna z dnia wcześniejszego niż ostatnia transakcja (czas giełdy, `gmtoffset` z Yahoo) – poprawnie rano przed pierwszą transakcją, w trakcie sesji (gdy świeca dnia jest jeszcze nieaktualna albo pusta) i po sesji.
- **Bez starego cache'u**: zapytanie do serwera aplikacji ma znacznik czasu poza ścieżką Yahoo (`/api/yahoo?path=…&t=…`; ścieżka do Yahoo jest identyczna jak przy ręcznym wywołaniu, serwer usuwa też pomocnicze `_`/`t`) i `cache: 'no-store'`; funkcja `/api/yahoo` krótko trzyma odpowiedź w CDN (15 s) i próbuje obu domen Yahoo po 5 s (limit trasy w przeglądarce 12 s, więc zimny start serwera nie odrzuca trasy).
- **Bez martwego punktu**: każde odświeżenie zeruje „odpoczynek” tras, które wcześniej zawiodły; trwające pobieranie trzymane jest w pamięci (nie w zapisanym stanie), a zapisany status `loading` (zamknięcie aplikacji w trakcie, wersja z chmury) jest przy wczytaniu zamieniany – wcześniej blokował automatyczne odświeżanie na stałe. Ponowne kliknięcie w trakcie pobierania nie uruchamia drugiego.
- **Gdy Yahoo odrzuca serwer** (częste dla adresów chmurowych: HTTP 401/403/429): `/api/yahoo` ponawia zapytanie z sesją Yahoo (ciasteczko z `fc.yahoo.com` + `crumb`, pamiętane ok. 50 min), a dla bieżących notowań przechodzi zapasowo na **Stooq** (GPW `.WA`, Xetra `.DE`, USA, kursy walut; poprzednie zamknięcie z notowań dziennych) w formacie odpowiedzi Yahoo – źródło widoczne w notowaniu („Stooq (serwer aplikacji)”). Nagłówki `X-Quote-Source` / `X-Quote-Errors` pomagają w diagnostyce; całość mieści się w ~8,5 s.
- **Diagnostyka na telefonie**: komunikat po odświeżeniu z danymi awaryjnymi podaje pierwszą przyczynę (np. „PKO: serwer aplikacji: HTTP 400”); pobieranie zawieszone ponad 2 min nie blokuje kolejnego, a jego spóźniony wynik nie nadpisuje nowszego.
- **Po 9:00**: aplikacja otwarta przed sesją odświeża notowania raz tuż po jej otwarciu (gdy karta jest widoczna); poza tym jak dotąd – przy wejściu / powrocie do aplikacji w godzinach sesji. Notowanie awaryjne („ostatnie znane”) zachowuje zmianę dzienną, jeśli zostało pobrane tego samego dnia.

## Newsy

Zakładka „Newsy” (`#/news`, pierwszy kafelek w „Więcej” i pozycja w menu bocznym; `src/views/News.jsx`, `src/lib/news.js`):
- **Serwer** `/api/news?q=…&symbol=…` (`api/news.js`, lokalnie middleware Vite): Google News RSS po polsku (`news.google.com/rss/search?q=…&hl=pl&gl=PL&ceid=PL:pl`) oraz – gdy podano symbol – wiadomości z wyszukiwarki Yahoo Finance (`/v1/finance/search`). Odpowiedź `{ items: [{ title, link, pubDate, source }], errors }`: tytuły bez dopisku „- Portal”, encje i CDATA zdekodowane, duplikaty usunięte, od najnowszych, do 30 pozycji; CDN 5 min.
- **Wielokrotny wybór**: pigułki z checkboxem dla wszystkich spółek / ETF-ów z otwartych pozycji (zapytanie „{pełna nazwa} giełda” + symbol Yahoo) oraz własnych fraz („+ Własna spółka / fraza”, × usuwa; localStorage `wealth-app-news-topics`). Kliknięcie włącza / wyłącza temat; „Zaznacz wszystkie” / „Odznacz wszystkie”. Wybór zapamiętany w `wealth-app-news-off` (lista odznaczonych – nowe spółki i frazy są domyślnie zaznaczone); oba klucze w kopii zapasowej i chmurze.
- **Lista**: artykuły wyłącznie z zaznaczonych tematów (do 15 naraz), jedna lista od najnowszych; karta z plakietką spółki, tytułem-linkiem (nowa karta, `noopener noreferrer`), portalem i czasem publikacji („2 godz. temu”, „wczoraj”, data). Przycisk odświeżania w prawym górnym rogu pobiera z pominięciem pamięci (wyniki trzymane 5 min, to samo zapytanie w toku pobierane raz). Nie zmienia danych portfela.

## Tryb pełnoekranowy (PWA)

Po dodaniu do ekranu głównego aplikacja otwiera się bez paska przeglądarki: `public/manifest.json` (nazwa „Majątek”, `display: standalone`, `start_url`/`scope` „/”, tło i kolor motywu `#fafaf9`) oraz ikony w `public/icons/` (192 i 512 px, maskable 512 px, `apple-touch-icon` 180 px – wygenerowane z dotychczasowego logo `favicon.svg`). W `index.html`: `<link rel="manifest">`, `apple-touch-icon`, `mobile-web-app-capable` / `apple-mobile-web-app-capable`, tytuł „Majątek”, styl paska stanu iOS `default` i `theme-color` (jasny `#fafaf9` / ciemny `#0a0a0a`, synchronizowany z motywem wybranym w aplikacji). Bez service workera – aplikacja nadal wymaga sieci (dane z chmury, notowania). Na telefonie: Chrome → menu → „Zainstaluj aplikację” / „Dodaj do ekranu głównego”; Safari → Udostępnij → „Do ekranu początkowego”. Skrót dodany wcześniej (bez manifestu) otwiera się z paskiem – trzeba go usunąć i dodać ponownie.

## Zadania (dzienne i tygodniowe)

Zakładka „Zadania” (`#/tasks`, w dolnym pasku w miejscu „Cele” i w menu bocznym w miejscu „Cele roczne”; „Cele” są teraz w „Więcej” zaraz po „Newsy”; `src/views/WeeklyTasks.jsx`, `src/lib/weeklyTasks.js`):
- **Tydzień ISO** (`RRRR-Www`, poniedziałek–niedziela) z nawigacją ← →, paskiem postępu (wykonane / wszystkie, %) i informacją, gdzie zapisują się dane.
- **Cykliczne** („Co tydzień”) – widoczne od tygodnia dodania do tygodnia zakończenia; **jednorazowe** – tylko w swoim tygodniu. Checkbox zapisuje wykonanie w danym tygodniu. Usunięcie zadania cyklicznego z historią zamyka je od bieżącego tygodnia (zostaje w archiwum); nowe lub jednorazowe usuwa się razem z wpisami wykonania.
- **Archiwum tygodni** – 12 ostatnich minionych tygodni z wynikiem; kliknięcie otwiera tydzień (odhaczenia można poprawić, dodawanie tylko w bieżącym).
- **Zapis**: po zalogowaniu – tabele Supabase `weekly_tasks` (definicje, `is_recurring`, `week_id` tygodnia dodania, `archived_week`) i `weekly_task_logs` (wykonanie: `task_id` + `week_id`), RLS – każdy widzi tylko swoje wiersze. **Skrypt: `supabase/weekly_tasks.sql`** – uruchomić raz w Supabase (SQL Editor → New query → wklej → Run; można powtórzyć). Bez tabel (albo w trybie lokalnym) zadania zapisują się w localStorage `wealth-app-weekly-tasks-v1` (kopia zapasowa JSON) z komunikatem o brakującym skrypcie. Moduł nie zmienia tabeli `portfolios` ani wyliczeń portfela.

**Zadania dzienne** (zakładka „Zadania dzienne” – domyślna, przełącznik zapamiętany w `wealth-app-tasks-tab`; `src/components/tasks/DailyTasksPanel.jsx`, `src/lib/dailyTasks.js`): dzień kalendarzowy `RRRR-MM-DD` z nawigacją ← → (do dziś) i postępem dnia; **nawyki codzienne** („Codziennie” – wracają każdego dnia od dnia dodania, z serią 🔥 kolejnych wykonanych dni) i **zadania na dany dzień** („Tylko dziś”); **historia dni** – 14 ostatnich dni z wynikiem, kliknięcie otwiera dzień (odhaczenia można poprawić). Zakończenie nawyku z historią zostawia go w minionych dniach. Zapis: tabele Supabase `daily_tasks` (`day`, `archived_day`, `is_recurring`) i `daily_task_logs` (`task_id` + `day`) z RLS – **skrypt `supabase/daily_tasks.sql`** (uruchomić raz, niezależny od `weekly_tasks.sql`); bez tabel / w trybie lokalnym – localStorage `wealth-app-daily-tasks-v1`. Zadania tygodniowe, ich tabele i dane działają bez zmian.

## Tymczasowo ukryte zakładki

„Alokacja i Dopłaty” (`allocation`) i „Raport na X” (`reports`) mają w `NAV_ITEMS` (`src/components/Layout.jsx`) flagę `hidden: true` – nie ma ich w dolnym pasku, arkuszu „Więcej” ani menu bocznym (ani w liczniku przy „Więcej”). Kod, widoki i adresy `#/allocation`, `#/reports` działają bez zmian; „Kalkulator Inteligentnej Dopłaty” w Symulacjach pozostaje. Przywrócenie: usunąć `hidden: true` przy danej pozycji.

**Zadania miesięczne** (zakładka „Miesięczne”; `src/components/tasks/MonthlyTasksPanel.jsx`, `src/lib/monthlyTasks.js`): miesiąc `RRRR-MM` z nawigacją (do bieżącego), liczbą dni do końca miesiąca i postępem; **„Co miesiąc”** (np. głęboki audyt portfela, przegląd subskrypcji – z serią kolejnych miesięcy) i **„Tylko w tym miesiącu”** (np. rozliczenie podatkowe); historia 12 minionych miesięcy. Zapis: tabele `monthly_tasks` (`month`, `archived_month`, `is_recurring`) i `monthly_task_logs` (`task_id` + `month`) z RLS – **skrypt `supabase/monthly_tasks.sql`** (uruchomić raz; niezależny od skryptów dziennych i tygodniowych); bez tabel / w trybie lokalnym – localStorage `wealth-app-monthly-tasks-v1`.

**Wskaźnik konsekwencji** (kafelek na górze widoku Zadań; `src/lib/taskStats.js`, liczony w aplikacji – bez dodatkowych tabel): **bieżący okres** = wykonane / wymagane do tej pory w dzisiejszym dniu, bieżącym tygodniu i bieżącym miesiącu (z rozbiciem Dziś / Ten tydzień / Ten miesiąc, kolory: ≥ 80% zielony, ≥ 50% bursztynowy, niżej czerwony) oraz **ostatnie 30 dni** = wykonane / wymagane w okresach zakończonych w ciągu 30 dni (dni do wczoraj, tygodnie i miesiące, które się w tym czasie skończyły). Otwarty panel aktualizuje wskaźnik od razu po odhaczeniu.

**Postęp liczbowy w zadaniach miesięcznych** (jak w Celach): przy dodawaniu „+ Postęp liczbowy” – cel na miesiąc, jednostka i krok przycisków (np. 4 książek, krok 1; 40 km, krok 5); ołówek przy zadaniu dodaje / zmienia cel istniejącego zadania (puste pole – bez postępu). Wiersz zadania: „x z cel jednostka”, procent, pasek i − / pole / +. Postęp liczy się osobno w każdym miesiącu (zadania „co miesiąc” startują od 0); zadanie jest wykonane po osiągnięciu celu (checkbox: odhaczenie = cel, odznaczenie = krok przed celem); zmiana celu przelicza wykonanie bieżącego miesiąca; częściowy postęp nie liczy się jako wykonanie we wskaźniku konsekwencji i historii. Baza: kolumny `monthly_tasks.target / unit / step` i `monthly_task_logs.progress / done` – dopisane do `supabase/monthly_tasks.sql` jako `add column if not exists` (wystarczy uruchomić cały skrypt ponownie). Bez nich (stary skrypt) zadania miesięczne działają jak dotąd, a opcja postępu jest wyłączona z podpowiedzią.

## Poniedziałek / otwarcie sesji – świeże notowania

- **Przyczyna problemu**: Yahoo podaje notowania GPW z opóźnieniem ok. 15 min, a aplikacja odświeżała kursy tuż po 9:00 (i przy wejściu, najwyżej co 5 min). W poniedziałek o 9:01 przychodziło więc jeszcze ostatnie notowanie z piątku – aplikacja uznawała kursy za odświeżone i nie pobierała ich ponownie, dopóki karta nie została zamknięta i otwarta.
- **Ponawianie po otwarciu sesji** (`delayedSessionQuotes` w `src/state/AppContext.jsx`): gdy w godzinach sesji przychodzą notowania GPW z sesji wcześniejszej niż dzisiejsza, aplikacja ponawia pobranie co 3 min (do 10:00, najwyżej 15 razy, tylko przy widocznej karcie), aż przyjdą dzisiejsze; dodatkowe odświeżenie ok. 9:17 (po upływie opóźnienia), gdy aplikacja była otwarta przed sesją. Do tego czasu zmiana dzienna = 0 (a nie piątkowy ruch); po nadejściu danych – względem piątkowego zamknięcia.
- **Bez pamięci podręcznej dla bieżących notowań**: `/api/yahoo` dla `range=5d&interval=1d` zwraca `Cache-Control: no-store` (oraz `CDN-Cache-Control` / `Vercel-CDN-Cache-Control: no-store`); historia lat – krótki cache 60 s. Kursy NBP pobierane z `cache: 'no-store'`.
- **Ręczne odświeżenie (force)**: pełny reset stanu tras (odpoczynek i zapamiętana trasa `wealth-app-yahoo-route`), zapytania z `fresh=1` i znacznikiem czasu; komunikat informuje, ile notowań jest jeszcze z poprzedniej sesji i kiedy nastąpi ponowienie.

**Podmiot artykułu a autor** (`src/lib/newsSubject.js`): artykuł jest przypisywany do spółki, o której faktycznie jest (główny podmiot), a nie do tematu zapytania ani do źródła / autora. Z tytułu usuwane są fragmenty autorskie i „platformowe” („analityk / ekspert / ekonomiści XTB”, „według / zdaniem / komentarz / raport XTB”, „XTB Research”, „przez XTB”, „na platformie XTB”, „xStation”), a spółka, która jest też źródłem lub autorem, liczy się jako podmiot tylko przy zdarzeniu spółki (wyniki, zysk, prowizje, dywidenda, klienci, akcje / kurs, zarząd, komunikat…). Głównym podmiotem jest spółka z portfela wymieniona najwcześniej (aliasy: ticker, nazwa, nazwa bez „S.A.” / klas ETF i słownik nazw potocznych, np. PKN → Orlen, KTY → Grupa Kęty, CBF → Cyber_Folks). Przykłady: „Analityk XTB: Orlen może zyskać…” → Orlen (z dopiskiem „autor: XTB”); „XTB: wyniki finansowe…”, „XTB obniża prowizje” → XTB; „Kurs EUR/USD… – komentarz XTB”, poradniki xStation → „Analizy ogólne”. Artykuły bez spółki z portfela w tytule trafiają do pigułki „Analizy ogólne (N)” – domyślnie wyłączonej (`wealth-app-news-general`). Pozostałe wymienione spółki widać jako małe plakietki; frazy własne nie są filtrowane.

**Planowanie zadań do przodu** (dzienne, tygodniowe, miesięczne): strzałka → przechodzi do przyszłych dni / tygodni / miesięcy (nagłówek „· zaplanowany”), a pole **„Zaplanuj na”** (data; dla tygodni – dowolny dzień tygodnia, dla miesięcy – wybór miesiąca) przenosi widok od razu do wybranego okresu. W przyszłym okresie można dodawać („Zaplanuj”: jednorazowo albo cyklicznie od tego terminu) i usuwać zadania, a odhaczanie i postęp liczbowy są dostępne dopiero w danym okresie. Karta **„Zaplanowane (N)”** w każdej zakładce pokazuje zadania z przyszłym terminem (kliknięcie przenosi do okresu); na liście pojawiają się one automatycznie, gdy nadejdzie ich dzień / tydzień / miesiąc. Wskaźnik konsekwencji i historia nie liczą przyszłych okresów. **Bez zmian w bazie**: przyszły termin to zwykła wartość w istniejących kolumnach (`day`, `week_id`, `month` – dzień / tydzień / miesiąc startu zadania) w Supabase i localStorage – nie trzeba uruchamiać żadnego SQL.

## PWA – instalacja z przeglądarki („Dodaj do ekranu głównego”), offline i powiadomienia

- **Manifest** (`public/manifest.json`): nazwa „FinTrack”, `id` i `scope` „/”, `start_url` `/?source=pwa`, `display: standalone`, ciemne `theme_color` / `background_color` (`#0a0a0a` – ekran startowy); logo – niebieski kafelek z wykresem (`public/favicon.svg` i ikony w `public/icons/`), kategorie, `launch_handler`; ikony 48–1024 px (`any`), maskable 192 / 512 i monochrome 512 (`public/icons/`, z dotychczasowego logo); skróty (Pulpit, Portfel, Budżet, Zadania – przytrzymanie ikony aplikacji); zrzuty ekranu `narrow` 1080×1920 i `wide` 1280×800 (`public/screenshots/`). Chromium: brak błędów manifestu i instalacji. Bez paczek APK / Digital Asset Links – aplikację instaluje się bezpośrednio z przeglądarki (Chrome: menu → „Zainstaluj aplikację” / „Dodaj do ekranu głównego”; Safari: Udostępnij → „Do ekranu początkowego”).
- **Service worker** (`public/sw.js`, rejestrowany tylko w wersji produkcyjnej – `src/main.jsx`): powłoka aplikacji (`/`, `index.html`, manifest, ikony) w pamięci przy instalacji; nawigacja – najpierw sieć, bez sieci zapisana wersja (aplikacja startuje offline z danymi z urządzenia); `/assets/*` z hashem – z pamięci; ikony, logotypy (`/logos`, `/api/logo`) – pamięć z odświeżaniem w tle. **Nigdy z pamięci**: `/api/yahoo`, `/api/news` i zapytania do innych domen (Supabase, Yahoo, NBP) – notowania zawsze świeże, a bez sieci działa dotychczasowa logika danych awaryjnych. Wersja pamięci w nazwie – stare usuwane przy aktualizacji (obecnie `fintrack-v5-*`; dotychczasowy „wyłącznik” sw.js zostaje zastąpiony pod tym samym adresem). W nagłówku znaczek „Offline” przy braku sieci.
- **Powiadomienia** (Ustawienia → „Powiadomienia”; `src/lib/notifications.js`, `src/state/useTaskReminder.js`): zgoda systemu, powiadomienie testowe i przypomnienie o niewykonanych zadaniach dziennych raz dziennie od wybranej godziny (gdy aplikacja działa – także w tle); kliknięcie otwiera aplikację w Zadaniach. Wysyłka przez service worker (wymagane w aplikacji zainstalowanej na Androidzie; na iPhonie od iOS 16.4 po dodaniu do ekranu początkowego). Powiadomienia przy całkowicie zamkniętej aplikacji wymagałyby serwera Web Push (VAPID) – poza zakresem tej wersji.
- **Pełny ekran (standalone)**: nagłówek z odstępem `safe-area-inset-top`, treść i komunikaty nad dolnym paskiem z `safe-area-inset-bottom`, bez „gumowego” przewijania i podświetlenia dotyku w trybie aplikacji, kolor paska stanu zgodny z motywem.



## Inflacja CPI z GUS – baza, synchronizacja i benchmark

- **Baza**: tabela Supabase `inflation_rates` (`supabase/inflation_rates.sql` – uruchom raz w SQL Editor): `year`, `month`, `yoy` (r/r %, analogiczny miesiąc poprzedniego roku = 100), `mom` (m/m %, poprzedni miesiąc = 100), `cpi_value` (wskaźnik GUS, kolumna wyliczana), `source`, `is_manual`, `updated_at`; odczyt publiczny (RLS), zapis tylko kluczem service role; skrypt wstawia odczyty startowe 2023–2025.
- **Pobieranie** `api/inflation-sync.js`: plik GUS „Miesięczne wskaźniki cen towarów i usług konsumpcyjnych od 1982 roku” (CSV, kolumny rozpoznawane po nagłówkach; adres do nadpisania `GUS_CPI_CSV_URL`), a gdy niedostępny – Eurostat HICP dla Polski (tylko uzupełnia brakujące miesiące). Dane od 2000 r.; wiersze `is_manual` nie są nadpisywane; `?dry=1` – podgląd. Harmonogram: Vercel Cron codziennie ok. 9:20 UTC (`vercel.json`, autoryzacja `CRON_SECRET`) albo pg_cron (instrukcja w pliku SQL); ręcznie – „Pobierz z GUS teraz” w Ustawieniach (zalogowany użytkownik). Diagnoza konfiguracji: `/api/inflation-sync?check=1` – czy funkcja widzi `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (same nazwy, bez wartości), `CRON_SECRET` i tabelę `inflation_rates`. Zmienne serwera odczytuje wspólny `api/_env.js` (odporny na spacje i małe litery w nazwach, cudzysłowy w wartościach, nazwy z integracji Supabase `NEXT_PUBLIC_SUPABASE_URL` i nowe klucze `SUPABASE_SECRET_KEY`); po zmianie zmiennych w Vercel potrzebny jest Redeploy.
- **Aplikacja**: `api/inflation.js` → `state.inflation` (przy starcie, najwyżej co 12 h; bez serwera – tabela wbudowana). Tabela CPI (`getCpiTable` → `buildCpiTable` w `src/lib/inflation.js`): wbudowane odczyty → dane z bazy → ręczne korekty (`settings.cpiOverrides` r/r, `settings.cpiMomOverrides` m/m).
- **Benchmark „Inflacja CPI”** w Wykresach: indeks cen łańcuchowany z miesięcznych odczytów GUS m/m (przybliżenie z r/r tylko dla miesięcy bez m/m); źródło w liście benchmarków („GUS · odczyty miesięczne do RRRR-MM”). Kafelek „vs benchmarki” pokazuje realną stopę zwrotu w okresie: (1 + TWR) / (1 + inflacja CPI) − 1. Te same odczyty r/r liczą oprocentowanie obligacji COI/EDO.
- **Ustawienia → System i Konto → Inflacja CPI (GUS)**: ostatni odczyt r/r i m/m, źródło i zakres danych z bazy, „Odśwież z bazy”, „Pobierz z GUS teraz” oraz tabela korekt (r/r albo m/m, rok po roku).

## Cel poduszki finansowej (BETA)

Karta na górze zakładki „Poduszka finansowa” (`src/components/bonds/SafeGoalCard.jsx`, obliczenia `safeGoalStats` w `src/lib/cashflow.js`): docelowa kwota, opcjonalne koszty życia (puste = planowany budżet miesiąca z modułu Budżet) i miesięczna dopłata – zapis w `settings.safeGoal` (urządzenie + chmura Supabase razem z portfelem). Wartość poduszki = aktywne obligacje skarbowe + saldo kont oszczędnościowych (tylko zaksięgowane odsetki). Duży pasek postępu („87,4% · 52 416,15 zł z 60 000,00 zł”), kafelki: „Pozostało: …” albo zielone „Cel osiągnięty” z nadwyżką, pokrycie miesięcy kosztów życia (runway) i szacowany czas do celu (odsetki netto z KO/obligacji + dopłata, procent składany miesięcznie).

## Cash Flow Forecast (BETA)

Widok `#/cashflow` (kafelek „Cash Flow Forecast BETA” w „Więcej”, menu boczne, przycisk na górze zakładki Dywidendy; `src/views/CashFlow.jsx`, obliczenia `src/lib/cashflow.js`) – prognoza pasywnych przepływów na 12 miesięcy (bieżący + 11 kolejnych):
- **Dywidendy**: harmonogram (ogłoszone, w drodze, zweryfikowane transze – np. Grupa Kęty) oraz prognoza z wypłat z ostatnich 12 miesięcy dla obecnej liczby akcji (ten sam termin rok później; bez dublowania terminów z harmonogramu ±45 dni). **Konto oszczędnościowe**: odsetki w dniach kapitalizacji przy obecnym saldzie, oprocentowaniu i modelu kapitalizacji. **Obligacje**: kupony w oknie (COI, ROR…) i odsetki skapitalizowane przy wykupie (EDO, TOS…) z tabelą CPI (GUS). Podatek wg konta: Belka 19%, IKE/IKZE 0% (oszczędność IKE liczona osobno), Belka odroczona – potrącona w prognozie netto.
- Przełącznik **Netto / Brutto**, kafelki: suma 12 mies., średnio / mies., bieżący miesiąc, podatek Belki (12 mies.) i oszczędność dzięki IKE; skumulowany wykres słupkowy (dywidendy / odsetki z KO / obligacje) z linią średniej; rozwijana tabela miesiąc po miesiącu z pozycjami (data, status, szczegóły, brutto/netto).
- **Pokrycie wydatków (BETA)**: średni i bieżący dochód pasywny netto jako % „Stałych kosztów” i całego planowanego budżetu (moduł Budżet); **Free Cash Flow**: miesięczne wpływy (pole) − budżet + dochód pasywny.
- **Nadchodzące wypłaty (BETA)**: oś czasu na 90 dni z odliczaniem („za 12 dni”) i kwotą netto.
- **Kula śnieżna (BETA)**: 1 / 3 / 5 lat, DRIP (reinwestycja 100% przepływów) i miesięczna dopłata; stopa dochodu = prognoza 12 mies. / kapitał dochodowy (pozycje z dywidendą + KO + obligacje), bez wzrostu dywidend i cen.
Ustawienia widoku: `settings.cashflow`. Wszystkie nowe elementy mają plakietkę BETA (`BetaBadge` w `src/components/ui.jsx`).

## Zweryfikowane dywidendy (korekty danych Yahoo)

Yahoo podaje dzień dywidendy i stawkę, ale nie dzień wypłaty (aplikacja szacuje go na „dzień dywidendy + 14 dni”), a przy wypłatach w transzach bywa niepełne. `src/lib/dividendFacts.js` (`VERIFIED_DIVIDENDS`) zawiera potwierdzone dane spółek, np. **Grupa Kęty (KTY) – II transza: dzień dywidendy 18.08.2026, wypłata 4.11.2026, 32,64 zł na akcję**. Przy synchronizacji dywidend (Dywidendy → „Synchronizuj” albo automatycznie co 12 h) pozycja harmonogramu z tego terminu dostaje prawdziwy dzień wypłaty i stawkę (albo powstaje nowa), a po dniu wypłaty jest księgowana według liczby akcji na każdym koncie w dniu przed dniem dywidendy – także ułamkowej (np. 0,2887 × 32,64 zł = 9,42 zł brutto; podatek Belki według typu konta, IKE/IKZE 0%) – o ile wypłaty nie ma już w rejestrze (np. z importu XTB; bez duplikatów). Kolejne potwierdzone wypłaty dodaje się jako nowe wpisy tablicy.

## Listy zakupów

Zakładka „Listy zakupów” (`#/shopping`, „Zakupy” na dolnym pasku i pozycja w menu bocznym; `src/views/Shopping.jsx`, `src/lib/shopping.js`): wiele list (pigułki z liczbą pozycji do kupienia, „Nowa lista”, zmiana nazwy, usunięcie listy z pozycjami), dodawanie produktów z opcjonalną ilością, odhaczanie (przekreślenie, sekcja „Kupione”), usuwanie pozycji i „Usuń kupione”. Wybrana lista zapamiętana w przeglądarce.
- **Zapis**: po zalogowaniu – tabele Supabase `shopping_lists` i `shopping_items` (`supabase/shopping_lists.sql` – uruchom raz w SQL Editor; RLS: tylko własne dane; usunięcie listy usuwa pozycje), synchronizacja między urządzeniami. W trybie lokalnym albo do czasu utworzenia tabel – localStorage `wealth-app-shopping-v1` (z komunikatem o brakujących tabelach). Zmiany optymistyczne (od razu na ekranie, zapis w tle). Moduł nie wpływa na portfel, budżet ani zadania.

## Podsumowania AI w Newsach (Google Gemini)

- **Artykuł**: mały znaczek „✨ AI” w prawym górnym rogu karty rozwija (i przy pierwszym otwarciu generuje) blok z sekcjami **Główne wydarzenie** (1–2 zdania), **Kluczowe liczby i dane** (punkty „Nazwa: wartość (kontekst)”, nazwa pogrubiona) i **Wpływ na spółkę / inwestora** (2–4 punkty) oraz wydźwięk (pozytywny / negatywny / neutralny / mieszany). Podczas pracy widać „AI analizuje artykuł…”, przy błędzie – komunikat i „Spróbuj ponownie”; bez przycisku odświeżania (treść artykułu się nie zmienia) (`src/components/news/AiSummary.jsx`).
- **Podsumowanie dnia (AI)**: karta nad listą, zwijana kliknięciem w nagłówek (stan zapamiętany w przeglądarce), z przyciskiem „Odśwież podsumowanie” – te same sekcje dla artykułów z wczoraj i dziś (od północy wczoraj do chwili zapytania, do 60 nagłówków zaznaczonych tematów); na początku wiersz „Podsumowanie z okresu: 3.11.2026, 00:00 – 4.11.2026, 10:20”; prompt wymusza skompresowaną „pigułkę wiedzy” – 4–6 gęstych zdań pogrupowanych według spółek z dniem przy faktach, do 20 liczb „Spółka – wskaźnik: wartość (kontekst, dzień)”, 3–6 wniosków bez powtórzeń (na podstawie nagłówków; „AI analizuje wiadomości dnia…”).
- **Serwer** `api/news-summary.js` (POST): pobiera treść artykułu (linki Google News rozwiązywane do adresu źródła; treść z `<article>` / akapitów, przy płatnych treściach – zajawka; gdy portal odrzuca serwer (np. HTTP 403), kolejno: ponowna próba z nagłówkami przeglądarki mobilnej → kanał RSS portalu (link `rel="alternate"` albo `/feed`, `/rss`…, pozycja dopasowana po adresie lub tytule) → publiczne proxy CORS jak przy kursach (corsproxy.io, allorigins, codetabs) → zajawka z meta tagów `og:description` / `description`; łącznie do ok. 18 s; źródło treści widać w stopce podsumowania („treść: kanał RSS portalu”, „proxy …”); dopiero gdy nic nie zadziała – krótkie podsumowanie z samego tytułu (w pamięci telefonu tylko 30 min, potem ponowna próba) z żółtą adnotacją „Treść artykułu niedostępna…”, bez dopowiadania faktów), wywołuje Google Gemini (domyślnie alias `gemini-flash-latest` – szybki model z darmowym pakietem zapytań; inny przez `GEMINI_MODEL`; oficjalne SDK `@google/genai`, odpowiedź JSON zgodna ze schematem, `temperature` 0,2, czytelne komunikaty przy limicie darmowych zapytań 429 i blokadzie treści). Prompt systemowy: perspektywa inwestora, wszystkie istotne liczby bez zaokrągleń, zakaz ogólników i faktów spoza tekstu, bez rekomendacji kupna/sprzedaży; treść artykułu traktowana jako dane (odporność na instrukcje w tekście).
- **Konfiguracja (Vercel → Environment Variables)**: darmowy klucz `GEMINI_API_KEY` (albo `GOOGLE_API_KEY`) z Google AI Studio – https://aistudio.google.com/app/apikey (tylko serwer, bez prefiksu `VITE_`; klucz Anthropic nie jest już potrzebny). Klucz z Google AI Studio („AIza…” albo nowszy „AQ.…”) trafia najpierw do Gemini API; gdy usługa odrzuci klucz „AQ.…”, endpoint próbuje Vertex AI w trybie express (`GEMINI_VERTEX=1`/`0` wymusza jedną usługę). Modele: `GEMINI_MODEL` → `gemini-flash-latest` → `gemini-flash-lite-latest` (przy przeciążeniu 503 – jedna ponowna próba i kolejny model, przy limicie 429 – kolejny model), a gdy żaden nie istnieje (404) – najnowsze dostępne modele „flash” z listy modeli klucza; modele z 404 są pomijane, łączny czas prób ograniczony do ok. 22 s (bez przekroczenia czasu funkcji Vercel). Test konfiguracji: otwórz `/api/news-summary?check=1` (rodzaj klucza, model, opis błędu od Google). Po zmianie zmiennych w Vercel potrzebne jest ponowne wdrożenie (Redeploy). Dostęp wyłącznie dla zalogowanych (token sesji Supabase weryfikowany przez `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`); `AI_ALLOW_ANON=1` wyłącza ten wymóg. Lokalnie (`npm run dev`) ten sam endpoint działa przez middleware Vite, gdy `GEMINI_API_KEY` jest w otoczeniu procesu.
- **Pamięć**: podsumowania zapisywane w przeglądarce (`fintrack-news-ai-v1`, 80 ostatnich – poza kopią zapasową i synchronizacją) i w pamięci funkcji serwera; ponowne otwarcie artykułu nie wywołuje AI („Odśwież podsumowanie” – na żądanie).

## Zadania – zaległe zadania jednorazowe na start tygodnia

W zakładce „Zadania” w nowym tygodniu, gdy w poprzednim zostały niewykonane zadania jednorazowe (tygodniowe), pojawia się baner: „Masz niewykonane zadania jednorazowe z poprzedniego tygodnia. Czy chcesz przerzucić je do bieżącego tygodnia?” z listą zadań i przyciskami **„Przerzuć zaległe”** (zmiana tygodnia zadań w Supabase `weekly_tasks.week_id` albo w pamięci przeglądarki – `moveWeeklyTasks` w `src/lib/taskStats.js`) oraz **„Ignoruj / Zostaw”**. Pytanie pojawia się raz na tydzień (znacznik `wealth-app-weekly-carry-v1`, synchronizowany z ustawieniami w chmurze). Zadania cykliczne, wykonane i z wcześniejszych tygodni nie są przenoszone. Bez zmian w schemacie bazy.

## Powiadomienia (panel, harmonogram, Web Push)

**Powiadomienia** (wyłącznie w Ustawieniach – koło zębate na górnym pasku → „⚙️ System i Konto” → „Powiadomienia”; `#/settings/notifications`, dawny adres `#/notifications` prowadzi tutaj; `src/views/NotificationsView.jsx`). Wszystkie powiadomienia (lokalne i Web Push) mają stały tytuł **„FinTrack 📊”** (`NOTIFY_TITLE` w `src/lib/notifyPlan.js`, także w `public/sw.js`), a treść z emoji: „⏳ Zostały Ci 2 zadania na dziś: … ✅ Odhacz je przed końcem dnia!”, „📰 Wczoraj pojawiły się 3 nowe artykuły o Twoich spółkach. Sprawdź, co słychać na rynkach! 🚀” (bez listy spółek – szczegóły w Newsach), „📈 Zmiana notowań: … zanotowała zmianę o +4,9%!”. Zawartość: zgoda systemu i włącznik na urządzeniu, powiadomienie testowe; **wieczorne przypomnienie o zadaniach** (przełącznik + godzina, domyślnie 20:00 – niewykonane zadania dzienne z dzisiaj); **raport o spółkach z portfela** (przełącznik, próg – co najmniej X artykułów, pora: rano 8:00 / w południe 12:00; liczą się artykuły z poprzedniego dnia, których głównym podmiotem jest spółka z portfela, bez „Analiz ogólnych”) z podglądem i „Wyślij teraz”; **krytyczne zmiany notowań** (przełącznik + próg dzisiejszej zmiany, domyślnie ±4%; `src/lib/priceAlerts.js`, `priceAlerts` / `priceAlertMessage` w `src/lib/notifyPlan.js`) – po każdym pobraniu kursów w aplikacji, a z Web Push także co godzinę przez serwer w dni robocze 9–22 (notowania Yahoo przez `api/yahoo.js`): „📉 Zmiana notowań: PKO Bank Polski zanotowała zmianę o −4,6%!” (próg nie trafia do treści – jest tylko warunkiem wysyłki); anty-spam: o danej spółce najwyżej jedno powiadomienie dziennie w danym kierunku, a drugie tylko przy zwrocie w ciągu dnia („🔄 Odbicie: …” po spadku, „🔄 Zwrot w dół: …” po wzroście); kilka spółek naraz – „📊 Zmiany notowań (N): …”; notowania symulowane nie wywołują alarmów; **powiadomienia z serwera (Web Push)** – włącznik subskrypcji i test z serwera. Ustawienia: localStorage `wealth-app-notify` (`{ enabled, tasks: { on, hour }, news: { on, min, slot }, prices: { on, threshold } }`, zgodnie ze starszym `{ enabled, taskHour }`), a przy Web Push także w Supabase.

**Treść i terminy** – czyste funkcje `src/lib/notifyPlan.js` wspólne dla aplikacji i serwera (`unfinishedDailyTasks`, `tasksReminderMessage`, `newsDigest`, `newsDigestMessage`, `dueKinds` – raz dziennie każdego rodzaju; raport w oknie 6 h od wybranej pory).

**Bez serwera** (`src/state/useNotificationScheduler.js`): gdy aplikacja działa (także w tle) – sprawdzenie co 5 min i przy powrocie do aplikacji; wysyłka przez service worker.

**Web Push (także przy zamkniętej aplikacji)**:
1. Supabase: uruchom `supabase/push_subscriptions.sql` (tabela `push_subscriptions` z RLS: endpoint, klucze, `prefs`, `watch` – spółki z portfela, `tz`, `last_sent`).
2. Klucze VAPID: `npx web-push generate-vapid-keys`. Vercel → Environment Variables: `VITE_VAPID_PUBLIC_KEY` (publiczny – wbudowywany w aplikację), `VAPID_PUBLIC_KEY` (ten sam), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:…`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (tajny, tylko serwer), `CRON_SECRET` (losowy ciąg). Po dodaniu – ponowne wdrożenie.
3. Harmonogram co godzinę: w Supabase włącz rozszerzenia `pg_cron` i `pg_net` i uruchom `cron.schedule(...)` z końca `supabase/push_subscriptions.sql` (wywołuje `GET /api/push-cron` z nagłówkiem `Authorization: Bearer <CRON_SECRET>`). Celowo bez `crons` w `vercel.json` – plan Hobby dopuszcza tylko dzienne zadania i godzinowe zablokowałoby wdrożenie.
4. W aplikacji: Więcej → Powiadomienia → „Powiadomienia z serwera” (wymaga logowania) → „Wyślij testowe z serwera”.

Endpointy: `api/push-cron.js` (przegląd subskrypcji w strefie czasowej użytkownika, zadania z `daily_tasks` / `daily_task_logs`, wiadomości przez `api/news.js` + klasyfikację podmiotu, wysyłka `web-push`, usuwanie wygasłych subskrypcji 404/410, `?dry=1` – podgląd planu), `api/push-test.js` (POST z tokenem sesji – test na urządzenia użytkownika), wspólna logika `api/_push.js`. Service worker: zdarzenia `push` (JSON `{ title, body, url, tag }` → `showNotification`), `pushsubscriptionchange`, `notificationclick` (otwiera aplikację w danym widoku). Ten sam `tag` powiadomień lokalnych i z serwera – system zastępuje je zamiast dublować. Bez konfiguracji wszystko działa w trybie lokalnym.

## IKE - Julka (osobne, odizolowane konto)

Ustawienia → Portfel i Aktywa → **IKE - Julka**. Systematyczny zakup ETF-u **IE00BK5BQT80** (Vanguard FTSE All-World UCITS ETF Acc, notowanie Yahoo `VWCE.DE` w EUR) za stałą kwotę (domyślnie 100 zł / mies.).

- Wyliczenie (`src/lib/julkaIke.js`, mechanizm przewalutowania jak na IKE w XTB, domyślnie 0,05%): `kwota w EUR = (kwota PLN − prowizja) / kurs EUR/PLN`, `jednostki = kwota w EUR / cena ETF` – zaokrąglenie do 4 miejsc. Kurs (`EURPLN=X`) i cena to zamknięcie z dnia zakupu (ostatnia sesja ≤ data), dla dzisiejszej daty – bieżące notowanie. Gdy notowań nie da się pobrać, kurs i cenę wpisuje się ręcznie.
- Zakup przyciskiem „Dodaj zakup miesięczny” z wyborem daty albo automatycznie: wybrany dzień miesiąca od wskazanego miesiąca – zaległe zakupy są dopisywane przy otwarciu aplikacji (pomijane są miesiące, w których jest już zakup). Historia z korektą (przeliczenie jednostek) i usuwaniem.
- Izolacja: dane są wyłącznie w kluczu `wealth-app-ike-julka-v1` (synchronizowanym z Supabase w kolumnie `ui_prefs` i obecnym w kopii zapasowej) – nie są częścią stanu portfela, więc nie trafiają do Pulpitu, Portfela, Wykresów, statystyk, limitów IKE, kalkulatorów, raportów ani filtrów kont.

## Cash Flow Forecast i Poduszka – źródła, wpłaty IKE, wagi i limit do celu (BETA)

- **Źródła:** pigułki na górze Cash Flow Forecast (Dywidendy / Obligacje skarbowe / Konto oszczędnościowe) przeliczają wykres, tabele, średnią, pokrycie budżetu i symulator wieloletni tylko dla zaznaczonych źródeł (`settings.cashflow.sources`).
- **Zwijane sekcje:** karty Cash Flow i nowe karty Poduszki są zwijane, z podsumowaniem w belce; stan rozwinięcia pamiętany na urządzeniu (`fintrack-cf-open-*`, `fintrack-safe-open-*`).
- **Wpłaty na IKE (XTB):** z historii (`ikeDepositHistory` – faktyczne wpłaty z rejestru / importu XTB, średnia od miesiąca pierwszej wpłaty) albo ręcznie (zł / mies. lub / rok). **Granicznik:** etap 1 – kwota bazowa przez X lat, etap 2 – kwota B od roku X+1. Wpłaty od przyszłego miesiąca, w każdym roku kalendarzowym najwyżej do limitu IKE (w bieżącym – do pozostałej części).
- **Dividend Yield portfela** (`portfolioDividendYield`): dywidendy brutto otrzymane na IKE w 12 mies. / wartość IKE (bez wypłat – prognoza stawek DPS; IKE bez dywidend – cały portfel inwestycyjny). Stosowany do obecnego IKE, nowych wpłat i DRIP.
- **Poduszka – wagi:** docelowy udział obligacji (reszta KO), obecny udział, pasek proporcji, odchylenie w pp i w zł (`cushionWeights`).
- **Poduszka – wzrost i twardy limit:** dopłata zł / mies. albo % rocznie ponad odsetki; wartość rośnie najwyżej do celu (`cushionProjection`, cap = max(cel, obecna wartość)), potem kapitał stoi, a odsetki – także w Cash Flow Forecast – liczone są od kwoty celu. Ustawienia w `settings.safeGoal` (`weightBonds`, `growthMode`, `growthPct`, `monthlyContribution`, `target`).

## Surowce i Krypto (BETA)

Więcej → **Surowce i Krypto**: złoto, srebro (gramy lub uncje trojańskie), Bitcoin i Ethereum (ułamkowe ilości).

- Ceny na żywo z Yahoo Finance (`src/lib/alternatives.js`): `GC=F`, `SI=F` (COMEX, USD / oz trojańską = 31,1034768 g), `BTC-USD`, `ETH-USD`, przeliczenie po `USDPLN=X`. Odświeżanie po otwarciu modułu, przyciskiem i przy starcie aplikacji (gdy notowania starsze niż 15 min).
- Karta aktywa (zwijana, z podsumowaniem w belce): cena rynkowa (PLN i USD), ilość, wartość w PLN, zmiana dzienna 1D w PLN (ruch ceny i kursu).
- Majątek Całkowity: wartość doliczana do Net Worth (Pulpit – osobny segment „Surowce i krypto”, cele majątku, udział poduszki); przełącznik w „Ustawieniach modułu”. W Portfelu kategoria „Surowce i krypto” z filtrem.
- **Cena zakupu i wynik:** w karcie aktywa średnia cena zakupu za jednostkę (1 g / 1 oz / 1 szt.) w PLN albo USD (z opcjonalnym kursem USD/PLN zakupu; puste = bieżący kurs). Na żywo (po każdym odświeżeniu notowań): koszt = ilość × średnia cena (× kurs), wynik w PLN = wartość bieżąca − koszt, stopa zwrotu %; zielony – zysk, czerwony – strata; suma w nagłówku modułu. Zmiana jednostki gramy ↔ uncje przelicza ilość i cenę zakupu (ten sam koszt). Koszt i wynik trafiają też do wiersza w Portfelu.
- Zapis: `settings.alternatives` (`holdings` z `avgPrice`, `avgCurrency`, `avgFx`; `quotes`, `includeInNetWorth`) – localStorage i Supabase razem z portfelem.

## Odsetki narosłe dziennie – konto oszczędnościowe i obligacje

- **Konto oszczędnościowe:** wycena (`valuePortfolio` → `byAccount[id].cash`) = zaksięgowane saldo + odsetki narosłe netto od początku bieżącego okresu kapitalizacji (albo od ostatniego wpisu odsetek, jeśli był później) do dnia wyceny (`src/lib/accrual.js`, kapitalizacja dzienna – procent składany, pozostałe – liniowo wg dni; Belka wg konta). Pola pomocnicze: `bookedCash`, `accruedInterest`, `totals.savingsAccrued`. Po zaksięgowaniu odsetek (automatycznie w dniu kapitalizacji) naliczanie startuje od nowa – wartość jest ciągła, bez podwójnego liczenia.
- **Obligacje skarbowe:** wartość = nominał + odsetki narosłe netto liniowo wg dni okresu odsetkowego (jak dotąd, `valueBond`); suma w `totals.bondsAccrued`.
- Dotyczy Majątku Całkowitego, Poduszki finansowej (karta KO: „Wartość na dziś” = saldo + narosłe), Portfela, wykresów struktury, migawek historii, Cash Flow Forecast (kapitał poduszki; wypłata w dniu kapitalizacji z adnotacją, ile już narosło) i statystyk – przyrost narosłych odsetek liczony jako odsetki, nie zysk kursowy.

## Jednorazowy wyjątek: Grupa Kęty, II transza 2026

`src/lib/dividendFacts.js` (`KTY-2026-II`, `forceShares`): wypłata 4.11.2026 (dzień dywidendy 18.08.2026, 32,64 zł / akcję) liczona zawsze dla **0,2887 akcji = 9,42 zł brutto** (netto wg konta: IKE 9,42 zł, maklerskie 7,63 zł) – także gdy historia transakcji daje inną liczbę akcji albo jej nie odtwarza. `forcedShares()` obowiązuje wyłącznie pozycję KTY o dokładnie tym dniu dywidendy, dniu wypłaty, stawce i walucie; inne spółki, pozostałe dywidendy KTY i ręcznie zmieniona pozycja liczą się standardowo z posiadanych akcji. Wcześniej zaksięgowana inna kwota tej transzy jest korygowana (bez duplikatu); wypłata z importu XTB ma pierwszeństwo. Wpis zapisuje stawkę (`dps`), więc prognoza z historii na kolejny rok używa 32,64 zł.

**Stały wpis (bezwarunkowy):** `fixedDividendPlan()` (`dividendFacts.js`, uruchamiany w `AppContext` przy każdej zmianie stanu, idempotentnie) dodaje do rejestru przychodów wypłatę `fact_KTY-2026-II`: 4.11.2026, **9,42 zł brutto** (0,2887 × 32,64 zł), bez sprawdzania transakcji, stanu posiadania i dat zakupu. Instrument KTY jest tworzony, gdy go brak, a pozycja harmonogramu (18.08 → 4.11.2026) dodawana jako wypłacona. Konto: to z transakcjami KTY, inaczej pierwsze IKE, inaczej pierwsze konto inwestycyjne. Wcześniejsze automatyczne księgowanie tej transzy jest zastępowane (bez duplikatu). Wyjątek: jeśli ta wypłata trafi do rejestru z importu (np. XTB), stały wpis ustępuje, żeby kwota nie była liczona podwójnie.

## Porządki w nawigacji, Dywidendach i wykresach Cash Flow

- **Menu:** FIRE ukryty (cele FIRE zostają w Ustawieniach, symulacja – w Symulacjach; `#/fire` → Pulpit). **Cash Flow Forecast (BETA)** to osobna podzakładka Dywidend – kafel na górze zakładki otwiera pełny widok `#/dividends/cashflow` z przyciskiem powrotu (stary `#/cashflow` przekierowuje).
- **Dywidendy:** usunięta prognoza DGR (rolę przejął Cash Flow Forecast); „Dane dywidend” (automatyczna synchronizacja z Yahoo / historii) – w Ustawieniach → Strategie, Cele i Giełda.
- **Wykres przepływów** (`cashFlowSeries`): zakres **Ostatnie 12 mies. / Kolejne 12 mies. / Rok kalendarzowy** (miniona część z rejestru, reszta z prognozy) i podstawa **Naliczanie dzienne** (domyślnie – odsetki obligacji przyrastają dzień po dniu od daty zakupu, bez schodków przy kapitalizacji i wykupie; KO – w miesiącu narastania) albo **Realne wypłaty** (dzień wypłaty dywidendy, kupon / wykup obligacji, dopisanie odsetek KO).
- **Realne daty odsetek KO:** dzień dopisania wyuczony z historii wpisów konta (`postingOffsetDays`, np. ostatni dzień miesiąca) – w „Nadchodzących wypłatach”, tabeli miesięcy i wykresie wypłat.
- **Wykresy historyczne:** zakres „12 mies.” i „Rok kal.” (Pulpit – Majątek, Wykresy).
- **Harmonijka:** rozwinięcie karty zwija pozostałe karty na tym samym poziomie (wspólny `Card collapsible`, `Accordion` domyślnie `exclusive`); lista miesięcy w Cash Flow – jeden miesiąc naraz.

**Kula śnieżna – DRIP:** przełącznik „Reinwestycja dywidend (DRIP): Włączona / Wyłączona” steruje reinwestycją dywidend i odsetek z poduszki. Włączony – co miesiąc otrzymane dywidendy (IKE wg Dividend Yield portfela, pozostałe pozycje wg stopy netto) i odsetki (do progu celu poduszki) są dopisywane do kapitału i od kolejnego miesiąca same generują przepływy; tabela pokazuje kwotę reinwestowaną w każdym roku. Wyłączony – przepływy są wypłacane, kapitał rośnie tylko o wpłaty i dopłaty.

**Nadwyżka odsetek ponad próg celu poduszki → akcje (wyłącznie Kula śnieżna):** gdy poduszka osiągnie cel (twardy limit), odsetki, które się w niej nie mieszczą, w symulatorze wieloletnim (przy DRIP) co miesiąc kupują akcje poza IKE (stopa netto pozostałych pozycji dywidendowych, a bez nich – Dividend Yield portfela po Belce) i same generują dywidendy. Poza symulatorem (Poduszka, wyceny, Cash Flow 12 mies.) aplikacja nie zakłada, co dzieje się z odsetkami ponad próg – to decyzja użytkownika.

**IKE - Julka – izolacja (zweryfikowana testem):** dane konta są wyłącznie w kluczu `wealth-app-ike-julka-v1` (w Supabase w kolumnie `ui_prefs`, osobno od danych portfela `data`) i czytają je tylko `julkaIke.js`, karta w Ustawieniach i automatyczne zakupy przy starcie. Wszystkie globalne wskaźniki – wycena i Majątek Całkowity, tabela Portfela, statystyki (zysk total, TWR), limity IKE, Cash Flow (12 mies., wykres, Kula śnieżna), poduszka, Dividend Yield, historia wpłat IKE – są identyczne z danymi Julki i bez nich.

**Rejestr zakupów surowców i krypto (BETA)** – Ustawienia → Rejestr wpłat i wypłat (zakładka Wpłaty), karta „Zakupy surowców i krypto”: lista zakupów osobno dla złota, srebra, BTC i ETH (data, ilość – g / oz / szt., cena jednostkowa w PLN lub USD z kursem, kwota w PLN), dodawanie, edycja i usuwanie. Zapis w `settings.alternatives.purchases` (localStorage + Supabase). Średnia cena nabycia = średnia ważona ilością (Σ kwot PLN / Σ jednostek; metale w gramach, uncja = 31,1034768 g). Aktywo z zakupami w module Surowce i Krypto bierze ilość i średnią cenę z rejestru (`effectiveHolding`) – wynik w PLN i % liczony z bieżącą ceną z Yahoo; bez zakupów – jak dotąd wpis ręczny.

**Podsumowania AI – niezawodność:** zapytanie do Gemini nie ustawia `httpOptions.timeout` (SDK wysyłał go jako nagłówek `X-Server-Timeout`, przez co Google przerywał generowanie błędem 504 „Deadline expired”); limit czasu tylko po stronie serwera (`abortSignal`, najwyżej 28 s na próbę, budżet 50 s z 60 s funkcji). „Myślenie” modelu wyłączone (`thinkingBudget: 0`; model, który tej opcji nie przyjmuje, dostaje zapytanie bez niej). Przeciążenie (429/500/503/504), zbyt długa odpowiedź i nieczytelny JSON → kolejny model (flash-lite). W aplikacji: najwyżej 2 zapytania naraz i jedna cicha ponowna próba przy przeciążeniu.

**Podsumowania AI z kontekstem portfela:** Newsy wysyłają do `/api/news-summary` listę aktywnych spółek i ETF-ów z portfela inwestycyjnego (`src/lib/aiContext.js`: ticker, nazwa, sektor – z instrumentu albo wbudowanej mapy spółek GPW, udział w portfelu %, stopa dywidendy, najbliższa dywidenda; bez kwot w zł, bez poduszki, bez IKE - Julka). Serwer dodaje sekcję `<portfel>` do zapytania, a model zwraca pole `portfolio` (wpływ bezpośredni / pośredni / brak, spółki z kierunkiem i opisem wpływu, nota) – wyłącznie tickery z portfela (inne odrzucane); „Wpływ na spółkę / inwestora” zaczyna się od spółek z portfela. W widoku blok „Wpływ na Twój portfel” na górze podsumowania. Klucz pamięci podsumowań zależy od składu portfela (zmiana spółek = nowe podsumowanie).

**Listy zakupów – kategorie AI (BETA):** pozycje do kupienia są grupowane wg kategorii sklepowych w kolejności alejek (Warzywa i owoce, Pieczywo, Nabiał i jajka, Mięso i ryby, Wędliny, Mrożonki, Produkty sypkie i makarony, Przyprawy, Konserwy i przetwory, Słodycze i przekąski, Napoje, Chemia gospodarcza, Kosmetyki i higiena, Dla dziecka, Dla zwierząt, Apteka, Dom i inne); kupione – na dole. Nowe produkty (wszystkich list, partiami po krótkiej przerwie w pisaniu) trafiają do tego samego punktu AI co podsumowania newsów (`/api/news-summary`, tryb `shopping`: ta sama kolejka zapytań, modele zapasowe, obsługa przeciążeń; odpowiedź ograniczona schematem do listy kategorii). Wynik zapamiętany per nazwa produktu w `wealth-app-shopping-cats-v1` (localStorage, synchronizacja z chmurą jak ustawienia; bez zmian w tabelach Supabase list zakupów) – raz rozpoznany produkt nie wymaga kolejnego zapytania. Do odpowiedzi AI / bez dostępu do AI – dopasowanie ze słownika (`src/lib/shoppingCategories.js`). Przełącznik „Grupuj wg kategorii”.
