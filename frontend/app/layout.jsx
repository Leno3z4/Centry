import './globals.css';
import './typography.css';
import './mobile.css';
import './mobile-nav.css';
import './welcome/landing.css';
import './wallet-picker.css';
import './health-meter.css';
import { Providers } from '../components/Providers';

export const metadata = {
  title: 'Centry',
  description: 'Arc-native lending and yield infrastructure.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
