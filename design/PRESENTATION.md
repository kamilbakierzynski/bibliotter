# Tryb prezentacji

Ustalenia z brainstormu z 2026-11-07. Wdrożone są kamera, kształty oraz zapis i formularz trasy. Odtwarzania jeszcze nie ma.

## Po co

Długie dokumenty omawiasz na spotkaniach i chcesz skupić się na najważniejszych rzeczach zamiast przewijać. Wcześniej układasz trasę po dokumencie, a na spotkaniu klikasz przez nią. Plik dokumentu się nie zmienia, bo apka jest viewerem. Trasa leży obok niego, tak jak uwagi. Pełny ekran to tylko „nice to have”.

## Decyzje

| Temat | Ustalenie |
|---|---|
| Krok | Jedno kliknięcie. Płaska lista, bez slajdów z kilkoma kliknięciami. |
| Kształty i strzałki | Należą do dokumentu, jak karteczki. Krok tylko mówi, co pokazać, np. kilka strzałek i notatkę. |
| Układanie trasy | Ręcznie w formularzu albo przez agenta. |
| Włączenie | Dokument zamienia się w prezentację, a dok staje się sterowaniem. |
| Uwagi w trakcie | Da się szybko dodać komentarz, karteczkę i resztę uwag. |
| Nowa uwaga | Nie wchodzi do trasy. Zostaje widoczna na swoim kroku do końca prezentacji. |
| Styl kształtów | „Tusz”: linia cienieje na końcach, ta sama rodzina co wskaźnik i zakreślacz. |
| Zwykły widok | Kształty są widoczne. Przełącznik nad arkuszem chowa rysunki, a apka pamięta to osobno dla dokumentu. W prezentacji ten sam przełącznik pokazuje schowane uwagi. |

## Założenia do potwierdzenia

Użytkownik nie zgłosił do nich uwag, ale nie zatwierdził ich wprost.

- Reszta dokumentu to ustawienie kroku: normalnie, przygaszona albo ukryta.
- Zasłona to zwykły kształt na liście „Pokaż w tym kroku”. Odsłonięcie fragmentu to jej wyłączenie w kroku.
- Krok pamięta pełną listę tego, co widać. Nowy krok startuje jako kopia poprzedniego.
- W prezentacji widać tylko to, co wskazuje krok, plus uwagi dodane w trakcie. Pinezki komentarzy znikają.
- Kształty rysują się na oczach widzów przy wejściu kroku.
- Zestaw kształtów: strzałka, prostokąt, elipsa, linia i zasłona.
- Kolory: cztery nazwy z karteczek, w ciemniejszych odcieniach. Pomarańcz zostaje tylko dla „czeka na Ciebie”.
- Oba końce strzałki przyczepiają się do elementów.
- Nowa uwaga siada przy fragmencie aktywnego kroku, a klik w dokument wskazuje inne miejsce. Pole jest nad dokiem. Enter zapisuje, Esc anuluje.
- Po wyjściu z prezentacji pojawia się lista „Dodane podczas prezentacji”.
- Klik w dokument nie przechodzi dalej, bo kliknięcia muszą działać w dokumentach z quizami. Kroki zmieniają dok i klawiatura.
- Dokument z co najmniej jednym krokiem jest prezentacją, bez osobnego znacznika.
- W prezentacji szyna i panele znikają, a arkusz zajmuje całe okno.
- Można przewinąć dokument poza krok, a następny klik wraca na trasę.
- Jeden dokument ma jedną trasę.

## Model

Stan ekranu liczy się z samego numeru kroku, bez historii. Dzięki temu strzałka wstecz i skok do dowolnego kroku nie potrzebują osobnej logiki.

```ts
interface PresentationStep {
  id: string
  title: string
  /** `hold` zostawia kamerę z poprzedniego kroku. */
  camera: { kind: 'hold' } | { kind: 'place'; anchor: Anchor } | { kind: 'area'; anchor: Anchor; box: FractionBox }
  rest: 'normal' | 'dim' | 'hide'
  /** Identyfikatory uwag widocznych w tym kroku. */
  show: string[]
}
```

