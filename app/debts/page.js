import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import DebtsClient from './DebtsClient';

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <DebtsClient user={user} />;
}
