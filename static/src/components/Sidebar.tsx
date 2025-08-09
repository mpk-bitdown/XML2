
import { Link, useLocation } from 'react-router-dom'
import { useSessionStore } from '../state'
import cls from 'classnames'

export default function Sidebar(){
  const { collapseSidebar } = useSessionStore()
  const loc = useLocation()
  const active = (p:string)=> loc.pathname===p
  return (
    <aside className={cls("fixed left-0 top-0 bottom-0 w-64 bg-panel/90 border-r border-white/10 p-4 transition-all", { "w-16": collapseSidebar })}>
      <div className="text-xs uppercase tracking-wider text-white/60 px-2 mb-2">Inicio</div>
      <nav className="space-y-2">
        <Link className={cls("block px-3 py-2 rounded-lg hover:bg-white/10", { "bg-white/10": active("/") })} to="/">Dashboard</Link>
        <div className="text-xs uppercase tracking-wider text-white/60 px-2 mt-4">Sesiones</div>
        <Link className={cls("block px-3 py-2 rounded-lg hover:bg-white/10", { "bg-white/10": active("/sessions") })} to="/sessions">Sesiones</Link>
        <div className="text-xs uppercase tracking-wider text-white/60 px-2 mt-4">Análisis</div>
        <Link className={cls("block px-3 py-2 rounded-lg hover:bg-white/10", { "bg-white/10": active("/categories") })} to="/categories">Categorías AI</Link>
      </nav>
    </aside>
  )
}
