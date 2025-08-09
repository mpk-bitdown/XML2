
import CategoriesChart from '../components/CategoriesChart'
import { useEnsureSession } from '../hooks'

export default function CategoriesPage(){
  useEnsureSession()
  return (
    <div className="space-y-4">
      <CategoriesChart />
    </div>
  )
}
