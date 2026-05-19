import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import '@/lib/i18n'
import { isRTL } from '@/lib/i18n'
import { TRPCProvider } from "@/providers/trpc"
import { Toaster } from "@/components/ui/sonner"
import App from './App.tsx'

// Set initial RTL direction
const lng = localStorage.getItem('i18nextLng') || 'fa'
document.documentElement.dir = isRTL(lng) ? 'rtl' : 'ltr'
document.documentElement.lang = lng

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
        <Toaster />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
