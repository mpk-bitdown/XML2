import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
ChartJS.register(ArcElement, Tooltip, Legend)
export default function ProductsChart({labels, data}:{labels:string[], data:number[]}){
  return <Pie data={{ labels, datasets:[{ data, borderWidth:0 }] }} />
}
