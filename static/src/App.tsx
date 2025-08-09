
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import SessionsPage from './pages/Sessions'
import CategoriesPage from './pages/Categories'

export default function App(){
  return (
    <div className="min-h-screen">
      <Topbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 ml-16 md:ml-64 p-4 space-y-4">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
