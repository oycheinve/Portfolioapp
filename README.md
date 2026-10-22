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
- **Podsumowania w Wykresach** (dawna zakładka Statystyki): pod wykresem głównym jedna pionowa lista – rodzaje wykresów (kliknięcie przełącza wykres u góry) i na jej końcu dwa rozwijane moduły – Podsumowanie roku i miesiące (rozwinięte) oraz Lata kalendarzowe, liczone dla portfela inwestycyjnego (bez filtra konta). Stary adres `#/stats` przekierowuje do `#/charts`.
- **Wykresy**: centrum wykresów z benchmarkami i mapa cieplna dnia.
- **Kapitał bezpieczny** (nowa): obligacje, konta oszczędnościowe i gotówka na rachunkach w jednym module + odczyty CPI.
- **Notowania** (nowa): kursy, waluty i przelicznik. **FIRE** zawiera kartę dochodu pasywnego. **Raport na X** – sam generator.

## Przebudowa zakładek (Portfel, Wykresy, Dywidendy, Symulacje)

- **Portfel**: filtr w rozwijanym przycisku „Filtruj portfel”; tabela w zwijalnych sekcjach z kolumnami: Walor, Operacje (historia w oknie), Zmiana dzienna, Liczba jednostek, Śr. cena zakupu [PLN], Cena aktualna [PLN], Okres inwestycji, Wartość waloru [PLN], Udział [%], Stopa zwrotu [%], Zysk [PLN].
- **Pulpit**: tylko Majątek Całkowity z wykresem kołowym i podsumowanie kont.
- **Wykresy i notowania**: wybór wykresu z listy (wartość vs wkład, zysk, drawdown, dywidendy, mapa cieplna, notowania i waluty), obok wybór aktywów i benchmarków.
- **Dywidendy**: automatyczna synchronizacja (historia dywidend z Yahoo Finance; offline – prognoza z historii wypłat), opcjonalne automatyczne księgowanie wypłat; usunięto sekcję raportów/WZA (`src/lib/dividendSync.js`).
- **Symulacje i kalkulator** (nowa zakładka): Symulacja FIRE (opcje celu w zwijanym panelu, dochód pasywny), Stress test / Co jeśli, Kalkulator inwestycyjny (`src/lib/calculator.js`) – układ: dane wejściowe → wykres → wyniki.
- Dolny pasek na telefonie: Pulpit, Portfel, Wykresy, Dywidendy, Cele, Więcej (pozostałe sekcje w arkuszu „Więcej”; kolejność w `MOBILE_ORDER` w `src/components/Layout.jsx`, menu boczne bez zmian). Stare adresy `#/fire`, `#/stress`, `#/quotes` przekierowują do nowych miejsc.

## Usprawnienia: Portfel, akordeony, własne benchmarki, koszty FX

- **Portfel**: wiersz „Cały portfel” na górze i na dole tabeli; kolumny: Walor (z ikonami operacji: dochód, sprzedaż, przewalutowanie), Operacje, Zmiana dzienna [%], Liczba jednostek, Śr. cena zakupu, Cena aktualna, Okres inwestycji [dni], Wartość, Udział [%], Stopa zwrotu, Zysk. Sekcje: Konta gotówkowe, Akcje GPW, ETF-y zagraniczne, ETF/ETC/ETN GPW, Obligacje skarbowe.
- **Akordeony**: Podsumowania w Wykresach (Podsumowanie roku i miesiące · Lata kalendarzowe), Dywidendy (Kalendarz · Rejestr wypłat · Prognoza DGR), Alokacja (Wagi klas · Wagi instrumentów · Kalkulator dopłaty · Analiza TER). Rozwinięte sekcje są zapamiętywane.
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

