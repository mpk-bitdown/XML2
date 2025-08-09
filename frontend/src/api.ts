import axios from 'axios'
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/',
  withCredentials: false,
})
function getSessionId() {
  const p = new URLSearchParams(location.search)
  return p.get('session') || localStorage.getItem('currentSessionId') || ''
}
api.interceptors.request.use((config)=>{
  const sid = getSessionId()
  config.headers = {
    ...config.headers,
    'X-Session-Id': sid,
    'Cache-Control': 'no-cache',
    'X-Live-View': 'true'
  }
  if (config.url && !config.url.includes('session=')) {
    const sep = config.url.includes('?') ? '&' : '?'
    config.url = `${config.url}${sep}session=${encodeURIComponent(sid)}`
  }
  return config
})
export default api
