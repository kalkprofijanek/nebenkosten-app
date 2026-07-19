import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { WorkspaceApp } from './WorkspaceApp'
import './styles.css'

const rootElement = document.querySelector('#root')

if (!(rootElement instanceof HTMLElement)) {
  throw new Error('Application root element is missing.')
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>,
)
