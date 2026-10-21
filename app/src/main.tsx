import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { StoreProvider } from './lib/store.tsx'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/charts.css'
import './styles/holding.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
