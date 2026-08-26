import './globals.css';
import './mobile.css';

export const metadata = {
  title: 'Centry',
  description: 'Native USDC lending and yield infrastructure on Arc.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
