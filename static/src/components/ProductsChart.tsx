
import { Bar, Pie } from 'react-chartjs-2'
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useSessionStore } from '../state'

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function ProductsChart(){
  const sid = useSessionStore(s=>s.sessionId)
  const { data } = useQuery({
    queryKey: ['productsChart', sid],
    queryFn: async () => {
      if(!sid) return { labels: [], series: [] }
      const res = await api.get(`/api/analytics/products/chart`, { params: { session: sid } })
      return res.data || { labels: [], series: [] }
    }
  })
  const labels = data?.labels || []
  const series = data?.series || []
  const chartData = {
    labels,
    datasets: [{
      label: 'Cantidad',
      data: series,
    }]
  }
  return <div className="card"><Pie data={chartData} /></div>
}
