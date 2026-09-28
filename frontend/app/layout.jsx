import './globals.css';
import './typography.css';
import './mobile.css';
import './mobile-nav.css';
import './wallet-picker.css';
import './wallet-mobile-fix.css';
import './health-meter.css';
import './overview.css';
import './eyebrow-reset.css';
import './apple-skin.css';
import './unified-grey-theme.css';
import './centry-design-system.css';
import { Providers } from '../components/Providers';

export const metadata = {
  metadataBase: new URL('https://centry.ink'),
  title: {
    default: 'Centry — Arc-native lending & yield',
    template: '%s | Centry',
  },
  description: 'Arc-native lending, borrowing, swaps, and yield infrastructure.',
  alternates: {
    canonical: '/',
  },
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
