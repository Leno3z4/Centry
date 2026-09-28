import StructuredData, { webPageStructuredData } from '../../../components/StructuredData';

export const metadata = {
  title: 'Gateway',
  description: 'Manage unified USDC liquidity and supported Gateway funding flows with Centry.',
  alternates: {
    canonical: '/app/gateway',
  },
};

export default function GatewayLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app/gateway',
          name: 'Centry Gateway',
          description: metadata.description,
        })}
      />
      {children}
    </>
  );
}
