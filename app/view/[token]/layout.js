export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Private view',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ViewLayout({ children }) {
  return children;
}
