
import { Bar } from 'react-chartjs-2'
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useSessionStore } from '../state'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function CategoriesChart(){
  const sid = useSessionStore(s=>s.sessionId)
  const { data } = useQuery({
    queryKey: ['categoriesChart', sid],
    queryFn: async () => {
      if(!sid) return { labels: [], series: [] }
      const res = await api.get(`/api/analytics/categories`, { params: { session: sid } })
      return res.data || { labels: [], series: [] }
    }
  })
  const labels = data?.labels || []
  const series = data?.series || []
  const chartData = {
    labels,
    datasets: [{
      label: 'Total',
      data: series,
    }]
  }
  return <div className="card"><Bar data={chartData} /></div>
}
