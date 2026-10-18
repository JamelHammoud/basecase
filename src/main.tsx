import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OverlayScrollbars } from './design-system/OverlayScrollbars'

// Lets the sidebar use native window vibrancy inside Electron
const electronAPI = window.electronAPI
if (electronAPI?.isElectron) {
  const root = document.documentElement
  root.classList.add('is-electron')
  // Full screen has no desktop behind the window, so the chrome turns solid
  const setFullScreen = (value: boolean) => root.classList.toggle('is-fullscreen', value)
  electronAPI.isFullScreen().then(setFullScreen)
  electronAPI.onFullScreenChange(setFullScreen)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <OverlayScrollbars />
  </StrictMode>,
)
