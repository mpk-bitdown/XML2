
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SessionState = {
  sessionId: number | null
  setSessionId: (id: number | null) => void
  collapseSidebar: boolean
  toggleSidebar: () => void
}
export const useSessionStore = create<SessionState>()(persist((set) => ({
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
  collapseSidebar: false,
  toggleSidebar: () => set((s)=>({ collapseSidebar: !s.collapseSidebar }))
}), { name: 'edudown-session' }))