- **Trasa:** jeden plik `library/<dokument>/presentation.json` obok `annotations/`. Zapis jak w `annotationStore.ts`, bo agent pisze przy otwartej apce. Krok z brakującą kotwicą zostaje na liście z ostrzeżeniem, a odtwarzanie go pomija.
- **Kształt:** nowy rodzaj uwagi `shape`, z geometrią w ułamkach elementu kotwicy, jak `strokes`. Strzałka ma drugą kotwicę. Uwagi rodzaju `shape` mają odbiorcę `me`, żeby agent domyślnie je pomijał.
- **Maska:** jeden prostokąt wokół kadru, rysowany w warstwie dokumentu, więc nie dotyka DOM dokumentu. Przygaszenie i ukrycie różnią się tylko kryciem.
- **Tusz:** kształt jest równy, więc nie potrzebuje śladu `Trail`. Bierze od wskaźnika zwężenie końców i najcieńszy koniec, a własną wstęgę liczy w `src/preload/shapeInk.ts`.

## Interfejs

- **Formularz:** nowy widok panelu. Lista kroków, a pod nią nazwa, Kadr (Bez ruchu, Miejsce, Obszar), Reszta dokumentu i Pokaż w tym kroku. Obszar rysujesz przeciągnięciem, a Miejsce wskazujesz kliknięciem.
- **Dok w zwykłym widoku:** nowe narzędzie Kształt z tacą typów i kolorów oraz przycisk Prezentuj.
- **Dok w prezentacji:** wstecz, numer kroku, dalej, nazwa kroku, kropki do skoku, narzędzia uwag, licznik dodanych uwag i wyjście.
- **Klawisze:** strzałki, spacja oraz `PgUp` i `PgDn` dla pilotów. `Esc` najpierw anuluje uwagę, a potem kończy prezentację. `A` (kształt), `D` (przełącznik rysunków) i `Shift P` (formularz trasy) już działają. Prezentuj to `F5`, a `Shift F5` zaczyna od wybranego kroku. Nowe litery trzeba dopisać do `OVERLAY_KEYS`.
- **Pole nowej uwagi:** w warstwie doku, jak paleta, więc dokument nie musi zamarzać na czas pisania.

Agent dostaje narzędzia MCP i polecenia CLI do odczytu i zapisu całej trasy, razem z nowymi kształtami. Miejsca wskazuje cytatem lub selektorem. CLI i MCP są po angielsku, a każdy napis w apce idzie przez `t()` i `en.ts`.

## Zoom: wynik próby

Próba z 2026-11-07 szła na Electronie 45.2.3 w `WebContentsView` z ustawieniami jak w `docViewer.ts`, na ukrytym pulpicie, przy zoomie 2,5×. Dokumenty: strona ze stałym nagłówkiem i `maximum-scale=1`, prawdziwy arkusz `DESIGN.md`, strona z animowanym canvasem i quizem oraz `design/lab.html`.

**Wniosek:** w spoczynku skala strony, a w ruchu zrzuty. Sam żywy zoom przeszedł wszystkie trzy warunki, ale jego animacja szarpie, więc ruch kamery robi istniejące zamrażanie.

| Droga | Wynik |
|---|---|
| Skala strony (`Emulation.setPageScaleFactor`), kadr przez `scrollIntoView` | **Wybrana na spoczynek.** Układ bez zmian na 4 z 4 dokumentów. Tekst ostry, strona żywa. Klik trafia w ten sam element w 5 z 5 punktów, z błędem do 0,9 px. Skalę ekranu 1,5 i zamknięty Shadow DOM sprawdziłem na 3 dokumentach, bez arkusza Markdownu. Po wyjściu stan wraca co do piksela na dokumentach bez animacji. |
| Ta sama skala zmieniana co klatkę | **Odpada na ruch.** Polecenia przychodzą co drugą klatkę, a cel cofa się na ekranie nawet o 40 px. |
| `Input.synthesizePinchGesture` | **Odpada.** Przy kotwicy liczonej pod kadr 2 z 4 dokumentów skończyły się błędem `Position out of bounds`, a na pozostałych kadr potrafił skończyć w złym miejscu. Przyczyny błędu nie badałem. |
| `viewport` w `Emulation.setDeviceMetricsOverride` | **Odpada.** Kliki trafiają w miejsce sprzed powiększenia, a przy ujemnym `x` zoom w ogóle się nie włączył. |
| `transform` na korzeniu dokumentu | **Odpada.** Przesuwa stały nagłówek ok. 3700 px poza ekran, pokazuje paski przewijania i zmienia współrzędne `getBoundingClientRect`. |
| Powiększony zrzut `capturePage` | **Tylko na ruch.** Trwa 13 do 20 ms, ale obraz jest wyraźnie rozmyty. |
| `setZoomFactor` | **Odpada.** Przelewa tekst. |

