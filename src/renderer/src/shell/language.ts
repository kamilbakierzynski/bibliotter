import { type Language, setLanguage } from '../../../shared/i18n'
import { notify } from './state'

/*
 * Język zapisuje proces główny, bo sam też pokazuje teksty, a dokumenty dostają go od niego.
 * Powłoka czeka na odczyt przed pierwszym rysowaniem, żeby nie mignąć innym językiem.
 */

function apply(language: Language): void {
  setLanguage(language)
  document.documentElement.lang = language
}

export async function loadLanguage(): Promise<void> {
  apply(await window.api.getLanguage())
}

export function changeLanguage(language: Language): void {
  apply(language)
  void window.api.setLanguage(language)
  notify()
}
