import '@fontsource-variable/inter'
import './styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerBuiltInAdapters } from '@adapters/index'
import App from './App'

// Adapters must be registered before the store talks to them.
registerBuiltInAdapters()

// Files dropped outside a drop zone must not navigate away from the app.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (event) => event.preventDefault())
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
