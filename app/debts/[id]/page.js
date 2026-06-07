import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import DebtDetailClient from './DebtDetailClient';

export default async function DebtDetailPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <DebtDetailClient user={user} debtId={params.id} />;
}
