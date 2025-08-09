
import ProductsChart from '../components/ProductsChart'
import CategoriesChart from '../components/CategoriesChart'
import { useEnsureSession } from '../hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useSessionStore } from '../state'
import { useRef, useState } from 'react'

export default function Dashboard(){
  const sid = useEnsureSession()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileList|null>(null)

  const upload = useMutation({
    mutationFn: async (f: FileList) => {
      const form = new FormData()
      for (let i=0;i<f.length;i++){ form.append('files', f[i]) }
      const res = await api.post('/api/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['productsChart', sid]})
      qc.invalidateQueries({queryKey:['categoriesChart', sid]})
    }
  })

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="font-semibold mb-2">Subir documentos</div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e)=>setFiles(e.target.files)} />
          <button className="btn" onClick={()=>fileRef.current?.click()}>Elegir archivos</button>
          <button className="btn btn-primary" disabled={!files} onClick={()=> files && upload.mutate(files)}>Subir</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProductsChart />
        <CategoriesChart />
      </div>
    </div>
  )
}
