import StructuredData, { marketsItemListStructuredData, webPageStructuredData } from '../../../components/StructuredData';

export const metadata = {
  title: 'Markets',
  description: 'Explore Centry lending markets, rates, liquidity, and risk parameters.',
  alternates: {
    canonical: '/app/markets',
  },
};

export default function MarketsLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app/markets',
          name: 'Centry Markets',
          description: metadata.description,
        })}
      />
      <StructuredData data={marketsItemListStructuredData()} />
      {children}
    </>
  );
}
