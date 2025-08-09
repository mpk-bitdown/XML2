import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)
export default function CategoriesChart({labels, data}:{labels:string[], data:number[]}){
  return <Bar data={{ labels, datasets:[{ data, borderWidth:0 }] }} options={{responsive:true, maintainAspectRatio:false}} />
}
