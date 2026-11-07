> Kopia planu z `~/AppData/Local/Temp/claude/245933ae392e2ff9/116b2451-fd94-4e13-ab60-07ded92b3ccd/scratchpad/plan-demo/plan.md`, zrobiona 2026-11-07. Objaśnienie z rysunkami: [Skok do nagłówka z palety](plan-demo.html).

# Plan: skok do nagłówka z palety

Stan wyjściowy: drzewo robocze gałęzi `markdown-i-duze-biblioteki` z niezatwierdzonymi zmianami innych sesji. Plan niczego jeszcze nie zmienia w kodzie.

## Cel

W palecie (`Ctrl K`) wpisuję `#` i fragment tytułu rozdziału, a lista pokazuje nagłówki otwartego dokumentu, z wcięciem według poziomu i zaznaczonym dopasowaniem. Enter przewija dokument do rozdziału tak samo jak klik w spisie treści (`G`): na tej samej sprężynie, z pigułką bieżącego rozdziału w spisie i klawiaturą oddaną dokumentowi. Escape zamyka paletę bez ruchu. Bez otwartego dokumentu tryb mówi, że potrzebuje dokumentu.

Dziś paleta zna dokumenty, uwagi i akcje. Nagłówki zna tylko panel spisu treści, który trzeba otworzyć i przewinąć myszą.

## Jak to działa dziś

- Spis zbiera strona dokumentu: `collectHeadings` w `src/preload/outline.ts` czyta widoczne `h1`–`h6` i `[role="heading"]`, w kolejności na ekranie, najwyżej 400.
- `startMinimap` w `src/preload/minimap.ts` wysyła spis do procesu głównego zdarzeniem `outline` (także przy wyłączonej minimapie) i bieżący rozdział zdarzeniem `outline-at`. Odświeża go po każdej zmianie w DOM.
- `DocViewer` w `src/main/docViewer.ts` sprawdza zdarzenie (`parseOutline`) i przekazuje je do powłoki (`viewer:overlay-event`).
- Powłoka trzyma ostatni spis każdego dokumentu w `outline.docs` (`src/renderer/src/shell/outline.ts`). Panel `Outline.tsx` rysuje go, a klik woła `jumpToHeading(index)`.
- Skok to numer na liście: `viewer:outline` → `DocViewer.outline` → `outline:command` → `jump(index)` w `minimap.ts`. W wąskim oknie `jumpToHeading` zamyka panel boczny.
- Paleta (`src/renderer/src/shell/palette.ts`, widok `src/renderer/src/ui/Palette.tsx`) buduje wiersze w `buildRows`: dokumenty z biblioteki, trafienia w treści z wątku biblioteki (`library:search` → `libraryWorker` → `SearchIndex.search`), uwagi i akcje. Prefiks `?` otwiera ściągę, a `słowo:` zaczyna żeton filtra.
- Gdy paleta jest otwarta, arkusze stoją jako zrzuty (`cover('palette')` w `native.ts`), więc ruch dokumentu pod paletą nie byłby widoczny.
- Indeks biblioteki (`src/main/searchIndex.ts`) ma tylko liczbę nagłówków `h1`–`h3` na plik i tekst bez znaczników. Listy nagłówków nie ma.

## Podejście

Paleta czyta spis, który powłoka już ma. Tryb `#` bierze `outline.docs` dokumentu z fokusem, dopasowuje nagłówki czystą funkcją w `src/shared/outline.ts` i przy Enterze woła ten sam `jumpToHeading`, co panel. Proces główny i wątek biblioteki zostają bez zmian. Indeks nagłówków całej biblioteki to osobny, drugi etap, zależny od decyzji 1.

Analogia: paleta to katalog kartkowy biblioteki, a spis treści leży otwarty przy książce na biurku. Plan uczy katalog czytać ten spis, zamiast od razu katalogować rozdziały wszystkich książek.

## Kroki

### Krok 1: dopasowanie nagłówków w module wspólnym

