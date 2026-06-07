import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AccountClient from './AccountClient';

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <AccountClient user={user} />;
}
