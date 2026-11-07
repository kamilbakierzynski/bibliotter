/** Wydrowe drobiazgi, które nie zależą od interfejsu: dzień w roku i nazwy wersji. */

/** Światowy Dzień Wydry wypada w ostatnią środę maja. */
export function isOtterDay(date: Date): boolean {
  return date.getMonth() === 4 && date.getDay() === 3 && date.getDate() + 7 > 31
}

/**
 * Każda wersja minor dostaje łacińską nazwę rodzaju wydry, alfabetycznie. Siedem rodzajów starcza
 * do 0.7, a 1.0 nosi nazwę całej podrodziny. Dalej nazw nie ma, więc wiersz pokazuje sam numer.
 */
const GENERA = ['Aonyx', 'Enhydra', 'Hydrictis', 'Lontra', 'Lutra', 'Lutrogale', 'Pteronura']

export function versionName(version: string): string | null {
  const [major = NaN, minor = NaN] = version.split('.').map(Number)
  if (major === 0 && minor >= 1) return GENERA[minor - 1] ?? null
  if (major === 1) return 'Lutrinae'
  return null
}
