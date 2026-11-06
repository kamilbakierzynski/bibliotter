# Język projektowy HTML Docs

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

Sygnał ma dwa zastosowania: status „Do decyzji” i uwaga, na którą odpisał agent. Dokument nie zmienia koloru interfejsu, wraca tylko jako nocna poświata na ścianie.

### Typografia

- Interfejs: Geist 13 px, tytuły 500 lub 550, światło liter `-.01em`.
- Metadane: Geist Mono 11 px.
- Pole palety: 15,5 px.
- Fonty są na licencji OFL, mają polskie znaki i trafiają do paczki aplikacji.

### Geometria

- Szyna 60 px, panel 264 px, uwagi 300 px.
- Dok 52 px wysokości, narzędzia 36 px, małe przyciski 28 px.
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
| Arkusz wraca na ekran startowy | 200 | .92 |
| Ściana i Spis | 165 | .86 |
| Dok kurczy się na ekranie startowym | 240 | .84 |

Lina ma jeszcze sprzężenie 1300 i spadek sztywności .64. Przejścia CSS używają krzywych policzonych ze sprężyn: `springCurve(120, .92)` i `springCurve(170, .62)`.

**Przejścia układu arkuszy są addytywne.** Funkcja układu zawsze mówi, gdzie arkusz ma stać, a sprężyna gasi tylko różnicę. Dzięki temu układ idzie wiernie za szerokością sceny, a przerwane przejście nie traci prędkości.

Przy `prefers-reduced-motion` sprężyny przeskakują do celu.

## Komponenty

### Szyna i panel

Sygnały zostają na szynie także po zwinięciu panelu. Krawędź panelu można chwycić: reaguje na kursor, ciągnie się za ręką i odskakuje.

Biblioteka ma się czytać tak samo przy 50 i przy 5000 dokumentów:

- Domyślnie wyżej stoi to, co ostatnio zmienione. Przycisk obok filtra formatu przełącza na nazwy, z naturalnym porządkiem numerów.
- Archiwum to jeden zwinięty wiersz na końcu projektu. Projekt z samym archiwum jest zwinięty i stoi za bieżącymi.
- Folder powyżej 12 dokumentów startuje zwinięty i pokazuje licznik oraz najmocniejszy sygnał ze środka, więc nic nie ginie po zwinięciu.
- Dokument otwarty z palety rozwija przodków i przewija do swojego wiersza.

### Dok

Stoi pod arkuszem, wyśrodkowany względem sceny. Taca pokazuje kolor karteczki, odbiorcę komentarza albo akcje zaznaczonego tekstu. Przy co najmniej trzech arkuszach dochodzi mapka szeregu. Dok i paleta to jeden element, który rośnie, a nie dwa okna.

### Paleta

- Operatory: `status:`, `projekt:`, `gałąź:`, `format:`, `rodzaj:`. Wystarczy początek słowa.
- Wartość wybrana z listy staje się żetonem, a Backspace w pustym polu usuwa ostatni.
- Tab uzupełnia nazwę filtra, Enter lub Tab dodaje wartość.
- `Ctrl K` otwiera panel akcji wyniku. Skróty akcji działają też bez niego.
- Esc zamyka najpierw panel akcji, potem paletę. Potwierdzenia pojawiają się w stopce.

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
- Szereg zajmuje całą ścianę, więc uwagi stają wtedy na panelu. To samo dotyczy okna węższego niż 1180 px.

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
| `?` | Ściąga |
| `Esc` | Cofnij krok |
| `V` `C` `N` | Interakcja, komentarz, karteczka |
| `S` | Status dokumentu |
| `I` | Uwagi |
| `Shift I` | Uwagi przy cytatach lub w panelu |
| `Ctrl` + klik | Zerknij na dokument |
| `Ctrl \` | Przypnij, złóż lub rozłóż |
| `Ctrl ←` `Ctrl →` | Poprzedni i następny arkusz |
| `X` | Zamknij arkusz |
| `Ctrl Enter` | Zerknij na wynik w palecie |
| `Ctrl Shift F` | Pokaż w Eksploratorze |
| `Ctrl Shift C` | Kopiuj ścieżkę |

### Okno

Docelowo Windows: `Ctrl` zamiast `⌘`, przyciski okna po prawej, „Pokaż w Eksploratorze”. Ostatni arkusz odsuwa swoje przyciski spod przycisków okna.

## Czego unikamy

Fioletowych gradientów, Inter, szkła wszędzie, emoji, kart z kolorową lewą krawędzią, kremu z szeryfem i terakotą. Także koloru bez znaczenia i animacji, która nie mówi, skąd coś przyszło.

## Do rozstrzygnięcia przy wdrożeniu

Dokument to natywny `WebContentsView`, zawsze nad rendererem. Nie da się na nim rysować z Reacta, więc każdy element, który nachodzi na arkusz, potrzebuje osobnego rozwiązania.

| Element | Propozycja |
|---|---|
| Paleta i ściąga | Zrzut `capturePage` pod rozmytą zasłoną, widok natywny schowany na czas palety. |
| Przestrzelenie liny | Zrzut na czas ruchu albo przestrzelenie mieszczące się w odstępie sceny. |
| Popover statusu | Osobna przezroczysta warstwa dopasowana do jego wymiarów. |
| Wątek pod pinezką | Rysowany w dokumencie przez `src/preload/overlay.ts`. |
| Klawisze przy `Ctrl` | Te nad arkuszem też przez `overlay.ts`. |
| Zerknięcie | Dwa widoki natywne w stosie, zrzut tylko na czas wjazdu. |
| Szereg | Zrzuty w ruchu, żywe widoki po zatrzymaniu kamery. |
| Miniatury na Ścianie | Zrzut poza ekranem po zeskanowaniu, trzymany w pamięci podręcznej i odświeżany przy zmianie pliku. |
| Arkusz rosnący z miniatury | Zrzut na czas ruchu, żywy widok po zatrzymaniu. |

Koszt zrzutów: skrypty w dokumencie działają dalej, ale przez ok. sekundę ruchu widać obraz, a nie żywą stronę. Miniatura pokazuje stan z chwili zrzutu, a dokumenty z JS nie działają na niej do otwarcia.
