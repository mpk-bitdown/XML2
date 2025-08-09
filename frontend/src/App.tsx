import { useEffect } from 'react'
import { useApp } from './state'
import api from './api'
import ProductsChart from './ProductsChart'
import CategoriesChart from './CategoriesChart'
import './index.css'

function useCharts() {
  const sessionId = useApp(s => s.sessionId)
  const [labelsP, setLabelsP] = React.useState<string[]>([])
  const [dataP, setDataP] = React.useState<number[]>([])
  const [labelsC, setLabelsC] = React.useState<string[]>([])
  const [dataC, setDataC] = React.useState<number[]>([])

  useEffect(()=>{
    if (!sessionId) return
    setLabelsP([]); setDataP([]); setLabelsC([]); setDataC([])
    api.get('/api/analytics/products/chart').then(r=>{
      setLabelsP(r.data.labels||[]); setDataP((r.data.series||[])[0]||[])
    })
    api.get('/api/analytics/categories').then(r=>{
      setLabelsC(r.data.labels||[]); setDataC((r.data.series||[])[0]||[])
    })
  }, [sessionId])

  return { labelsP, dataP, labelsC, dataC }
}

export default function App(){
  const { labelsP, dataP, labelsC, dataC } = useCharts()
  const toggle = useApp(s=>s.toggleSidebar)
  return (
    <div className="p-4 text-white bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Gestión Documental</h1>
        <button onClick={toggle} className="border px-3 py-1 rounded">☰ Menú</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 p-3 rounded">
          <h2 className="mb-2">Productos</h2>
          <ProductsChart labels={labelsP} data={dataP} />
        </div>
        <div className="bg-slate-800 p-3 rounded h-80">
          <h2 className="mb-2">Categorías</h2>
          <CategoriesChart labels={labelsC} data={dataC} />
        </div>
      </div>
    </div>
  )
}