- `src/shared/outline.ts`: `matchHeadings(headings, query)` zwraca nagłówki z numerem, ścieżką rodziców i zaznaczeniami. Puste zapytanie to cały spis w kolejności dokumentu. Kolejność trafień: fragment od początku słowa, fragment w środku, wszystkie słowa osobno, luźny podciąg. Litery jak w `normalizeText`, więc „nagl” trafia „Nagłówki”.
- `tests/outline.test.ts` (nowy): kolejność, polskie litery, ścieżka przy przeskoku poziomu (`h1` → `h3`), pozycje zaznaczeń.
- Rozmiar S. Gotowe, gdy nowy test przechodzi w `npm test`.

### Krok 2: skok niesie tekst nagłówka

- `src/shared/outline.ts`: `OutlineCommand` typu `jump` dostaje opcjonalne `text`, a `parseOutlineCommand` je sprawdza i przycina.
- `src/preload/minimap.ts`: `jump` porównuje tekst. Gdy pod numerem stoi inny nagłówek, zbiera spis od nowa i bierze pierwszy o tym tekście.
- `src/renderer/src/shell/outline.ts`: `jumpToHeading(index, { text, keepPanel })`. Z palety panel boczny zostaje otwarty także w wąskim oknie.
- `tests/outlineCommand.test.ts` (nowy): parser przyjmuje `jump` z tekstem i bez, odrzuca tekst, który nie jest napisem, i przycina za długi.
- Rozmiar S. Niezależny od kroku 1. Gotowe, gdy nowy test przechodzi, a klik w spisie działa jak dotąd (`outlineFlow` w `tests/e2e/outline.mjs`).

### Krok 3: tryb `#` w palecie

- `src/renderer/src/shell/palette.ts`: wiersz `{ type: 'heading', docId, index, heading, path }`, tryb włączany w `onCmdInput`, gdy zapytanie zaczyna się od `#`; `buildRows` zwraca nagłówki dokumentu z fokusem; `runCmd` zamyka paletę i woła `jumpToHeading`; `openCmd` prosi o świeży spis (`requestOutline`). Akcje wiersza: Przejdź, Pokaż w spisie treści.
- `src/renderer/src/ui/Palette.tsx`: wiersz z poziomem i wcięciem, podgląd ze ścieżką rodziców i numerem rozdziału, podpowiedź w stopce.
- `src/shared/en.ts`: każdy nowy napis przez `t()` z wpisem po angielsku, np. „Nagłówki”, „Przejdź do rozdziału”, „Otwórz dokument, żeby skakać po jego nagłówkach.”, „Rozdział {n} z {total}”.
- Rozmiar M. Po krokach 1 i 2. Gotowe, gdy `#` w palecie nad otwartym dokumentem pokazuje jego spis, a Enter przewija dokument; `tests/i18n.test.ts` przechodzi.

### Krok 4: odkrywalność i test e2e

- `src/renderer/src/shell/palette.ts`: akcja „Przejdź do nagłówka”, która wpisuje `#`, i wiersz w ściądze w grupie „W palecie”.
- `tests/e2e/outline.mjs`: scenariusz `Ctrl K`, `#spis`, Enter, a potem `.toc-row.on` to „Spis treści”. Drugi: wąskie okno z otwartymi Uwagami, skok z palety ich nie zamyka.
- `design/DESIGN.md`: sekcja „Minimapa i spis treści” i tabela skrótów.
- Rozmiar S. Gotowe, gdy `npm run test:e2e` przechodzi z nowymi scenariuszami.

### Etap 2: cała biblioteka (tylko gdy decyzja 1 to wybierze)

### Krok 5: nagłówki w indeksie biblioteki

- `src/main/classify.ts`: `analyzeHtml` zbiera listę nagłówków (poziom, tekst, `id`) prototypem z eksperymentu, z poprawką kolejności `trim` przed znakiem kotwicy.
- `src/main/searchIndex.ts`: tabela `doc_headings` przez `CREATE TABLE IF NOT EXISTS`, bez podnoszenia `SCHEMA_VERSION`, bo podniesienie kasuje cały indeks. Zapis w tej samej transakcji co `putDocText`.
- `src/main/library.ts`: `persist` uzupełnia nagłówki także dokumentom, które mają już tekst w indeksie. Zapisuje tylko Markdown i nagłówki HTML z `id`.
- Testy w `tests/classify.test.ts` i `tests/library.test.ts`.
- Rozmiar M. Niezależny od kroków 1–4.

### Krok 6: zapytanie o nagłówki przez wątek biblioteki