### Mechanizm

1. Na czas prezentacji `setVisualZoomLevelLimits(1, 5)` i `webContents.debugger.attach('1.3')`. Po wyjściu oba trzeba cofnąć.
2. Zrzut obecnego stanu i przejście widoku poza okno, jak w zamrażaniu.
3. `setPageScaleFactor` i `scrollIntoView` niewidocznego punktu w środku kadru. Oba polecenia razem trwają 4 do 14 ms.
4. Zrzut stanu końcowego. Zrzut zaraz po poleceniach pokazuje jeszcze stary stan, a po 260 ms był już gotowy, więc trzeba poczekać na klatkę. Ten zrzut jest identyczny z żywym widokiem na dokumentach bez animacji.
5. Powłoka animuje zrzuty na sprężynie i wraca do żywego widoku.

Sprawdzone są kroki 1 do 4. Krok 5 opiera się na istniejącym zamrażaniu, ale nie był testowany dla zoomu.

### Wdrożenie kamery

Kamera działa na prawdziwej warstwie od 2026-11-07, ale nic w interfejsie jej jeszcze nie woła. Tryb prezentacji użyje `aimCamera(i, kadr)` z `src/renderer/src/shell/camera.ts`, a `null` wraca do całej strony. Do testów powłoka ma `window.bibliotterCamera.aim(docId, kadr)`.

- **Kadr** to kotwica elementu, opcjonalnie z kawałkiem w ułamkach, albo prostokąt na stronie (`src/shared/camera.ts`). Skala wypełnia 90% widoku nad dokiem, od 1 do 4.
- **Ruch** zależy od tego, czy kadry się mieszczą jeden w drugim. Jeśli tak, kamera przejeżdża przez oba zrzuty wokół punktu, który stoi w miejscu, a ostrzejszy zrzut przenika z wierzchu. Skok w daleki kadr nie ma pikseli na drogę, więc stary obraz odpływa w stronę ruchu, a nowy wpływa za nim.
- **Warstwa** kontruje powiększenie. Pinezki, karteczki i kropki zakreślacza skalują się o `1/skala` wokół punktu, którym wskazują miejsce. Ręka i zakreślacz liczą się w pikselach ekranu. Prostokąty dla powłoki są przeliczane na ekran widoku, więc szkic uwagi staje w miejscu kliknięcia.
- **Test** `tests/e2e/camera.mjs` sprawdza 12 rzeczy: brak pustej klatki i ruch w jedną stronę w każdym z trzech ruchów, kadr na środku, brak zmiany układu, stały rozmiar karteczki i ręki, trafienie kliknięcia, kotwicę komentarza i powrót.

Nowe ograniczenia:

- Chromium zaokrągla przewinięcie do całych pikseli strony, więc przy skali 4 kadr może zejść ze środka o ok. 6 px ekranu.
- Linie wskaźnika i zakreślacza leżą na stronie, więc pod zoomem są grubsze.
- Szukanie w dokumencie i podgląd linku nie znają jeszcze powiększenia.

### Ograniczenia

- Kadr nie wyjdzie poza krawędź strony. Cel przy lewym brzegu zostaje widoczny, ale nie stanie na środku. W próbie różnica wyniosła ok. 60 px.
- Canvas 2D jest żywy, ale rozmyty, bo ma własną rozdzielczość. Tekst, HTML i SVG są ostre.
- Pinezki i karteczki rosną razem ze stroną. Żeby zachowały rozmiar, warstwa musi kontrować `visualViewport.scale`.
- Kółko podczas zoomu przesuwa kadr. Skrypt dokumentu, który przewija stronę, też go przesunie.
- W czasie ruchu widać obraz, więc animacje dokumentu stoją na ekranie przez ok. sekundę, choć jego skrypty działają dalej.

