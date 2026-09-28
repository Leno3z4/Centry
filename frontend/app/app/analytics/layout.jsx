import StructuredData, { webPageStructuredData } from '../../../components/StructuredData';

export const metadata = {
  title: 'Analytics',
  description: 'Live Centry market, liquidity, utilization, and risk analytics.',
  alternates: {
    canonical: '/app/analytics',
  },
};

export default function AnalyticsLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app/analytics',
          name: 'Centry Analytics',
          description: metadata.description,
        })}
      />
      {children}
    </>
  );
}
