import './globals.css';

export const metadata = {
  title: 'My Debt Tracker',
  description: 'Track every rupee you owe, in one place.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0E1714',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
