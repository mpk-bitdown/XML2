
import axios from 'axios'
import { useSessionStore } from './state'

export const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_BASE || (__API__ || ''),
  withCredentials: false,
  headers: {
    'Cache-Control': 'no-cache'
  }
})

api.interceptors.request.use((config) => {
  const sid = useSessionStore.getState().sessionId
  if (sid) {
    config.headers['X-Session-Id'] = String(sid)
    // also append session param if not present
    const url = new URL(config.baseURL ? config.baseURL + (config.url || '') : (config.url || ''), window.location.origin)
    if (!url.searchParams.get('session')) {
      url.searchParams.set('session', String(sid))
      config.url = url.pathname + '?' + url.searchParams.toString()
    }
  }
  config.headers['X-Live-View'] = 'true'
  config.headers['Pragma'] = 'no-cache'
  return config
})
