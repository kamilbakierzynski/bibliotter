# Język projektowy Bibliotter

Spis decyzji z laboratorium. Żywym wzorcem jest [lab.html](lab.html): tam są dokładne wartości, ruch i wszystkie stany. Ten plik mówi, co i dlaczego. Gdy coś się rozjeżdża, rację ma makieta.

Podgląd: konfiguracja `design-lab` w `.claude/launch.json` (port 5199) albo [opublikowany artefakt](https://claude.ai/artifact/4KH4vquYziFC3TU3cDmGFB).

## Idea

Aplikacja to galeria nocą. Dokumenty wiszą na ścianie jak arkusze, a interfejs jest instrumentem, który nie konkuruje z treścią. Interakcja ma być przyjemnością sama w sobie, ale ozdoba, która nie niesie stanu, nie ma tu miejsca.

**Cztery warstwy głębi:** ściana, arkusz, instrumenty, paleta. Każdy element należy do jednej z nich.

**Jedna zasada ruchu:** krawędź prowadząca ciągnie, a reszta podąża. Sprężyny są przerywalne, znaczniki rozciągają się w ruchu, a dok i paleta to jeden obiekt.

## Decyzje

| # | Temat | Wybór | Znaczenie |
|---|---|---|---|
| 1 | Przestrzeń | Galeria nocą | Za dnia białe arkusze na szarej ścianie. W ciemnym motywie dokument delikatnie świeci na ścianę. |
| 2 | Typografia | Instrument | Geist w interfejsie, Geist Mono w metadanych (projekt, branch, PR, czas). Bez szeryfów w interfejsie. |
| 3 | Kolor | Sygnał | Interfejs czarno-biały i jeden pomarańcz, który znaczy „to czeka na Ciebie”. Nigdy do zaznaczeń ani dekoracji. |
| 4 | Ikony | Kreska | W spoczynku równa linia 1,35. Wybrana ikona to pełna bryła z wyciętymi szczegółami. Stan niesie masa i pigułka, nie kolor. |
| 5 | Układ | Szyna | Pasek ikon zawsze po lewej, panel wysuwa się z niego na linie. |
| 6 | Ruch | Lina | Góra krawędzi wyprzedza dół o ok. 80 px, środek przestrzeliwuje o ok. 17 px, całość uspokaja się w ok. 1 s. |
| 7 | Dok | Kontekst | W spoczynku narzędzia, status i szukanie. Podział i uwagi stoją nad arkuszem. Taca rośnie zależnie od sytuacji. |
| 8 | Wyszukiwanie | Żetony | Operatory w palecie zamieniają się w żetony. Panel akcji jak w Raycast pod `Ctrl K`. |
| 9 | Uwagi | Na miejscu i Zawieszone | Przy zamkniętym panelu wątek wyrasta spod pinezki. Otwarcie panelu wiesza wątki na ścianie, a przełącznik przenosi je na listę. |
| 10 | Podział | Para, Zerknięcie i Szereg | Jeden system: liczba arkuszy wybiera układ, a zerknięcie wisi nad każdym z nich. |
| 11 | Skróty | Przytrzymanie i Ściąga | `Ctrl` wyciąga klawisze z kontrolek, a `?` otwiera listę wszystkich skrótów. |
| 12 | Ekran startowy | Ściana i Spis | Dwa widoki tych samych dokumentów: miniatury na ścianie i spis z tym, co czeka. Widać je po uruchomieniu i po zamknięciu ostatniego arkusza. |
| 13 | Wskaźnik | Ręka na kijku | Narzędzie na spotkania: duża rękawiczka wysunięta spod arkusza. Kliknięcie uderza w ekran. Istnieje tylko na dokumentach. |
| 14 | Etykiety | Papier | Własne nazwy, które przecinają projekty. Kolor to papier karteczek, bez pomarańczu Sygnału. Wybierak pod `L` rośnie z doku. |
| 15 | Opcje | Widok na szynie | Zębatka obok folderów i `Ctrl ,`. Ustawienia są w panelu, a instrukcje agenta na osobnej stronie, bo w panelu liczy się krótka lista. |
| 16 | Szukanie | Pasek i panel | Jak w VS Code: `Ctrl F` w plakietce nad arkuszem, `Ctrl Shift F` na szynie. Podświetlenia nie dotykają DOM dokumentu. |
| 15 | Zakreślacz | Marker nad kartką | Drugi przedmiot po wskaźniku: marker w wybranym kolorze zastępuje kursor, a zakreślenia zostają w dokumencie jako tematy na spotkanie. |
| 17 | Orientacja | Minimapa i Spis treści | Jak w VS Code: szkic całego dokumentu przy prawej krawędzi arkusza, który ustępuje dokumentom na całą szerokość, i spis nagłówków w panelu obok uwag. |

Warianty odrzucone zostały w historii artefaktu. Nie wracamy do nich bez nowego powodu.

## Tokeny

### Kolor

| Token | Jasny | Ciemny | Do czego |
|---|---|---|---|
| `--wall` | `#e7e7e9` | `#08080a` | ściana |
| `--surface` | `#ffffff` | `#151517` | szyna, panel |
| `--raised` | `#ffffff` | `#1c1c1f` | dok, popovery |
| `--ink` | `#131316` | `#f4f4f5` | tekst główny |
| `--ink-2` | `#63636b` | `#a4a4ac` | tekst drugorzędny |
| `--ink-3` | `#93939b` | `#6e6e76` | metadane, ikony w spoczynku |
| `--tool-on` | `#131316` | `#f4f4f5` | wybrane narzędzie, klawisze przy `Ctrl` |
| `--signal` | `#f0480a` | `#ff6b30` | „czeka na Ciebie” |

Sygnał ma dwa zastosowania: status „Do decyzji” i uwaga, na którą odpisał agent. Dokument nie zmienia koloru interfejsu, wraca tylko jako nocna poświata na ścianie. Karteczki i etykiety mają kolor papieru, bo to znaki użytkownika, a nie interfejs.

### Typografia

- Interfejs: Geist 13 px, tytuły 500 lub 550, światło liter `-.01em`.
- Metadane: Geist Mono 11 px.
- Pole palety: 15,5 px.
- Fonty są na licencji OFL, mają polskie znaki i trafiają do paczki aplikacji.

### Geometria

- Szyna 60 px, panel 264 px, uwagi 300 px.
- Dok 52 px wysokości, narzędzia 36 px, małe przyciski 28 px.
- Arkusz kończy się 10 px nad dołem okna, a dok 26 px, czyli 16 px nad dolną krawędzią arkusza.
- Najmniejsze okno to 900 × 600 px.
- Paleta 760 × 558 px, mniejsza tylko wtedy, gdy nie mieści się w oknie.
- Promienie są koncentryczne: powłoka 22, dok 18, arkusz 16, wiersz 10.

### Ikony

Siatka 20 × 20, linia 1,35, zaokrąglone końce. Każda ikona to trzy warstwy: bryła, szczegóły na bryle i linie. Bryłę widać tylko na wybranej ikonie.

## Ruch

Wszystko, co można przerwać, jest sprężyną z parametrami `k` (sztywność) i `z` (tłumienie).

| Ruch | k | z |
|---|---|---|
| Krawędź panelu (lina) | 235 | .64 |
| Krawędź uwag | 210 | .70 |
| Lewy i prawy brzeg sceny | 135 i 170 | .80 i .84 |
| Dok w poziomie | 118 | .80 |
| Taca w doku | 300 | .70 |
| Paleta, otwieranie (szerokość i wysokość) | 250 i 190 | .80 i .74 |
| Paleta, zamykanie | 300 i 280 | .88 i .90 |
| Arkusz wjeżdża | 170 | .74 |
| Arkusz wychodzi | 240 | .90 |
| Kamera szeregu | 135 | .80 |
| Arkusz rośnie z miniatury lub wiersza | 150 | .84 |
| Wejście ze Ściany do arkusza | 420 | .92 |
| Arkusz wraca na ekran startowy | 300 | .92 |
| Ściana i Spis | 165 | .86 |
| Dok kurczy się na ekranie startowym | 240 | .84 |
| Wskaźnik: uderzenie | 1500 | 1 |
| Wskaźnik: odbicie od kartki | 260 | .50 |
| Wskaźnik: spłaszczenie po uderzeniu | 420 | .42 |
| Wskaźnik: dolny koniec kijka | 95 | .46 |
| Wskaźnik: wejście i wyjście | 240 i 300 | .80 i .90 |
| Zakreślacz: dotknięcie kartki | 620 | .82 |
| Zakreślacz: uniesienie | 280 | .52 |
| Zakreślacz: chwianie za ruchem | 150 | .58 |
| Uwaga: uniesienie | 260 | .62 |
| Karteczka: odklejenie rogu (start z prędkością 16) | 300 | .42 |
| Karteczka: opadnięcie i dociśnięcie rogu | 380 i 140 | .52 i .72 |
| Pinezka: wbicie | 560 | .42 |
| Uwaga: kołysanie za ręką | 150 | .58 |
| Uwaga niesiona za kursorem i powrót na miejsce | 420 i 170 | .84 i .78 |

Lina ma jeszcze sprzężenie 1300 i spadek sztywności .64. Przejścia CSS używają krzywych policzonych ze sprężyn: `springCurve(120, .92)` i `springCurve(170, .62)`.

**Przejścia układu arkuszy są addytywne.** Funkcja układu zawsze mówi, gdzie arkusz ma stać, a sprężyna gasi tylko różnicę. Dzięki temu układ idzie wiernie za szerokością sceny, a przerwane przejście nie traci prędkości.

Przy `prefers-reduced-motion` sprężyny przeskakują do celu.

## Komponenty

### Szyna i panel

Sygnały zostają na szynie także po zwinięciu panelu. Krawędź panelu można chwycić: reaguje na kursor, ciągnie się za ręką i odskakuje.

Biblioteka ma się czytać tak samo przy 50 i przy 5000 dokumentów:

- Domyślnie wyżej stoi to, co ostatnio zmienione. Przycisk obok filtra formatu przełącza na nazwy, z naturalnym porządkiem numerów.
- **Ręczna kolejność.** Wiersz biblioteki chwyta się i przeciąga wśród rodzeństwa, a reszta rozstępuje się na swoich sprężynach. Przenosić między folderami nie można, bo apka niczego nie zmienia na dysku. Branche, foldery i dokumenty zostają w swoich grupach, archiwum zawsze stoi na końcu, a rozwinięty folder jedzie zwinięty. Pierwsze ułożenie przełącza na trzeci tryb, Ręcznie, a sortowanie, z którego przyszło, rządzi tym, czego nikt nie ruszał, więc poza przeciąganym folderem nic nie zmienia miejsca. Nowe dokumenty stają przed ułożonymi. Esc anuluje. Kolejność żyje w pamięci okna, jak zwinięcia.
- **Podgląd wiersza.** Zamiast systemowej podpowiedzi ze ścieżką karta wisi tuż za panelem, na wysokości wiersza: miniatura, tytuł, plik, status i etykiety dokumentu, a przy folderze ścieżka i liczba dokumentów. Pierwsza pojawia się po ok. pół sekundy, kolejne od razu i jadą za kursorem z wiersza na wiersz. Kliknięcie, przewinięcie i menu ją chowają.
- **Skrzynka** ma „Oznacz wszystkie jako przeczytane”. Zdejmuje tylko dokumenty do przeczytania, bo przeczytanie nie podejmuje decyzji. Cofnij przywraca dokładnie te, które zmieniło, dopóki widok jest otwarty.
- Archiwum to jeden zwinięty wiersz na końcu projektu. Projekt z samym archiwum jest zwinięty i stoi za bieżącymi.
- Folder powyżej 12 dokumentów startuje zwinięty i pokazuje licznik oraz najmocniejszy sygnał ze środka, więc nic nie ginie po zwinięciu.
- Dokument otwarty z palety rozwija przodków i przewija do swojego wiersza.

**Menu wiersza.** Prawy klik otwiera menu pod kursorem, także w skrzynce i w niepewnych. Strzałki i Enter działają jak w panelu akcji, a Esc, klik obok albo przewinięcie panelu je zamyka.

| Wiersz | Akcje |
|---|---|
| Dokument | Otwórz, Zerknij, Zmień nazwę, Pokaż w Eksploratorze, Kopiuj ścieżkę |
| Folder | Zmień nazwę, Pokaż w Eksploratorze, Kopiuj ścieżkę, Ukryj folder |
| Projekt | To samo co folder. Ukryć można tylko projekt, który nie jest całym wybranym folderem |
| Gałąź | Kopiuj nazwę gałęzi, Otwórz pull request |

- **Nazwa żyje tylko w apce.** Plik i folder na dysku zostają nietknięte, bo apka obiecuje, że niczego nie zmienia. Dokument trzyma nazwę w swoich danych, a folder i projekt w konfiguracji. Pole staje w wierszu w miejscu nazwy. Przywróć nazwę i puste pole wracają do oryginału. Agent dalej widzi prawdziwy tytuł.
- **Ukrycie to pominięcie przy skanie.** Dokumenty znikają z biblioteki, skrzynki, ściany i wyszukiwarki, a agent nie dostaje ich przez CLI i MCP, także po identyfikatorze czy ścieżce. Nic nie jest usuwane, więc po przywróceniu wracają ze statusem i uwagami. To porządek w bibliotece, a nie ochrona plików: agent z dostępem do dysku dalej może je przeczytać wprost. Lista ukrytych folderów jest w widoku Foldery. Wiersz znika od razu, a skan dopełnia resztę, bo przy dużej bibliotece trwa chwilę.
- **Wybranego folderu nie da się ukryć.** Zwykle obejmuje wiele repozytoriów, więc jeden klik opróżniłby bibliotekę. Do tego służy usunięcie go z listy folderów.

### Dok

Pływa nad arkuszami, wyśrodkowany względem sceny. Szeroka taca dosuwa go do krawędzi okna, ale nigdy za nią nie wychodzi. Taca pokazuje kolor karteczki, odbiorcę komentarza albo akcje zaznaczonego tekstu. Przy co najmniej trzech arkuszach dochodzi mapka szeregu. Dok i paleta to jeden element, który rośnie, a nie dwa okna.

Dok nie może zasłaniać treści, więc każdy dokument dostaje u dołu 84 px zapasu i po przewinięciu do końca ostatnia linia stoi nad dokiem. Dymek i wątek przy dole arkusza odchylają się ponad dok, a panel uwag w wąskim oknie kończy się nad nim. Kółko nad dokiem przewija dokument pod spodem, a po kliknięciu w dok klawiatura wraca do dokumentu.

### Paleta

- Operatory: `status:`, `projekt:`, `gałąź:`, `format:`, `etykieta:` (także `label:`), `rodzaj:`. Wystarczy początek słowa.
- Wartość wybrana z listy staje się żetonem, a Backspace w pustym polu usuwa ostatni.
- Tab uzupełnia nazwę filtra, Enter lub Tab dodaje wartość.
- `Ctrl K` otwiera panel akcji wyniku. Skróty akcji działają też bez niego.
- Esc zamyka najpierw panel akcji, potem paletę. Potwierdzenia pojawiają się w stopce.
- Nazwa pliku i folderu liczy się jak fragment tytułu. Wynik znaleziony po pliku pokazuje pod tytułem plik, folder i projekt z zaznaczonym fragmentem, a podgląd ma wiersz Plik. Wcześniej indeks treści znajdował taki dokument po ścieżce, ale pokazywał przypadkowy fragment tekstu.

### Arkusze

| Stan | Układ |
|---|---|
| 1 arkusz | Cała scena. |
| 2 arkusze | Para z uchwytem. Proporcja 56:44, zakres 28 do 72%, odstęp 10 px. |
| 3 i więcej | Szereg. Szerokość 64% sceny, co najmniej 480 px, odstęp 18 px. Kamera centruje bieżący arkusz. |
| Zerknięcie | 58% sceny przy prawej krawędzi, nad układem. Nic pod nim się nie przelewa. |

Droga jest jedna. `Ctrl` + klik lub `Ctrl Enter` to zerknięcie. Esc albo klik w arkusz pod spodem je chowa. „Przypnij obok” lub `Ctrl \` wstawia arkusz zaraz za tym, z którego zerknięto, więc para sama staje się szeregiem.

`Ctrl \` przy kilku arkuszach składa je do bieżącego, a kolejne naciśnięcie rozkłada układ z powrotem. Dokument jest otwarty najwyżej raz: ponowne otwarcie przenosi na jego arkusz. `X` na ostatnim arkuszu wraca na ekran startowy.

### Ekran startowy

Widać go po uruchomieniu i po zamknięciu ostatniego arkusza. `H` przechodzi na niego i wraca do całego układu arkuszy. Dok kurczy się wtedy do samego szukania, a poświata przygasa do 62%, bo pada wprost na ścianę.

**Ściana:** miniatury w trzech kolumnach, razem do 1040 px. Najpierw to, co czeka, potem to, co do przeczytania, potem reszta. Kliknięty arkusz rośnie z miniatury i tam wraca, a `Ctrl` + klik zerka na dokument bez opuszczania ściany. Nocą poświata płynie do arkusza pod kursorem i przyjmuje jego kolory.

**Spis:** jeden arkusz 640 px z datą, zdaniem „1 dokument czeka na Ciebie.” i sekcjami. Wiersz mówi, dlaczego dokument tam jest, np. „Do decyzji, agent odpisał na uwagę”. Arkusz wyrasta z wiersza, a po `H` zaznaczenie zostaje na tym samym dokumencie, więc przez kolejkę można przejść samą klawiaturą.

**Przełączanie:** `Shift H` albo przełącznik w nagłówku. To ten sam zbiór w tej samej kolejności, więc arkusze składają się po kolei do swoich wierszy i rozkładają z powrotem, a ruch można przerwać. Aplikacja pamięta ostatni widok.

**Pierwsze uruchomienie:** panel jest zwinięty, nie ma sygnałów ani poświaty, a na ścianie wisi jedna kartka „Wskaż foldery z dokumentami.” z przyciskiem `Dodaj foldery`. Foldery można też przeciągnąć na ścianę. Po ich wskazaniu kartka schodzi ze ściany, znalezione dokumenty wieszają się jeden po drugim, licznik rośnie w nagłówku, a na końcu wysuwa się panel i zapalają się poświata oraz sygnały.

**Puste foldery:** ta sama kartka ze ścieżką folderu i zdaniem „Nie ma tu jeszcze dokumentów.”. Gdy agent coś zapisze, dokument sam zawiśnie na ścianie.

### Uwagi

- Panel zamknięty: pinezki i podkreślenia na arkuszu, wątek wyrasta spod pinezki.
- Panel otwarty: wątki wiszą na ścianie na wysokości cytatu i doganiają go na sprężynie.
- Przełącznik w nagłówku lub `Shift I` przenosi je na listę.
- Szereg zajmuje całą ścianę, więc uwagi stają wtedy na panelu. To samo dotyczy okna węższego niż 1180 px, gdzie panel stoi nad arkuszem i kończy się nad dokiem.
- Komentarz i karteczkę można przenieść. Przeciągnięcie znacznika o więcej niż 4 px przenosi go, a krótsze to zwykłe kliknięcie, które otwiera wątek. Przycisk Przenieś w wątku odkleja uwagę, która idzie za kursorem do kliknięcia, także wtedy, gdy jej miejsca nie ma w tej wersji dokumentu. Kursor wskazuje róg karteczki i czubek pinezki, jak przy stawianiu nowej. Obrys pokazuje element, na który uwaga spadnie, a przy górnej i dolnej krawędzi strona przewija się sama. `Esc` odkłada uwagę tam, gdzie była, a `Ctrl Z` cofa przeniesienie.
- Ruch karteczki naśladuje prawdziwą. Klej jest u góry, więc pierwszy odchodzi dolny róg: zawija się, pokazując odwrotną stronę papieru, a kartka unosi się z większym cieniem i kołysze za ręką wokół punktu chwytu. Przy przyklejaniu najpierw siada góra, a róg dociska się chwilę później. Pinezka unosi się z przechyleniem i wbija z małym odbiciem. Nowa uwaga pojawia się w ten sam sposób, już uniesiona.
- Przeniesiona uwaga dostaje nową kotwicę, a rozmowa i wersja dokumentu zostają. Komentarz do zaznaczonego tekstu przesunięty w obrębie swojego akapitu zachowuje cytat, bo dalej mówi o tym samym. Zakreślenia i kształty się nie przenoszą, bo ich geometria leży na tekście.

### Linki

Link w arkuszu Markdownu mówi, dokąd prowadzi: strzałka po tekście to sieć, a kartka to plik obok. Kotwice w tym samym dokumencie nie mają znacznika.

- Klik w link do dokumentu z biblioteki otwiera go na miejscu arkusza, razem z kotwicą, a `Ctrl` + klik zerka, tak jak w każdej liście. Inny plik pokazuje Eksplorator, także dokument spoza biblioteki. Link donikąd zostaje na miejscu i mówi o tym przy samym linku.
- Linki Obsidiana działają jak zwykłe: `[[nazwa]]`, `[[nazwa|tekst]]`, `[[nazwa#nagłówek]]`. Nazwa szuka pliku w sejfie `.obsidian`, a bez niego w projekcie, i przy powtórce wybiera plik najbliżej dokumentu. Osadzenie `![[plik]]` jest linkiem, bo dokument nie czyta plików spoza swojego katalogu.
- Po najechaniu na link do innego dokumentu wyrasta spod niego karta: miniatura, tytuł, pierwszy akapit, projekt, ścieżka i data. Karta jest w dokumencie, bo żaden element powłoki nie może leżeć nad widokiem.
- Dokument HTML ma te same kliknięcia, ale bez kart, bo jego skrypty mogłyby je odczytać. Apka przejmuje kliknięcie dopiero po nasłuchach dokumentu, więc własny router, kotwice i linki do nazwanej ramki działają jak w przeglądarce. Plik obok dokumentu pokazuje Eksplorator, a skrypt niczego nie otworzy, bo liczy się tylko prawdziwe kliknięcie.
- `O` pokazuje w panelu uwag linki z dokumentu i do niego. Panel ma jedno miejsce, więc `I` i `O` przełączają widok, a drugie naciśnięcie go zamyka. Linki stoją zawsze w panelu, nigdy na ścianie, bo nie mają cytatu, przy którym mogłyby wisieć.

### Szukanie

Dwa poziomy, jak w VS Code. To samo słowo znaczy w obu to samo: bez przełączników wielkość liter i polskie znaki nie mają znaczenia, więc `laka` znajdzie „Łąkę”.

**W dokumencie (`Ctrl F`).** Pasek stoi w plakietce nad arkuszem, obok podziału i uwag, bo steruje widokiem, a w plakietce niczego nie zasłania. Na czas szukania metadane i przyciski widoku ustępują mu miejsca. Pasek należy do bieżącego arkusza i idzie za nim razem z zapytaniem. `Enter` i `F3` skaczą dalej, `Shift` wraca, a `Esc` zamyka pasek i oddaje klawiaturę dokumentowi. Zaznaczony tekst staje się zapytaniem. Kolejne `Ctrl F` w dokumencie zaczyna od pierwszego trafienia od góry ekranu, więc pisanie nie zabiera czytanego miejsca.

**We wszystkich dokumentach (`Ctrl Shift F`).** Widok na szynie. Wyniki idą dokumentami, od tych, które nie są w archiwum, a każdy wiersz to trafienie. Strzałki wybierają wiersz, `Enter` i `F4` otwierają go i idą dalej, także do następnego dokumentu, a `Ctrl` + klik lub `Ctrl Enter` zerka. Wybrane trafienie otwiera dokument z tym samym zapytaniem w pasku, więc dalej przeskakuje się już po nim. Panel pokazuje do 30 trafień z dokumentu, resztę zna pasek.

**Przełączniki** są te same w obu miejscach: `Aa` wielkość liter, `ab` całe słowa, `.*` wyrażenie regularne (`Alt C`, `Alt W`, `Alt R`). Wyrażenie liczy osobny wątek, który po 4 s ginie, bo wyrażenia nie da się przerwać, a w dokumencie zawiesiłoby jego stronę. Włączony przełącznik jest pełny, jak wybrane narzędzie.

**Podświetlenia** to CSS Custom Highlight API, więc DOM dokumentu zostaje nietknięty, a jego skrypty niczego nie widzą. Trafienia są jasnożółte, a bieżące bursztynowe. Bursztyn, a nie pomarańcz, bo pomarańcz znaczy tylko „czeka na Ciebie”. Tekst pod spodem ma stały ciemny kolor, więc to działa też na ciemnych dokumentach.

- Liczy się to, co widać. Ukryte elementy nie są trafieniami, a treść zwiniętego `<details>` tak, i rozwija się przy skoku. Dlatego panel, który zna cały tekst pliku, może znaleźć coś, czego dokument akurat nie pokazuje.
- Dokument przebudowany przez własny skrypt przelicza trafienia sam.
- Paleta zostaje szybkim skokiem do dokumentu i szuka początków słów. Panel widzi każdy fragment tekstu.

### Minimapa i spis treści

Dwie drogi, żeby w długim dokumencie wiedzieć, gdzie się jest, i szybko przejść gdzie indziej. Wzorem jest VS Code, o co poprosił użytkownik: minimapa przy prawej krawędzi edytora i widok Outline. Oba elementy muszą dać się schować, bo dokument HTML potrafi zająć cały arkusz.

**Minimapa** (`Shift G`) to pas szerokości 64 px przy prawej krawędzi arkusza, tuż przy pasku przewijania. Rysuje szkic układu, a nie zrzut: linia tekstu to pasek, nagłówek jest ciemniejszy i grubszy, blok kodu i obraz to jasne prostokąty, a trafienia szukania mają barwy podświetleń z dokumentu. Dzięki temu na każdym dokumencie wygląda tak samo, jest czarno-biała jak reszta interfejsu i jaśnieje na ciemnym tle. Nie wysyła też nigdzie obrazu strony.

- Szkic ma 1/8 wysokości dokumentu, a dłuższy dokument ściska się do wysokości arkusza, więc każde miejsce jest o jedno kliknięcie. W poziomie mapa pokazuje tylko pas treści, żeby wąska kolumna nie zginęła w marginesach. Pas kończy się razem ze szkicem.
- Suwak to widoczne okno. Ciągnięcie przewija dokument, a klik obok stawia tam środek okna. Dokument dojeżdża na sprężynie bez przestrzelenia, bo strona, która minie cel i wraca, czyta się jak zacięcie. Najazd pokazuje nazwę rozdziału pod kursorem, także w trakcie ciągnięcia.
- **Treść i dekoracja.** Pod pasem liczy się tylko to, co się czyta albo klika: tekst, obraz, wąska plakietka albo przycisk przy krawędzi. Tła pasów na całą szerokość, ramki sekcji, linie i tła bloków kodu, które biegną daleko w lewo, to dekoracja. Nad nią minimapa zostaje, tylko kładzie pod szkic papier strony z włosem krawędzi, żeby szkic był czytelny na każdym pasie. Bez tego rozróżnienia minimapa znikała z prawie każdego dokumentu projektowego generowanego przez agentów: w pomiarze 23 dokumentów HTML z biblioteki stała tylko na pięciu, choć tekst sięgał pod pas na dwóch.
- **Przyklejony pasek.** Pod paskiem nawigacji przyklejonym do górnej krawędzi pas zaczyna się niżej, a nad przyklejonym przyciskiem przy dolnej kończy się wcześniej. Pasek nie trafia też do szkicu, bo nie przewija się z dokumentem. Przyklejony nagłówek rozdziału albo tabeli nie jest paskiem.
- **Ustępowanie.** Gdy w oknie pod pasem jest treść, minimapa chowa się sama, a przy krawędzi zostaje uchwyt: pionowa pigułka w połowie pasa, która rośnie, gdy kursor idzie w stronę krawędzi. Minimapa wysuwa się jak szuflada spod samej krawędzi, z tłem strony i cieniem, a po odejściu myszy wraca na miejsce. Liczy się treść, która jest teraz w oknie, a nie gdziekolwiek w dokumencie, bo jedna stopka na końcu nie może zabrać mapy z piętnastu ekranów tekstu. Treść bliżej niż 48 px to jedno miejsce, żeby mapa nie migała między linijkami. Strona przewijana w bok ma treść pod pasem zawsze. Nie liczy się to, czego nie widać: linia kodu ucięta przez przewijany blok, niewidoczny dymek przypisu.
- Dokument, który mieści się w oknie, nie ma minimapy. Nie ma jej też w powiększeniu kamery.
- Przy komentarzu, karteczce, zakreślaczu i wskaźniku przygasa i przepuszcza kliknięcia, a ręka i marker przechodzą nad nią.
- Wybór obowiązuje we wszystkich arkuszach i apka go pamięta. Miniatury na Ścianie minimapy nie mają.

**Spis treści** (`G`) to trzeci widok panelu obok Uwag i Linków, z przyciskiem w plakietce. Pokazuje widoczne nagłówki z wcięciem według poziomu, a pigułka bieżącego rozdziału jedzie za czytaniem, zamiast przeskakiwać. Rozdział zaczyna się, gdy jego nagłówek minie linię czytania na 30% wysokości okna, a na samym dole bieżący jest ostatni widoczny.

- Klik stawia nagłówek tuż pod górną krawędzią, na tej samej sprężynie co minimapa, i oddaje klawiaturę dokumentowi. Do pierwszego ruchu użytkownika bieżący zostaje wybrany rozdział, nawet gdy kolejny nagłówek stoi tuż pod nim.
- Nagłówek to `h1` do `h6` albo `role="heading"`. Numer rozdziału w osobnym elemencie dostaje spację, a znak kotwicy (`#`, `¶`, `§`) odpada.
- W wąskim oknie panel stoi nad arkuszem, więc po wyborze ustępuje jak szybkie menu.
- Stopka panelu ma przełącznik minimapy, bo oba elementy służą temu samemu.

### Wzory

Arkusz Markdownu składa wzory zapisane jako `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, `` $`…`$ `` albo w bloku `math`. Cena w rodzaju `$5` zostaje tekstem.

- Wzór ma krój KaTeX. To jedyny szeryf w arkuszu, bo matematyka w Geist traci czytelność.
- Błędny wzór zostaje na miejscu jako przygaszony kod, a po najechaniu mówi, co w nim nie gra.
- Długi wzór przewija się w sobie i nie rozpycha arkusza.

### Etykiety

Etykieta to dowolna nazwa, np. „PR review”, „Plan” albo kod Jira. Nie ma osobnego spisu do utrzymania: etykieta powstaje przy pierwszym użyciu i znika razem z ostatnim dokumentem, a wielkość liter nie tworzy jej odmian.

- `L` lub przycisk w doku otwiera wybierak nad dokiem. Pole szuka i tworzy, `Enter` nadaje lub zdejmuje, a wybierak zostaje otwarty, bo dokument zwykle dostaje kilka etykiet.
- `Ctrl K` przy wyniku palety robi to samo dla dokumentu, który nie jest otwarty.
- Widok Etykiety na szynie to spis z licznikami. Etykieta otwiera płaską listę dokumentów od najnowszych, także tych z archiwum, bo etykieta przecina projekty, a większość biblioteki leży w zwiniętym archiwum. Tam jest też zmiana nazwy i usuwanie. Nazwa już używana łączy obie etykiety.
- Pokazujemy je tam, gdzie mówią, czym jest dokument: nad arkuszem wszystkie, na ścianie i w spisie kilka, w drzewie jedna z licznikiem reszty.
- Kolor to tożsamość etykiety: wszędzie ten sam, więc znak rozpoznaje się bez czytania. To papier z szuflady karteczek, rozszerzony do siedmiu odcieni. Nocą papier gaśnie do tła, a kolor przechodzi na tekst. W palecie nie ma pomarańczu, bo należy do Sygnału.
- Kolor pada sam z nazwy, a kody zgłoszeń jednego projektu dzielą jeden. Widok etykiety pozwala wybrać inny albo zwykły znacznik bez koloru.
- Ściana bez etykiet wygląda jak dawniej.

### Etykiety od Haiku

Zakładka AI w Opcjach. Domyślnie nic nie wychodzi z komputera, bo do modelu trafia początek dokumentu.

- „Etykietuj nowe pliki” przechodzi przez Claude Code użytkownika, bez klucza API. Apka uruchamia go jako podproces bez narzędzi, wtyczek i historii sesji. To nie agent, który napisał dokument: ma pełny spis etykiet, więc wynik jest spójny w całej bibliotece.
- Nowy plik to taki, który powstał po poprzednim skanie. Pierwsze uruchomienie, zastane pliki, dodany folder, kopia ze starą datą i przeniesienie się nie liczą, więc biblioteka nie jest katalogowana hurtem.
- Model tylko wybiera: z listy w zakładce i z etykiet już używanych. Własnych nazw nie tworzy, a usunięta etykieta nie wraca. Wyjątkiem są kody zgłoszeń, które muszą występować w dokumencie.
- Na żądanie działa `Auto` w wybieraku i „Etykietuj nieoznaczone” w zakładce: widoczne dokumenty bez etykiet, z pominięciem archiwum. Błąd Claude Code pokazują wybierak, zakładka i panel Etykiety.

### Kody Jira

Kod taki jak `PAY-1482` to też etykieta, ale kodów będą setki, a rodzajów kilka. Dlatego apka rozpoznaje je sama i nie miesza z resztą.

- W panelu Etykiety kody chowają się pod jednym wierszem `Jira`. Pod nim czeka spis od najświeższego dokumentu, z tytułem dokumentu w drugiej linii, bo sam kod niewiele mówi.
- Wyszukiwanie łapie kod i temat dokumentu, a powrót z kodu zostawia wyniki. Lista kończy się na 200 wierszach, bo dalej i tak nikt nie przewija.
- Wybierak `L` pokazuje kody tego dokumentu, a cudze dopiero po wpisaniu.
- Link ustawia się raz: Opcje, Jira. Pole przyjmuje adres Jiry, adres dowolnego zgłoszenia albo szablon z `{code}`, a pod spodem widać, dokąd poprowadzi. Bez adresu kod jest zwykłą etykietą, a jego widok prowadzi do tego ustawienia.
- Kod na tabliczce dokumentu otwiera zgłoszenie w przeglądarce. Zwykła etykieta nadal otwiera swój widok. Na ścianie i w wierszach znacznik nie jest linkiem, bo kliknięcie otwiera tam dokument, więc zgłoszenie jest w menu pod prawym przyciskiem i w palecie.

### Wskaźnik

Narzędzie do pokazywania dokumentu na spotkaniu, pod `P` i w doku. Rękawiczka z wystawionym palcem i kciukiem stoi na kijku, który wychodzi spod arkusza. To czysta, płaska linia bez cieniowania, narysowana według wzoru od użytkownika. Jest biało-czarna, bo to przedmiot, a nie Sygnał, i na ciemnym dokumencie trzyma ją jasna obwódka.

- Czubek palca stoi dokładnie pod kursorem. Kijek pochyla się zależnie od miejsca na arkuszu i kołysze się za ręką, bo jego dolny koniec podąża na sprężynie.
- Wysokość nad kartką niesie jedna sprężyna. Na górze cień jest daleki i miękki, a przy uderzeniu wsuwa się pod palec, ostrzeje i ciemnieje.
- Kliknięcie to uderzenie: ręka opada i maleje, a przy dotknięciu kartki spłaszcza się, wokół palca rozchodzą się dwa kręgi, cień wgniecenia i kreski jak w komiksie, a kijek drży. Przytrzymany przycisk zostawia palec na kartce, a puszczenie odbija go w górę.
- Przytrzymany przycisk rysuje za palcem błyszczącą linię, np. do podświetlenia fragmentu. Linia to wstęga w bursztynie podkreśleń cytatów: cienieje przy szybkim ruchu i zwęża się na końcach jak pociągnięcie pisakiem. Wygładzanie ma dwa etapy. Filtr 1€ idzie za palcem: przy wolnym ruchu ściera drżenie ręki i schodki pikseli, a przy szybkim prawie nie opóźnia, a ostatni odcinek do palca rysuje się wprost, więc linia nie zostaje za ręką. Drugi etap układa punkty już narysowane w obie strony, jądrem, które tnie fale, a nie zgniata łuków. Ostre zakręty dzielą linię przed ułożeniem, więc zygzak zostaje zygzakiem. Połysk buduje ciemniejszy brzeg, jasny środek przesunięty ku światłu, miękka poświata i mały cień na kartce. Przy palcu linia jest rozgrzana, a po skończeniu przebiega po niej jeden błysk. Prawy przycisk kasuje wszystkie linie arkusza. Linie jadą z dokumentem przy przewijaniu, zostają na zrzutach, chowają się po wyjściu z narzędzia i wracają pod `P`. Do przeładowania dokumentu żyją tylko w pamięci, nie są uwagami.
- Ręka wchodzi od dolnej krawędzi, gdy mysz wjeżdża na dokument, i tam wraca, gdy z niego schodzi. Nad dokiem i resztą interfejsu jest zwykły kursor.
- Kliknięcia nie trafiają do dokumentu, więc link nie otworzy się w połowie prezentacji. Działają kółko, klawisze i podpowiedzi po najechaniu. Interakcja wraca pod `V` albo `Esc`.
- Wskaźnik obejmuje wszystkie żywe arkusze i zostaje włączony przy przejściu do kolejnego dokumentu. Wyłącza go dopiero ekran startowy.

### Zakreślacz

Narzędzie do zaznaczania tego, co trzeba poruszyć później, np. na spotkaniu, pod `M` i w doku. W przeciwieństwie do linii wskaźnika zakreślenie jest uwagą: zostaje w dokumencie, przeżywa przeładowanie, wisi przy cytacie i leży na liście „Dla mnie”.

- Kursor zamienia się w płaski marker z czarną szyjką i ściętą końcówką, a kolor korpusu to wybrany kolor tuszu. To przedmiot, jak rękawiczka, więc kolor nie jest tu Sygnałem. Pomarańczu nie ma w palecie.
- Marker unosi się nad kartką jak rysik na iPadzie. W powietrzu cień leży z boku, a przy dotknięciu zbiega do końcówki i rozchodzi się od punktu styku pod innym kątem niż korpus. Korpus chwieje się za ruchem.
- Kolory w tacy to małe markery wystające spod doku, a wybrany stoi wyżej.
- Tusz mnoży się z papierem, więc tekst pod nim zostaje czarny. Ścięta końcówka daje szeroką linię w poziomie i węższą w pionie. Świeży tusz jest mocniejszy, wsiąka po uniesieniu, a po linii przebiega jeden miękki błysk. Na ciemnym tle nie ma czego mnożyć, więc tusz świeci, a ton wynika z tła pod zakreśleniem, nie z motywu apki.
- Linię prowadzi ten sam ślad co przy wskaźniku: filtr 1€ w trakcie rysowania i ułożenie w obie strony na końcu, z zachowaniem ostrych zakrętów.
- Linie położone jedna po drugiej w tym samym kolorze, w odstępie do 0,9 s i blisko siebie, to jedno zakreślenie. Dzięki temu akapit nie rozsypuje się na kilka uwag.
- Odręczna linia pasuje do dokumentu tylko w szerokości, w której powstała. W innej tekst przelewa się inaczej, więc zakreślenie kładzie się po wierszach swojego tekstu. Linia poza tekstem, np. na wykresie, skaluje się z elementem.
- Linia nie łapie myszy, bo leży na tekście, więc wątek otwiera mały znacznik nad jej końcem. Tam dopisuje się notatkę, zamyka temat albo pokazuje go agentowi. Domyślnie zakreślenie jest „Dla mnie”.
- Prawy przycisk usuwa trafione zakreślenie od razu. Zakreślenie z notatką usuwa się tylko w jego wątku, żeby nie stracić tekstu.
- Na dysku linie to ułamki rozmiaru elementu kotwicy, po jednym wierszu JSON na linię, więc historia w prywatnym gicie zostaje czytelna.
- Zakreślacz obejmuje wszystkie żywe arkusze i zostaje włączony przy przejściu do kolejnego dokumentu. Wyłącza go `V`, `Esc` i ekran startowy.

### Kształty

Strzałki, prostokąty, elipsy i linie pod `A` i w doku. Należą do dokumentu jak karteczki, a w trybie prezentacji krok będzie mówił, które z nich pokazać.

- Przeciągnięcie od razu daje równy kształt, bo układa go apka. Shift robi kwadrat i koło, a linię i strzałkę przyciąga do kroku 15 stopni. Krótsze przeciągnięcie to kliknięcie, które niczego nie rysuje ani nie trafia do dokumentu. `Esc` porzuca szkic.
- Styl to Tusz: linia wchodzi cienko, lekko oddycha grubością i cienieje na końcu, jak ślad wskaźnika. Prostokąt i elipsa to jedno pociągnięcie, które zachodzi kawałek na swój początek. Strzałka ma lekki łuk i grot z dwóch krótkich pociągnięć.
- Kolory mają nazwy karteczek, ale ciemniejszy tusz, żeby linia była czytelna na papierze. Na ciemnym tle tusz jaśnieje. Pomarańczu nie ma.
- Taca pokazuje rodzaje kształtu i kolory. Apka pamięta ostatni rodzaj.
- Prostokąt i elipsa trzymają się elementu pod swoim środkiem, w ułamkach jego rozmiaru, więc mogą z niego wychodzić. Linia i strzałka mają kotwicę na każdym końcu, więc idą za elementami, gdy strona się przelewa.
- Kształt nie jest notatką. Nie ma wątku, nie trafia na listę uwag ani do licznika, a agent dostaje go tylko razem z uwagami „Dla mnie”. Usuwa go prawy przycisk przy linii albo `Ctrl Z`.
- Przełącznik nad arkuszem i `D` chowają rysunki jednego dokumentu, a apka pamięta to po restarcie. Przycisk widać tylko w dokumencie z rysunkami. Włączenie narzędzia odsłania rysunki, żeby nowy kształt nie powstał niewidoczny.

### Trasa prezentacji

Czwarty widok panelu, pod `Shift P`. Układa się w nim trasę dokumentu na spotkanie: płaską listę kroków, po jednym kliknięciu na krok. Odtwarza ją prezentacja, opisana niżej, a pełne ustalenia są w `design/PRESENTATION.md`.

- Lista kroków stoi na górze, a pod nią wybrany krok: nazwa, Kadr (Bez ruchu, Miejsce, Obszar), Reszta dokumentu (Normalnie, Przygaszona, Ukryta) i lista uwag oraz kształtów do pokazania. Pusty tytuł to „Krok N”.
- Kadr wskazuje się w dokumencie. Miejsce bierze blok pod kliknięciem, a nie słowo, i ramka pokazuje go, zanim się kliknie. Obszar rysuje się przeciągnięciem. Na czas wskazywania kursor staje się celownikiem, a kliknięcie nie trafia do dokumentu. `Esc` przerywa.
- Przy otwartym formularzu dokument pokazuje przerywaną ramką kadr wybranego kroku, z nazwą kroku nad ramką. Ramka jest neutralna, ciemna z białą obwódką, żeby było ją widać na każdym tle. Pomarańczu nie ma.
- Oko w nagłówku włącza podgląd: kamera jedzie na kadr wybranego kroku i za każdym następnym wyborem. Wyłączenie albo zamknięcie panelu wraca do całej strony.
- Krok, którego kadru nie ma już w dokumencie, dostaje znak ostrzeżenia na liście i zdanie w opisie kadru. Prezentacja go pominie.
- Zapis jest cichy, bez przycisku: zmiana trafia na dysk od razu, a nazwa po krótkiej przerwie w pisaniu. Zmiana od agenta wraca do formularza.

### Prezentacja

`F5`, przycisk Prezentuj w doku albo paleta zamieniają dokument w prezentację jego trasy. `Shift F5` zaczyna od kroku wybranego w formularzu, a dokument bez trasy otwiera formularz.

- Szyna chowa się w lewą krawędź, panel się zamyka, a arkusz bierze całą szerokość okna. Kilka arkuszy składa się do jednego. Wyjście przywraca układ sprzed prezentacji.
- Dok jest pilotem: wstecz, „n z m”, dalej, nazwa kroku, kropki do skoku, narzędzia uwag, wskaźnik, licznik „+n” dodanych uwag i Zakończ. Pilot wjeżdża w miejsce narzędzi i szukania na tej samej sprężynie co reszta doku.
- Krok to jedno naciśnięcie. Kamera jedzie do kadru, a maska przygasza albo chowa resztę strony w trakcie przelotu, nie po nim. Maska jest neutralna, prawie czarna, bez pomarańczu.
- Widać tylko uwagi, które krok wskazał. Kształt nowy w kroku rysuje się piórem, gdy kamera stanie. `D` odsłania wszystkie uwagi dokumentu.
- Klawisze kroków: `→`, spacja i `PgDn` dalej, `←` i `PgUp` wstecz, `Home` i `End` na krańce. W dokumencie pole tekstowe i element z własną obsługą klawisza zostają przy swoim. `Esc` anuluje nową uwagę, potem odkłada narzędzie, a na końcu kończy.
- Uwagi w trakcie: `C` albo `N` od razu stawia szkic obok kadru kroku, a pole wpisu staje nad dokiem, jak paleta. Dokument nie zamarza, więc kliknięcie w niego przestawia szkic. Enter zapisuje. Nowa uwaga nie wchodzi do trasy, ale jej krok pokazuje ją do końca prezentacji. Po wyjściu panel uwag pokazuje listę „Dodane podczas prezentacji”.
- Agent czyta i układa trasę przez MCP (`get_presentation`, `set_presentation`) i CLI (`bibliotter presentation`). Miejsca wskazuje cytatem albo selektorem, a w kroku może narysować nowe kształty. Otwarta apka bierze zmianę od razu.

### Opcje

Zwykły widok panelu, więc wysuwa się na linie i nie zasłania dokumentu. Strona główna mieści się bez przewijania w oknie 900 px, a dwie dłuższe sprawy mają własne strony ze strzałką powrotu, tak jak etykieta.

| Ustawienie | Gdzie żyje | Działanie |
|---|---|---|
| Motyw: Systemowy, Jasny, Ciemny | powłoka | Systemowy idzie za Windows także w trakcie pracy. `T` zawsze wybiera jawny motyw. |
| Język: Polski, English | konfiguracja | Działa od razu, bez przeładowania i bez zamykania arkuszy. Nazwy języków są w ich własnym języku, żeby dało się wrócić bez rozumienia interfejsu. |
| Po uruchomieniu | powłoka | Ekran startowy albo ostatni układ arkuszy, tą samą drogą co `H`. |
| Nowy komentarz | powłoka | Domyślny odbiorca. Przełącznik w doku zmienia go tylko do końca sesji. |
| Uruchamiaj z systemem | system | Przełącznik pokazuje odpowiedź systemu, a nie własny stan. Bez instalatora wpis wskazuje Electron z folderem projektu. |
| Dozwolone adresy | konfiguracja | Hosty, z których dokument może pobierać pliki przez https. Wpisany link skraca się do nazwy hosta. Działa od następnego wczytania dokumentu. |
| Folder danych | tylko podgląd | Ścieżka i przycisk do Eksploratora. |

**Język** obejmuje wszystko, co czyta użytkownik: powłokę, dok, dialogi systemowe i podpowiedzi w dokumencie. Polski tekst zostaje w kodzie i jest kluczem słownika `src/shared/en.ts`, więc napis bez tłumaczenia pokazuje się po polsku, a nie znika. Nowy napis idzie przez `t('…')` i dostaje wpis w słowniku, co pilnuje `tests/i18n.test.ts`. `t` czyta język w chwili wywołania, więc nie wolno go wołać w stałych modułu, bo zamroziłyby język z uruchomienia. CLI i MCP są zawsze po angielsku, niezależnie od tego wyboru, bo ich odbiorcą jest agent, a działają poza apką. Treść dokumentów i nazwy nadane przez użytkownika się nie zmieniają. W palecie obie nazwy filtra działają w obu językach, np. `projekt:` i `project:`.

**Strona Agent** mówi, co jest zainstalowane, i podaje gotowe polecenia z kopiowaniem. Status pluginu daje `claude plugin list --json`, a CLI `where bibliotter`, więc po powrocie z terminala widać wynik bez odświeżania. Zawartość pluginu czytamy z jego folderu, dzięki czemu nowy skill, hook czy polecenie pojawia się w panelu bez zmian w kodzie. Polecenia niosą ścieżkę z tego komputera, więc nie są wpisane na sztywno. Apka nie instaluje niczego sama, bo konfiguracja Claude Code należy do użytkownika.

### Skróty

**Przytrzymanie:** `Ctrl` trzymany ok. 380 ms bez innego klawisza wyciąga klawisze z kontrolek, które są teraz widoczne. Puszczenie, inny klawisz albo klik je chowa. Wśród nich jest `?`, które prowadzi do ściągi.

**Ściąga:** `?` rozwija dok w listę w czterech grupach. Wpisywanie przygasza resztę, ale wiersze zostają na miejscu.

| Skrót | Działanie |
|---|---|
| `Ctrl K` | Paleta, w palecie panel akcji |
| `Ctrl B` | Zwiń nawigację |
| `H` | Ekran startowy i powrót do układu arkuszy |
| `Shift H` | Ściana lub spis |
| `↑` `↓` `←` `→` i `Enter` | Wybór na ekranie startowym |
| `T` | Motyw |
| `Ctrl ,` | Opcje |
| `?` | Ściąga |
| `Esc` | Cofnij krok |
| `V` `C` `N` `M` `A` `P` | Interakcja, komentarz, karteczka, zakreślacz, kształt, wskaźnik |
| `D` | Pokaż lub schowaj rysunki dokumentu |
| `Shift P` | Trasa prezentacji w panelu |
| `F5` `Shift F5` | Prezentuj od pierwszego kroku albo od kroku wybranego w trasie |
| `→` `←` spacja `PgDn` `PgUp` `Home` `End` | Kroki w prezentacji |
| `Ctrl Z` `Ctrl Shift Z` | Cofnij i przywróć zmianę uwag w otwartym dokumencie. W polu tekstowym cofają tekst |
| `S` | Status dokumentu |
| `L` | Etykiety dokumentu |
| `R` | Kopiuj odnośnik dla agenta |
| `I` | Uwagi |
| `Shift I` | Uwagi przy cytatach lub w panelu |
| `O` | Linki z dokumentu i do niego |
| `G` | Spis treści |
| `Shift G` | Minimapa przy krawędzi arkusza |
| `Ctrl` + klik | Zerknij na dokument |
| `Ctrl \` | Przypnij, złóż lub rozłóż |
| `Ctrl ←` `Ctrl →` | Poprzedni i następny arkusz |
| `X` | Zamknij arkusz |
| `Ctrl Enter` | Zerknij na wynik w palecie |
| `Ctrl Shift F` | Pokaż w Eksploratorze |
| `Ctrl Shift C` | Kopiuj ścieżkę |
| `Ctrl Shift R` | Kopiuj odnośnik dla agenta |

### Okno

Docelowo Windows: `Ctrl` zamiast `⌘`, przyciski okna po prawej, „Pokaż w Eksploratorze”. Ostatni arkusz odsuwa swoje przyciski spod przycisków okna. Okno chwyta się za cały górny pasek wysokości przycisków okna (32 px), a także za wolne miejsce w nagłówkach poniżej. Przyciski i tekst na pasku zostają klikalne.

## Czego unikamy

Fioletowych gradientów, Inter, szkła wszędzie, emoji, kart z kolorową lewą krawędzią, kremu z szeryfem i terakotą. Także koloru bez znaczenia i animacji, która nie mówi, skąd coś przyszło.

## Elementy nad dokumentem

Dokument to natywny `WebContentsView`, zawsze nad rendererem. Nie da się na nim rysować z Reacta, dlatego są dwa mechanizmy.

**Warstwa doku** (`src/main/dockLayer.ts`, `src/renderer/src/shell/layer.ts`). Dok, paleta i wskazówka mieszkają na osobnej, przezroczystej stronie w widoku nad dokumentami. Powłoka otwiera ją przez `window.open`, więc strona działa w tym samym wątku, a React rysuje na niej przez portal bez kopii stanu. Strona ma zawsze rozmiar okna, a widać ją tylko przez wycięcie, czyli zewnętrzny `View` obejmujący dok i jego drogę. Tylko tam łapie mysz, reszta trafia do dokumentu. Przesunięcie wycięcia to operacja po stronie przeglądarki, bez zmiany rozmiaru strony, więc dok nie drga, gdy wycięcie idzie za nim.

**Zamrażanie** (`src/renderer/src/shell/native.ts`). Arkusz w ruchu albo pod czymś rysowanym w powłoce to zrzut `capturePage`. Widok czeka wtedy poza oknem w docelowym rozmiarze, a po zatrzymaniu nowy zrzut przenika stary i wraca żywa strona. Skrypty dokumentu działają przez cały czas. Kolejność podmiany jest ścisła: widok schodzi dopiero po klatce, w której powłoka narysowała zrzut, a zrzut znika dopiero po klatce, w której widok już stoi. Pod arkuszem leży miniatura, więc każda luka między nimi to mignięcie innego obrazu tej samej strony. Zrzut w docelowym rozmiarze nie jedzie z arkuszem do końca: na ostatnich 64 px drogi płynnie schodzi na miejsce żywego widoku i tam stoi. Przestrzelenie sprężyny robi wtedy sama krawędź arkusza, a tekst nie drga o piksel w przód i w tył, zanim wróci żywa strona.

| Element | Rozwiązanie |
|---|---|
| Dok, taca, wskazówka doku | Warstwa doku. Dokument zostaje żywy. |
| Paleta i ściąga | Warstwa doku, a pod nią zrzut arkusza za rozmytą zasłoną. |
| Ruch liny, zerknięcia i szeregu | Zrzut na czas ruchu, żywy widok po zatrzymaniu. |
| Status, Przytrzymanie, podgląd z szyny, menu wiersza, podgląd wiersza | Rysowane w powłoce nad zrzutem. |
| Wątek pod pinezką i szkic uwagi | Rysowane w powłoce nad zrzutem. Tekst pisany w dokumencie trafiałby do jego skryptów. |
| Pinezki, karteczki, podkreślenia | `src/preload/overlay.ts`, w zamkniętym Shadow DOM dokumentu. |
| Zakreślacz | Model w `src/preload/marker.ts`, w tym samym Shadow DOM. Tusz w `src/preload/markerInk.ts` ma osobny host bez `z-index`, bo tylko tak `mix-blend-mode` widzi dokument. Przed zrzutem arkusza model znika, a tusz zostaje. |
| Minimapa | `src/preload/minimap.ts`, we własnym zamkniętym Shadow DOM pod warstwą uwag, więc ręka i marker przechodzą nad nią. Szkic liczy `src/preload/pageSketch.ts` porcjami między klatkami, a co leży pod pasem, `src/preload/minimapRoom.ts`. Na zrzucie arkusza zostaje, bo należy do arkusza. |
| Wskaźnik | `src/preload/presenter.ts`, w tym samym Shadow DOM. Widok dokumentu sam przycina rękę, więc nie wchodzi ona na interfejs. Przed zrzutem arkusza ręka znika. Zrzuty i arkusze ucięte przez szereg jej nie mają. |
| Zerknięcie | Żywe jest tylko zerknięcie, układ pod nim czeka jako zrzut. |
| Szereg | Żywe są arkusze w pełni widoczne, te ucięte przez scenę zostają zrzutami. |
| Miniatury na Ścianie | Ukryte okno poza ekranem, wynik trzymany w pamięci podręcznej według zawartości pliku. |
| Arkusz rosnący z miniatury | Zrzut na czas ruchu, żywy widok po zatrzymaniu. |
| Podmiana dokumentu w arkuszu | Stary dokument stoi, aż nowy narysuje pierwszą klatkę, a potem nowy wchodzi od razu, bez przenikania. Po 400 ms stary ustępuje, żeby długie ładowanie nie wyglądało na zawieszenie. Krótszy limit wypadał w środku typowego wczytania, więc między dokumentami błyskała miniatura. |
| Trasa prezentacji | Model i sprawdzanie w `src/shared/presentation.ts`, bez DOM i Electrona. Plik `library/<dokument>/presentation.json` pisze `src/main/presentationStore.ts` przez plik tymczasowy i sygnał, jak uwagi. Ramkę kadru i wskazywanie robi `src/preload/routeFrames.ts` w Shadow DOM warstwy. Powłoka trzyma trasę w `src/renderer/src/shell/route.ts` i nie wczytuje zmiany z dysku, gdy czeka jej własny zapis. |
| Prezentacja | Tryb prowadzi `src/renderer/src/shell/present.ts`: jedno pole `ui.presenting`, a układ bierze z niego krawędzie sceny i szyny. Stan kroku (`stepState` w `src/shared/presentation.ts`) idzie do warstwy dokumentu jako `overlay:present` w haczyku `before` kamery, między zrzutem startowym a ruchem, więc maska i uwagi wchodzą w zrzut końcowy. Maskę kładzie `src/preload/routeFrames.ts` pod kształtami, a pióro rysuje kształt z `partialStrokes` w `src/preload/shapeInk.ts`. Klawisze kroków łapie w dokumencie nasłuch na końcu drogi zdarzenia, tylko w prezentacji. Nowe uwagi trzyma mapa „uwaga → krok” w `present.ts`, a `stepState` dopisuje je do listy kroku. Szkic stawia w dokumencie `overlay:place`, a pole `#presentNote` leży w warstwie doku i poszerza jej wycięcie w `fitLayer`. |
| Trasa od agenta | Format i sprawdzanie w `src/main/agentPresentation.ts`, bez DOM: kadr opisuje cytat, selektor i nagłówek, a zapis bierze zapisaną kotwicę dla kroku oddanego bez zmian. Cytat sprawdza tekst z `analyzeHtml`, porównywany bez odstępów, jak `findByQuote` w warstwie. Całość przechodzi sprawdzenie przed pierwszym zapisem, więc zły krok nie zostawia połowy kształtów. Kadr Miejsce podnosi trafiony element do bloku w `blockOf` (`src/preload/anchor.ts`), w ramce trasy i w kamerze. |
| Przenoszenie uwag | Ruch w `src/preload/noteLift.ts`: każda uwaga w ręce albo w locie ma własne sprężyny położenia, uniesienia, rogu i kołysania, a warstwa nie układa jej znacznika, dopóki nie leży płasko. Przerysowanie warstwy podmienia znaczniki, więc moduł co klatkę pisze style do bieżącego i przenosi na niego przechwycenie myszy. Róg karteczki to `clip-path` z wycięciem i `::before` z odwrotną stroną papieru. Kotwicę liczy `moveTo` w `overlay.ts`, dokument wysyła `move`, a powłoka zapisuje ją przez `annotations:move` w historii cofania. |
| Kształty | Geometria tuszu w `src/preload/shapeInk.ts`, bez DOM, więc ma testy jednostkowe. Rysowanie i układanie w `src/preload/shapes.ts`: jeden SVG w Shadow DOM warstwy, na stronie, więc kształty przewijają się z nią, a pod zoomem kamery rosną z treścią. Szkic zostaje do chwili, gdy apka odeśle zapisany kształt, żeby nie było klatki bez tuszu. Powłoka trzyma kształty w `src/renderer/src/shell/drawings.ts`, poza listą notatek. |
| Kamera arkusza | W spoczynku skala strony przez `Emulation.setPageScaleFactor` (`src/main/docCamera.ts`), więc układ się nie zmienia, a strona zostaje żywa. W ruchu dwa zrzuty na sprężynie (`src/renderer/src/shell/camera.ts`): gdy jeden kadr mieści się w drugim, kamera przejeżdża przez oba, a przy skoku w daleki kadr obrazy przenikają się z lekkim dryfem. Pinezki, karteczki, ręka i zakreślacz kontrują powiększenie, więc mają stały rozmiar na ekranie. |

Koszt: przez ok. sekundę ruchu widać obraz, a nie żywą stronę. Miniatura pokazuje stan z chwili zrzutu, a dokumenty z JS nie działają na niej do otwarcia. Dokument z własnym wewnętrznym przewijaniem albo `overflow: hidden` na korzeniu nie dostaje dolnego zapasu. Wokół doku jest kilka pikseli wycięcia, w których kliknięcie nie trafia w dokument, choć kółko działa.

Kontenery, które tylko przycinają, mają `overflow: clip`. `hidden` da się przewinąć z kodu, np. przez `focus()` albo `scrollIntoView`, a to przesuwa całą powłokę.

## Szybkość

Główny wątek obsługuje okno i nic więcej. Biblioteka działa w osobnym wątku (`src/main/libraryWorker.ts`), a czytanie plików dzieli pula wątków (`src/main/analysisPool.ts`). Migawka biblioteki idzie do powłoki jako tekst, więc główny wątek parsuje ją tylko wtedy, gdy sam o coś pyta.

**Skan.** Wybrany folder działa od razu: ekran mówi, że szuka, a dokumenty wchodzą od najnowszych, zanim skan się skończy. Zapisy idą na końcu, porcjami, więc szukanie i zmiana statusu działają w ich trakcie. Start pokazuje ostatni stan z `cache/library-v1.json`, a skan poprawia go w tle. Zmiana folderów, nazw i ukrycia jest widoczna od razu, bez czekania na skan.

**Wczytywanie.** Tam, gdzie treść dopiero idzie, stoi jej szkielet (`src/renderer/src/ui/Skeleton.tsx`), a nie pustka ani zdanie, że czegoś nie ma. Ściana, panel, podpisy w nagłówkach, miniatury, otwierany dokument, szukanie w treści, linki, strona agenta i paleta pokazują go w tym samym kształcie co treść, więc po wczytaniu nic nie skacze. Kartka ze szkieletem stoi pod miniaturą, a miniatura wchodzi przez przenikanie. Szkielet pojawia się dopiero po 120 ms, więc szybkie wczytanie niczym nie miga, a ściana, która zdążyła go pokazać, nie wiesza kartek drugi raz. Światło przechodzi przez paski przez ok. 24 s i gaśnie, bo dokument bez miniatury nie może migać bez końca. Jest czarno-białe, bo pomarańcz znaczy tylko „czeka na Ciebie”, a ruch odbywa się przez `transform`, żeby nie stawał, gdy główny wątek pracuje.

**Przejście między dokumentami.** Cztery ostatnio otwarte dokumenty czekają żywe poza oknem, więc powrót do nich niczego nie wczytuje. Najazd na wiersz albo wybór na Ścianie i w palecie zaczyna ładowanie po 80 ms, zanim padnie kliknięcie. Zawsze czeka też jeden pusty widok z gotowym procesem, bo start procesu to największa część otwarcia dokumentu.

Koszt: każdy żywy dokument to osobny proces, ok. 70 MB pamięci własnej. Dokumenty czekające poza oknem działają dalej, jak ten na arkuszu. Pomiar przed i po zmianie daje `node tests/e2e/perf.mjs --root <folder>`.
