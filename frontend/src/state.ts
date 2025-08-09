import { create } from 'zustand'
type AppState = {
  sessionId: string
  setSession: (id: string)=>void
  sidebarCollapsed: boolean
  toggleSidebar: ()=>void
}
export const useApp = create<AppState>((set)=> ({
  sessionId: new URLSearchParams(location.search).get('session') || localStorage.getItem('currentSessionId') || '',
  setSession: (id)=> { localStorage.setItem('currentSessionId', id); set({ sessionId: id }); },
  sidebarCollapsed: localStorage.getItem('sidebarCollapsed')==='1',
  toggleSidebar: ()=> set((s)=>{ const v = !s.sidebarCollapsed; localStorage.setItem('sidebarCollapsed', v?'1':'0'); return { sidebarCollapsed: v } })
}))
