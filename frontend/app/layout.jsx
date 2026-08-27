import './globals.css';
import './mobile.css';
import './welcome/landing.css';

export const metadata = {
  title: 'Centry',
  description: 'Arc-native lending and yield infrastructure.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
