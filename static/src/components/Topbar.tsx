
import { useSessionStore } from '../state'

export default function Topbar(){
  const { sessionId, toggleSidebar } = useSessionStore()
  return (
    <header className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-white/10">
      <div className="flex items-center justify-between px-4 py-3">
        <button className="btn bg-white/10" onClick={toggleSidebar}>☰ Menú</button>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-white/10">Sesión {sessionId ?? '—'}</span>
          <a className="btn" href="/login.html">Cerrar sesión</a>
        </div>
      </div>
    </header>
  )
}
