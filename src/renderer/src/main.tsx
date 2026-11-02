import '@fontsource-variable/inter'
import './styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerBuiltInAdapters } from '@adapters/index'
import App from './App'

// Adapters must be registered before the store talks to them.
registerBuiltInAdapters()

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
