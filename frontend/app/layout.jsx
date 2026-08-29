import './globals.css';
import './mobile.css';
import './welcome/landing.css';
import './wallet-picker.css';
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
