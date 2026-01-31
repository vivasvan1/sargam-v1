import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { NotebookSettingsProvider } from './context/NotebookSettingsContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotebookSettingsProvider>
      <App />
    </NotebookSettingsProvider>
  </StrictMode>,
)

