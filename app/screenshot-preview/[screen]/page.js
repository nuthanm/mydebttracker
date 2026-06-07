import HomeClient from '@/app/home/HomeClient';
import DebtsClient from '@/app/debts/DebtsClient';
import NewDebtClient from '@/app/debts/new/NewDebtClient';
import DebtDetailClient from '@/app/debts/[id]/DebtDetailClient';
import AccountClient from '@/app/account/AccountClient';
import { notFound } from 'next/navigation';

const user = {
  id: 'preview-user',
  name: 'Aarav Kumar',
  mobile: '+91 98765 43210',
};

export default function ScreenshotPreviewPage({ params }) {
  if (params.screen === 'home') return <HomeClient user={user} />;
  if (params.screen === 'debts') return <DebtsClient user={user} />;
  if (params.screen === 'new-debt') return <NewDebtClient user={user} />;
  if (params.screen === 'debt-detail') return <DebtDetailClient user={user} debtId="preview-debt" />;
  if (params.screen === 'account') return <AccountClient user={user} />;
  notFound();
}
