import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import SecurityOnboardingClient from './SecurityOnboardingClient';

export const metadata = {
  title: 'Secure Your Account',
  description: 'Enable MFA now for stronger account protection.',
};

export default async function SecurityOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.mfaEnabled) redirect('/home');
  if (user.mfaSkipUntil && new Date(user.mfaSkipUntil) > new Date()) redirect('/home');

  return <SecurityOnboardingClient user={user} />;
}