- `src/main/searchIndex.ts`: `searchHeadings(query)` po tekście znormalizowanym, tylko fragment od początku słowa, limit 60.
- `src/main/libraryProtocol.ts`, `src/main/libraryWorker.ts`, `src/main/libraryClient.ts`, `src/main/library.ts`: polecenie `headings`.
- `src/main/index.ts`, `src/preload/shell.ts`, `src/shared/types.ts`: `library:headings` i `searchHeadings` w API okna.
- Rozmiar M. Po kroku 5.

### Krok 7: nagłówki innych dokumentów w palecie

- `src/renderer/src/shell/palette.ts`, `src/renderer/src/ui/Palette.tsx`: pod nagłówkami otwartego dokumentu grupa „W innych dokumentach”.
- Enter na zamkniętym dokumencie: `openDoc` i nowe `viewer:aim` (`src/main/index.ts`, `src/preload/shell.ts`, `src/shared/types.ts`) do istniejącego `DocViewer.aim`. Na otwartym: skok po tekście z kroku 2, bo `aim` przeładowuje stronę.
- `src/shared/en.ts`: nowe napisy.
- Rozmiar M. Po krokach 3 i 6.

## Decyzje

### Decyzja 1: otwarty dokument czy cała biblioteka

Czy `#` ma szukać tylko w otwartym dokumencie, czy także w nagłówkach wszystkich dokumentów z indeksu?

- Tylko otwarty dokument: kroki 1–4. Spis z okna, więc działa także dla HTML ze skryptami.
- Otwarty dokument i cała biblioteka: kroki 1–7. Nowa tabela w indeksie i polecenie wątku biblioteki.
- Tylko indeks: jeden mechanizm, ale dla otwartego HTML lista z pliku bywa inna niż spis w oknie.

Rekomendacja: tylko otwarty dokument. Etap 2 da się dołożyć później pod tym samym prefiksem.

### Decyzja 2: jak wejść w tryb nagłówków

- Prefiks `#` w polu palety.
- Żeton `rodzaj: Nagłówki` w istniejącym filtrze.
- Osobny skrót, np. `Ctrl Shift O`, z wpisem w `isAppChord`, żeby dokument go nie połknął.

Rekomendacja: `#`, bo to znak nagłówka w Markdownie i nie zależy od języka interfejsu.

### Decyzja 3: co widać przy przesuwaniu wyboru

- Dokument rusza dopiero po Enterze, a paleta pokazuje ścieżkę rozdziału i jego numer.
- Dokument jedzie za wyborem na liście, jak w VS Code.

Rekomendacja: po Enterze, bo pod otwartą paletą arkusz jest zrzutem i ruchu by nie było widać.

## Ryzyka

- Spis jeszcze nie przyszedł (powłoka po przeładowaniu, dokument się ładuje): `openCmd` prosi o spis, a lista pokazuje szkielet jak panel.
- Spis HTML zmienia się po wczytaniu, więc numer może wskazać inny nagłówek: skok niesie tekst (krok 2).
- W wąskim oknie skok zamyka panel boczny: opcja `keepPanel` (krok 2).
- Etap 2: spis z pliku nie zgadza się ze spisem w oknie dla połowy dokumentów HTML, a nagłówki HTML rzadko mają `id`: indeks tylko dla Markdownu i HTML z `id`.
- Etap 2: podniesienie `SCHEMA_VERSION` przebudowuje cały indeks przy pierwszym starcie: nowa tabela bez podnoszenia wersji.
- Etap 2: luźny podciąg daje setki trafień na krótkie zapytania: w bibliotece tylko fragment od początku słowa.

## Weryfikacja

- `npm test`: nowy `tests/outline.test.ts` i istniejący `tests/i18n.test.ts`.
- `npm run test:e2e`: scenariusze z kroku 4 w `tests/e2e/outline.mjs`.
- Ręcznie: długi Markdown, `Ctrl K`, `#ryz`, Enter; HTML z nagłówkami ze skryptu (`Silos-pivot-lamiglowki-v3.html`); wąskie okno z otwartymi Uwagami.

## Poza zakresem

- Nagłówki w zwykłych wynikach palety bez prefiksu.
- Kopiowanie odnośnika do nagłówka.
- Podgląd na żywo pod paletą.
