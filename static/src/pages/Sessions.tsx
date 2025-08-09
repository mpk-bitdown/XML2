
import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useSessionStore } from '../state'
import { useNavigate } from 'react-router-dom'

export default function SessionsPage(){
  const setSessionId = useSessionStore(s=>s.setSessionId)
  const nav = useNavigate()
  const create = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/sessions', { name: `Sesión ${new Date().toLocaleString('es-CL')}`, document_ids: [] })
      return res.data
    },
    onSuccess: (data) => {
      if (data?.id){
        setSessionId(Number(data.id))
        nav('/?session='+data.id)
      }
    }
  })
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Sesiones</div>
        <button className="btn btn-primary" onClick={()=>create.mutate()}>Nueva sesión</button>
      </div>
      <p className="text-white/60 mt-2">Al crear una nueva sesión, el dashboard se reinicia en cero.</p>
    </div>
  )
}
