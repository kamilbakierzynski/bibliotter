/*
 * Łapka wydry na kijku, oglądana od wierzchu. Podmienia rękawiczkę 1:1: początek układu to czubek
 * pazurka wyprostowanego palca, więc to on stoi pod kursorem. Kolory są płaskie, w szarości sierści
 * ze znaku, bo gradienty i ciemne plamy robiły z pierwszej łapki rękę potwora.
 *
 * Porównanie z rękawiczką na jasnym i ciemnym tle leży w design/lapka.html.
 */

const INK = '#131316'
const HALO = 'rgb(255 255 255 / 55%)'
/** Kontur tej samej grubości co rękawiczka, żeby wskaźnik czytał się na jasnym i ciemnym tle. */
const LINE = 4.6

/** Kijek i kołnierz są wspólne z rękawiczką. */
const STICK = 'M9 150H18V3400H9Z'
const COLLAR = 'M6 159.5H21A2 2 0 0 1 23 161.5V169A2.5 2.5 0 0 1 20.5 171.5H6.5A2.5 2.5 0 0 1 4 169V161.5A2 2 0 0 1 6 159.5Z'

const FUR = '#8b8b95'
/** Błona pławna jest cieńsza od futra, więc jaśniejsza. */
const WEB_FILL = '#d2d2d8'
/** Kołnierz o ton ciemniejszy, żeby oddzielał łapkę od kijka. */
const RUFF_FILL = '#7b7b84'
/** Kreski sierści i fałdka są szare, a nie w kolorze tuszu, żeby nie rysowały szwów. */
const TICK = '#6c6c75'
/** Pazurki są krótkie i tępe jak paznokietki. */
const CLAW_FILL = '#4a4a52'

/** Grzbiet łapy z wyprostowanym palcem. Zgięte palce to trzy okrągłe kłykcie po prawej. */
const PAW =
  'M0 8.5C9.4 8.5 17 16 17 25C17 32 16.4 37.5 16 42.5A12.6 12.6 0 0 1 38.4 53.6A13.2 13.2 0 0 1 55.6 73A13.2 13.2 0 0 1 59.6 98C59 118 45 141 14 143.5C-4 145-18 138-24.5 128C-28 121-27 108-23.5 96C-19.5 82-17.2 62-17 42C-17 35-17 30-17 25C-17 16-9.4 8.5 0 8.5Z'
/** Kciuk to pulchna fasolka odchylona w lewo. Jego nasada chowa się pod grzbietem. */
const THUMB = 'M-20 94C-29 89-42 87-52 89.5C-60.5 91.5-65.5 98-64.5 105.5C-63.5 113-57 117.5-48 119.5C-39 121.5-28 124-19 126Z'
/** Błona rozpięta łukiem między palcem a kciukiem. Reszta chowa się pod nimi. */
const WEB = 'M-16.8 36C-17.4 60-29 80-50 90L-34 110L-17 112Z'
/** Puszysty kołnierz zamiast mankietu. Trzy kępki przykrywają koniec kijka. */
const RUFF =
  'M-20 124C-25 132-26 141-21 147A11.3 11.3 0 0 0-3 156A11.1 11.1 0 0 0 16 161.5A11.1 11.1 0 0 0 35 156A9.7 9.7 0 0 0 48 145C51 138 48 130 42 124Z'
/** Pazurki wystają spod futra na końcu palca i kciuka. */
const CLAWS =
  'M5 18C5 12.3 4.3 8.3 4.3 5.9A4.3 4.3 0 0 0-4.2 5.9C-4.2 8.3-5 12.3-5 18ZM-54.5 100.7C-60.3 100-65 100.1-67.4 99.8A3.7 3.7 0 0 0-68.3 107.1C-65.8 107.4-61.3 108.6-55.5 109.3Z'
/** Kreski między kłykciami zwężają się do punktu, jak w rękawiczce, więc są wypełnieniem. */
const CREASES =
  'M14 43.8Q14.4 50.9 15 58Q16.8 51.1 18.4 44.2A2.2 2.2 0 0 0 14 43.8ZM36.6 52.3Q34 57.9 31.5 63.5Q35.9 59.2 40.2 54.9A2.2 2.2 0 0 0 36.6 52.3ZM54.4 71.2Q50.4 75 46.5 79Q51.7 77 56.8 74.8A2.2 2.2 0 0 0 54.4 71.2Z'
/** Jedna fałdka mówi, że błona to cienka skórka. */
const FOLD = 'M-20.5 68c-2.6 6-6.6 10.6-11.4 13.6'
/** Kreski sierści na grzbiecie w miejscu szwów rękawiczki. */
const TICKS = 'M2 108c-1.6 3-1.8 6.5-.6 9.5M20 104c-1.4 3.4-1.4 7 0 10M37 110c-1.6 3-2.6 6-2 9.5'
const RUFF_LINES = 'M-3 156c-1-3-1-6 .5-9M35 156c1-3 1-6-.4-9'

/** Sylwetka łapki z kijkiem: wypełniona na czarno daje cień, a pogrubiona poświatę. */
export const PAW_SHAPES = [STICK, RUFF, CLAWS, WEB, THUMB, PAW].map((d) => `<path d="${d}"/>`).join('')

/** Pełny rysunek łapki do warstwy .rig, razem z kijkiem, kołnierzem i poświatą. */
export const PAW_HAND = `<svg aria-hidden="true">
  <g stroke-linejoin="round" stroke-linecap="round">
    <g fill="${HALO}" stroke="${HALO}" stroke-width="${LINE + 4}">${PAW_SHAPES}</g>
    <path d="${STICK}" fill="#fff" stroke="${INK}" stroke-width="3.6"/>
    <path d="${COLLAR}" fill="${INK}"/>
    <path d="${RUFF}" fill="${RUFF_FILL}" stroke="${INK}" stroke-width="${LINE}"/>
    <path d="${RUFF_LINES}" fill="none" stroke="${INK}" stroke-width="2.6"/>
    <path d="${CLAWS}" fill="${CLAW_FILL}" stroke="${INK}" stroke-width="2.6"/>
    <path d="${WEB}" fill="${WEB_FILL}" stroke="${INK}" stroke-width="3.4"/>
    <path d="${FOLD}" fill="none" stroke="${TICK}" stroke-width="2"/>
    <path d="${THUMB}" fill="${FUR}" stroke="${INK}" stroke-width="${LINE}"/>
    <path d="${PAW}" fill="${FUR}" stroke="${INK}" stroke-width="${LINE}"/>
    <path d="${CREASES}" fill="${INK}"/>
    <path d="${TICKS}" fill="none" stroke="${TICK}" stroke-width="2.4"/>
  </g>
</svg>`
