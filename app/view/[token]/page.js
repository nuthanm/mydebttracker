import { unstable_noStore as noStore } from 'next/cache';
import ViewShell from '@/components/ViewShell';
import { getViewAccess, loadViewDebts, viewLinkIsActive } from '@/lib/view-access';
import DebtsClient from '@/app/debts/DebtsClient';
import ViewUnlockClient from './ViewUnlockClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function InactiveView() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-paper-card border border-edge rounded-2xl p-7 text-center">
        <div className="w-12 h-12 rounded-2xl bg-ink text-paper flex items-center justify-center text-xl font-medium mx-auto mb-4">₹</div>
        <h1 className="text-xl font-medium">This view link is not active</h1>
        <p className="text-sm text-ink-soft mt-2">
          The owner may have replaced or revoked it. Ask them for a new link and password.
        </p>
      </div>
    </div>
  );
}

export default async function ViewDebtsPage({ params }) {
  noStore();
  const active = await viewLinkIsActive(params.token);
  if (!active) return <InactiveView />;

  const access = await getViewAccess(params.token);
  if (!access) return <ViewUnlockClient token={params.token} />;

  const loaded = await loadViewDebts(access.userId);
  const expiresLabel = new Date(access.expiresAt).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <ViewShell token={params.token} ownerName={loaded.ownerName}>
      <div className="px-4 md:px-8 pt-5 max-w-5xl mx-auto w-full">
        <div className="rounded-xl border border-edge bg-paper-tint px-4 py-3">
          <p className="text-sm font-medium">View only</p>
          <p className="text-xs text-ink-soft mt-1">
            You can see the same debts and payments. Adding, editing, deleting, payments, and export stay off.
            This view closes on this device after {expiresLabel}.
          </p>
        </div>
      </div>
      <DebtsClient
        readOnly
        linkBase={`/view/${params.token}`}
        initialDebts={loaded.debts}
        initialCategories={loaded.categories}
        initialInstrumentTags={loaded.instrumentTags}
        initialPriorities={loaded.priorities}
      />
    </ViewShell>
  );
}
