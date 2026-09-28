import StructuredData, { CENTRY_WEBAPP_ID, webPageStructuredData } from '../../components/StructuredData';

export const metadata = {
  title: 'Dashboard',
  description: 'Your Centry account overview with wallet balance, positions, borrowing capacity, and account health.',
  alternates: {
    canonical: '/app',
  },
};

export default function AppLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app',
          name: 'Centry Dashboard',
          description: metadata.description,
          about: { '@id': CENTRY_WEBAPP_ID },
        })}
      />
      {children}
    </>
  );
}
