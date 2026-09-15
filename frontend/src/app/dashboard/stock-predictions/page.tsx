import { redirect } from 'next/navigation';

export default function StockPredictionsPage() {
  redirect('/dashboard/inventory?area=reorder&view=targets');
}