Zakładka „Budżet (Demo)” (`#/budget`, w „Więcej” i menu bocznym; `src/views/Budget.jsx`, `src/lib/budget.js`): minimalistyczna tabela wzorowana na arkuszu Excel – „Budżet na: {miesiąc}”, granatowy nagłówek, kolumny Kategoria, Planowany Budżet, Kwota Wydana, Pozostało (plan − wydane, na czerwono po przekroczeniu) i wyróżniony wiersz RAZEM. Komórki pokazują sformatowane wartości („2 300,00 zł”, nazwy zawijane), kliknięcie otwiera edycję (Enter / kliknięcie obok zatwierdza). Panel „Dodaj zakup” pod tabelą: lista kategorii z tabeli + kwota (także z przecinkiem) → „Dodaj do wydanych” dopisuje kwotę do Kwoty Wydanej, Pozostało i RAZEM przeliczają się automatycznie (Enter też zatwierdza; potwierdzenie z kwotą pozostałą). Dodawanie (nowy wiersz od razu w edycji nazwy) i usuwanie kategorii, zmiana miesiąca, „Kopiuj plan” z poprzedniego miesiąca. Kafelek „Na co dzień”: dni do końca miesiąca (z dzisiejszym) i średnia kwota dzienna do wydania w kategorii jedzeniowej (automatycznie „Jedzenie…”, do zmiany z listy) – np. „Do końca miesiąca pozostało 10 dni. Na „Jedzenie (Reszta)” możesz wydawać średnio 73,45 zł dziennie”. Miesiąc bez danych pokazuje przykładowe kategorie (zapis przy pierwszej edycji). Trwałość: każda zmiana zapisywana od razu w przeglądarce; po zalogowaniu zmiana budżetu wysyła też ustawienia do chmury (zdarzenie `wealth-app-prefs-changed`), a niewysłane zmiany mają pierwszeństwo przed kopią z chmury – odświeżenie nie przywraca starszego budżetu. Dane w localStorage `wealth-app-budget-v1` – w kopii zapasowej JSON i ustawieniach synchronizowanych z chmurą; nie wpływają na portfel.

## FIRE {rok} i porządek w „Więcej”

- **FIRE {rok docelowy}** (`#/fire`, `src/views/FireGoal.jsx`) – osobna sekcja w „Więcej” i w menu bocznym (nazwa z rokiem z celów FIRE): pierścień „osiągnięte”, główny wskaźnik „Do celu FIRE brakuje X%” wg kryterium (oba cele / dochód / majątek), karty postępu majątku i miesięcznego dochodu pasywnego (z kwotą brakującą), szacowany termin osiągnięcia z symulacji FIRE, przyciski „Symulacja i projekcja FIRE” i „Zmień cele FIRE” (`#/settings/fire`). Dawny adres `#/fire` prowadzi teraz tutaj (symulacja: `#/simulations/fire`).
- **Wykres prognozy FIRE** (`src/components/fire/FireProjectionChart.jsx`, w widoku FIRE i w symulacji FIRE): majątek i dochód pasywny na liniowej osi czasu kończącej się w miesiącu, w którym wybrany scenariusz osiąga cel FIRE (wg kryterium z ustawień) – wcześniej lub później niż rok docelowy; znacznik „FIRE” w punkcie osiągnięcia, pionowa linia roku docelowego (gdy wypada przed końcem), scenariusze skrajne ucięte w tym samym miejscu; bez osiągnięcia celu – prognoza do 2100 z komunikatem (`fireChartPoints` w `src/lib/fire.js`).
- **Ustawienia** – wszystkie sekcje (Konta inwestycyjne, Podatki, Notowania, Limity IKE/IKZE, Cele FIRE, Nieruchomości, Chmura, Kopia zapasowa) jako jednoliniowe belki z nazwą i strzałką, domyślnie zwinięte; kliknięcie płynnie rozwija / zwija sekcję (opis i przyciski sekcji widoczne po rozwinięciu). Mechanizm: `Card` z `collapsible` albo `CardCollapseContext` (włączony w widoku Ustawień); `#/settings/fire` otwiera Cele FIRE.
- **Kolejność w „Więcej”**: Poduszka finansowa, Symulacje i kalkulator, Alokacja i Dopłaty, FIRE, Raport na X, Rejestr Wpłat/Wypłat, Budżet (Demo), a na końcu Konta i ustawienia oraz przełącznik motywu (`MORE_ORDER` w `Layout.jsx`).

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
