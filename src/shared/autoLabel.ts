/** Ustawienia z zakładki AI. */
export interface AutoLabelOptions {
  /** Nowe pliki dostają etykiety bez pytania. */
  newFiles: boolean
  /** Haiku dopisuje kody zgłoszeń, np. PAY-1482. */
  tickets: boolean
  /** Etykiety do wyboru obok tych, które są już w bibliotece. */
  starters: string[]
}

/** Stan etykietowania przez Haiku. Powłoka pokazuje go w zakładce AI i w wybieraku. */
export interface AutoLabelState extends AutoLabelOptions {
  /** Dokumenty w kolejce i w trakcie. */
  pending: string[]
  done: number
  total: number
  error: string | null
}

export interface AutoLabelResult {
  /** Etykiety, które naprawdę doszły. Pusta lista znaczy, że nic nie pasowało. */
  labels: string[]
  error: string | null
}
