import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import VarejoPmePage from './pages/VarejoPmePage'
import SignalAgroPage from './pages/SignalAgroPage'
import SignalIndustryPage from './pages/SignalIndustryPage'
import SignalEnergyPage from './pages/SignalEnergyPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/varejo" element={<VarejoPmePage />} />
        <Route path="/varejo-pme" element={<VarejoPmePage />} />
        <Route path="/agro" element={<SignalAgroPage />} />
        <Route path="/industria" element={<SignalIndustryPage />} />
        <Route path="/energia" element={<SignalEnergyPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
