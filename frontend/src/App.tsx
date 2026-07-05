import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DispatchCenter from './pages/DispatchCenter'
import PayloadRTOW from './pages/PayloadRTOW'
import FlightPlanning from './pages/FlightPlanning'
import OfpGenerator from './pages/OfpGenerator'
import Weather from './pages/Weather'
import RouteBuilder from './pages/RouteBuilder'
import FleetManagement from './pages/FleetManagement'
import AirportsDatabase from './pages/AirportsDatabase'
import PerformanceAnalysis from './pages/PerformanceAnalysis'
import AIDispatchAssistant from './pages/AIDispatchAssistant'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dispatch-center" element={<DispatchCenter />} />
          <Route path="/payload-rtow" element={<PayloadRTOW />} />
          <Route path="/flight-planning" element={<FlightPlanning />} />
          <Route path="/ofp-generator" element={<OfpGenerator />} />
          <Route path="/weather" element={<Weather />} />
          <Route path="/route-builder" element={<RouteBuilder />} />
          <Route path="/fleet" element={<FleetManagement />} />
          <Route path="/airports" element={<AirportsDatabase />} />
          <Route path="/performance" element={<PerformanceAnalysis />} />
          <Route path="/ai-assistant" element={<AIDispatchAssistant />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
