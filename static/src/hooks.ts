
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useSessionStore } from './state'

export function useEnsureSession(){
  const [sp, setSp] = useSearchParams()
  const sidParam = sp.get('session')
  const { sessionId, setSessionId } = useSessionStore()
  const nav = useNavigate()

  useEffect(()=>{
    if (sidParam){
      const n = Number(sidParam)
      if (!Number.isNaN(n) && n>0 && n !== sessionId){ setSessionId(n) }
    } else if (sessionId){
      sp.set('session', String(sessionId))
      setSp(sp, { replace: true })
    }
  }, [sidParam, sessionId])

  return sessionId
}
