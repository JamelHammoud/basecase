import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OverlayScrollbars } from './design-system/OverlayScrollbars'

// Lets the sidebar use native window vibrancy inside Electron
if (window.electronAPI?.isElectron) {
  document.documentElement.classList.add('is-electron')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <OverlayScrollbars />
  </StrictMode>,
)
