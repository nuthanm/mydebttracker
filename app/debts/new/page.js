import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import NewDebtClient from './NewDebtClient';

export default async function NewDebtPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <NewDebtClient user={user} />;
}