### Czego próba nie objęła

- Prawdziwej warstwy `overlay.ts`, tuszu z `mix-blend-mode`, wskaźnika i pełnego cyklu ze sprężyną w powłoce.
- Działania z otwartym DevTools, bo oba korzystają z debuggera.
- Najkrótszego bezpiecznego czekania przed zrzutem końcowym.

## Wdrożenie kształtów

Kształty działają w zwykłym widoku od 2026-11-07. Opis zachowania jest w `design/DESIGN.md`, w części „Kształty”.

- **Zestaw:** strzałka, prostokąt, elipsa i linia. Zasłona czeka na tryb prezentacji, bo bez kroków nie ma czego odsłaniać.
- **Zapis:** uwaga rodzaju `shape` z odbiorcą `me` i bez wiadomości. Prostokąt i elipsa mają pole `shape.box` w ułamkach elementu kotwicy, a linia i strzałka mają drugą kotwicę w `shape.end`. `parseShape` w `src/main/annotationStore.ts` sprawdza geometrię, która przychodzi z warstwy albo od agenta.
- **Przełącznik:** apka pamięta schowane rysunki w powłoce, osobno dla dokumentu, a proces główny przekazuje to warstwie przy każdym załadowaniu. Tryb prezentacji użyje go do pokazania schowanych uwag.
- **Testy:** `tests/shapes.test.ts` sprawdza geometrię tuszu, gumkę, Shift i zapis. `tests/e2e/shapes.mjs` sprawdza 13 rzeczy: skrót i tacę, kotwicę i ułamki prostokąta, tusz na krawędzi, kliknięcie bez rysunku, kwadrat z Shiftem i cofanie, `Esc` w trakcie, strzałkę za przesuniętym elementem, gumkę, brak na liście uwag, przełącznik po przeładowaniu i po restarcie oraz brak błędów.

Ograniczenia:

- Kształt nie ma jeszcze edycji. Żeby go zmienić, trzeba go usunąć i narysować od nowa.
- Kształtu nie da się wybrać do przesunięcia ani zmiany koloru.

## Wdrożenie trasy

Trasę można układać od 2026-11-07, a odtwarzać od tego samego dnia (część „Wdrożenie odtwarzania”). Model i sprawdzanie leżą w `src/shared/presentation.ts`, zapis w `src/main/presentationStore.ts`, a formularz w `src/renderer/src/ui/Route.tsx` i `src/renderer/src/shell/route.ts`.

