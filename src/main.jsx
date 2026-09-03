import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import NexaStoreApp from './NexaStore.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NexaStoreApp />
  </StrictMode>,
)
