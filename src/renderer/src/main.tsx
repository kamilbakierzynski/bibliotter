// Pierwszy, żeby migawka biblioteki ruszyła, zanim wczyta się reszta powłoki.
import './shell/prefetch'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { App } from './App'
import { loadLanguage } from './shell/language'
import { openLayer } from './shell/layer'
import { openLinkCards } from './shell/linkHover'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Brak elementu #root')

// Karty linków nie są potrzebne do startu, więc ich warstwa nie wstrzymuje powłoki.
void Promise.all([openLayer(), loadLanguage()]).then(() => {
  openLinkCards().catch((error: unknown) => console.error(error))
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