- **Zapis:** `library/<dokument>/presentation.json`, przez plik tymczasowy i sygnał `presentation`, tak jak uwagi. Pusta trasa nie zostawia pliku. Zły krok z pliku znika przy odczycie, a reszta trasy zostaje. Formularz zapisuje od razu, a nazwę kroku po 0,4 s przerwy w pisaniu. Zmiana na dysku, np. od agenta, wraca do formularza, chyba że czeka niezapisana zmiana użytkownika.
- **Formularz:** czwarty widok panelu, pod `Shift P` i w palecie. Na górze lista kroków, pod nią wybrany krok: nazwa, Kadr, Reszta dokumentu i Pokaż w tym kroku. Krok przesuwa się strzałkami w nagłówku albo `Alt ↑` i `Alt ↓` na liście. Usunięty krok wraca przyciskiem „Przywróć krok” do następnej zmiany.
- **Kadr:** Miejsce to kliknięcie. Kamera bierze cały blok pod kursorem, np. akapit albo obraz, a nie słowo, i ramka pokazuje go przed kliknięciem. Obszar to przeciągnięcie, zapisane w ułamkach elementu pod środkiem, jak prostokąt kształtu. Bez ruchu zostawia kamerę z najbliższego wcześniejszego kroku, a pierwszy taki krok pokazuje cały dokument. `Esc` przerywa wskazywanie.
- **Dokument przy otwartym formularzu** pokazuje przerywaną ramką kadr wybranego kroku, z nazwą kroku nad ramką. Ramka leży na stronie, więc pod zoomem kamery rośnie razem z treścią. Warstwa sprawdza też, czy kadry wszystkich kroków mają swoje elementy, a krok bez elementu dostaje ostrzeżenie na liście i w opisie kadru.
- **Podgląd kadru** (oko w nagłówku) ustawia kamerę z etapu 1 na kadrze wybranego kroku i jedzie za wyborem. Wyłączenie podglądu, zamknięcie panelu albo zmiana widoku panelu wraca do całej strony.
- **Nowy krok** staje za wybranym jako jego kopia: ta sama reszta dokumentu i te same uwagi, a kamera bez ruchu.
- **Testy:** `tests/presentation.test.ts` sprawdza kadr kroku bez ruchu, kopię kroku, przesuwanie, sprawdzanie pliku i zapis. `tests/e2e/route.mjs` sprawdza 16 rzeczy: otwarcie, zapis, nazwę w trakcie pisania, Miejsce bez kliknięcia w dokument, ramkę, kopię kroku, Obszar w ułamkach, resztę dokumentu i uwagi, przesuwanie, podgląd kamerą, `Esc`, ostrzeżenie i jego zniknięcie po przeładowaniu, przywrócenie kroku, zmianę od agenta, zamknięcie panelu i brak błędów.

Ograniczenia:

- `Ctrl+Z` nie obejmuje trasy. Usunięty krok wraca przyciskiem, a pozostałe zmiany są drobne i łatwe do powtórzenia.
- Krok nie ma jeszcze kolejności pokazywania uwag. Wszystkie zaznaczone pojawią się razem przy wejściu kroku.
- Dwa okna apki z otwartym formularzem tego samego dokumentu nadpisują sobie trasę. Ostatni zapis wygrywa.

## Wdrożenie odtwarzania

Prezentacja działa od 2026-11-07. Tryb prowadzi `src/renderer/src/shell/present.ts`, pilota rysuje `src/renderer/src/ui/Dock.tsx`, maskę kładzie `src/preload/routeFrames.ts`, a pióro rysuje kształty w `src/preload/shapes.ts`. Stan kroku liczy `stepState` w `src/shared/presentation.ts`.

