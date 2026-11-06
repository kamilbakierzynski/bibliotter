import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { App } from './App'
import { openLayer } from './shell/layer'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Brak elementu #root')

void openLayer().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
