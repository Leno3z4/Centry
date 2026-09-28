import StructuredData, { webPageStructuredData } from '../../../components/StructuredData';

export const metadata = {
  title: 'Bridge',
  description: 'Bridge supported USDC routes across Arc and connected networks through Centry.',
  alternates: {
    canonical: '/app/bridge',
  },
};

export default function BridgeLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app/bridge',
          name: 'Centry Bridge',
          description: metadata.description,
        })}
      />
      {children}
    </>
  );
}