- **Wejście:** `F5`, przycisk Prezentuj w doku i paleta. `Shift F5` zaczyna od kroku wybranego w formularzu. Dokument bez trasy otwiera formularz trasy zamiast prezentacji.
- **Układ:** szyna chowa się w lewą krawędź, panel się zamyka, kilka arkuszy składa się do jednego, a minimapa znika. Arkusz bierze całą szerokość okna, a tabliczka nad nim zostaje z samym tytułem. Wyjście przywraca szynę, panel, arkusze i minimapę.
- **Dok:** narzędzia i szukanie zjeżdżają, a na ich miejsce wjeżdża pilot: wstecz, „n z m”, dalej, nazwa kroku, kropki do skoku przy trasie do 16 kroków, wskaźnik i Zakończ. Narzędzia uwag i licznik dodanych uwag przyjdą w etapie 5.
- **Krok:** kamera jedzie do kadru. Maska i uwagi kroku zmieniają się w dokumencie między zrzutem startowym a ruchem kamery, przez haczyk `before` w `aimCamera`, więc przenikają razem z przelotem. Gdy kamera stoi, zmiana przenika w miejscu. Szybkie naciśnięcia nie tworzą kolejki: licznik idzie od razu, a kamera jedzie do ostatniego wybranego kroku.
- **Maska:** prostokąt o 10 px strony szerszy od kadru, z cieniem na całą stronę. Przygaszenie ma krycie 0,62, a ukrycie pełne. Maska leży pod kształtami i karteczkami, więc to, co krok pokazuje, widać w całości, także poza kadrem. Kadr odziedziczony przez krok bez ruchu też dostaje maskę. Przy całym dokumencie maski nie ma.
- **Uwagi:** dokument pokazuje tylko uwagi z listy kroku, a pinezki komentarzy spoza listy znikają. Rysunki schowane przełącznikiem wracają na czas prezentacji. `D` odsłania wszystkie otwarte uwagi i kształty dokumentu, a drugie `D` je chowa.
- **Kształty:** kształt, którego nie było w poprzednim kroku, czeka schowany, aż kamera stanie, a potem rośnie wzdłuż swojej linii w tempie pióra: 1,4 px strony na milisekundę, od 0,32 do 0,9 s. Urwany koniec cienieje jak gotowy, więc wygląda jak czubek pióra. Przy ograniczonym ruchu w systemie kształt staje od razu.
- **Klawisze:** `→`, spacja i `PgDn` idą dalej, a `←`, `Shift` ze spacją i `PgUp` wracają. `Home` i `End` skaczą na krańce trasy. `P` włącza wskaźnik, `V` interakcję, a `D` odsłania uwagi. `Esc` najpierw wyłącza wskaźnik, a potem kończy prezentację. Reszta skrótów milczy, żeby przypadkowa litera nie otworzyła panelu przed widzami.
- **Klawisze w dokumencie:** warstwa łapie klawisze kroków na końcu drogi zdarzenia, a nie na jej początku. Pole tekstowe i element, który sam obsłużył klawisz przez `preventDefault`, zostają przy swoim. Poza prezentacją klawisze kroków należą w całości do dokumentu.
- **Pomijanie:** krok, którego kadru nie ma w dokumencie, wypada z prezentacji i z licznika. Krok bez ruchu za nim bierze kadr wcześniejszego kroku. Gdy żaden krok nie ma kadru, `F5` otwiera formularz trasy.
- **Powrót na trasę:** po przewinięciu poza krok następny klawisz ustawia kamerę na kadrze kolejnego kroku. Krok bez ruchu też ustawia kadr od nowa, więc wraca na trasę.
- **Testy:** `tests/presentation.test.ts` sprawdza pomijanie, stan kroku i sprawdzanie stanu z powłoki, a `tests/shapes.test.ts` pióro. `tests/e2e/present.mjs` sprawdza 15 rzeczy: uwagi przed prezentacją, wejście z `F5` i pilota w całości w doku, pierwszy krok bez uwag spoza listy, kamerę z przygaszeniem i kształtem rysowanym po ruchu, krok bez ruchu z ukryciem i karteczką, pominięty krok, `PgUp`, `←`, `Home` i `End`, spację z polem i elementem z własną obsługą klawisza, `D`, kropki, `Esc` z powrotem układu, `Esc` tuż po kroku bez maski i kamery na kadrze, przycisk Prezentuj i Zakończ, `Shift F5` z powrotem panelu oraz brak błędów.

Ograniczenia:

- Zakreślenia leżą w osobnej warstwie pod maską, więc zakreślenie, które krok pokazuje poza kadrem, zostaje przygaszone razem z resztą.
- Zmiana rozmiaru okna w trakcie prezentacji nie przelicza kadru. Poprawi go dopiero następny krok.
- Prezentacja działa w jednym oknie. Nie ma widoku prowadzącego ani obsługi drugiego ekranu.
- Uwag w trakcie jeszcze nie ma. Dok w prezentacji nie ma narzędzi uwag, a `C`, `N` i `M` milczą.

## Do sprawdzenia przy wdrożeniu

- Zoom działa na `design/lab.html`, który nie przewija korzenia. Przejście do miejsca w takim dokumencie nie było sprawdzane.

## Kolejność

1. ~~Kamera: skala strony w spoczynku i zrzuty w ruchu, na prawdziwej warstwie.~~ Zrobione, bez wywołania w interfejsie.
2. ~~Kształty: narzędzie, Tusz, zapis, przełącznik rysunków.~~ Zrobione bez zasłony, która czeka na trasę.
3. ~~Trasa: zapis i formularz.~~ Zrobione, z podglądem kadru kamerą.
4. ~~Odtwarzanie: tryb, dok jako sterowanie, kamera, maska.~~ Zrobione, bez narzędzi uwag w doku.
5. Uwagi w trakcie i lista po wyjściu.
6. Narzędzia MCP i polecenia CLI.
