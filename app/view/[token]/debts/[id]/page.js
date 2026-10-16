import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import ViewShell from '@/components/ViewShell';
import { getViewAccess, loadViewDebt } from '@/lib/view-access';
import DebtDetailClient from '@/app/debts/[id]/DebtDetailClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ViewDebtPage({ params }) {
  noStore();
  const access = await getViewAccess(params.token);
  if (!access) redirect(`/view/${params.token}`);

  const detail = await loadViewDebt(access.userId, params.id);
  if (!detail) notFound();

  return (
    <ViewShell token={params.token} ownerName={access.ownerName}>
      <DebtDetailClient
        readOnly
        debtId={params.id}
        initialDebt={detail.debt}
        initialPayments={detail.payments}
        backHref={`/view/${params.token}`}
      />
    </ViewShell>
  );
}
