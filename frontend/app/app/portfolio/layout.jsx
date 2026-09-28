import StructuredData, { webPageStructuredData } from '../../../components/StructuredData';

export const metadata = {
  title: 'Portfolio',
  description: 'View your collateral, debt, borrowing room, and account health in Centry.',
  alternates: {
    canonical: '/app/portfolio',
  },
};

export default function PortfolioLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app/portfolio',
          name: 'Centry Portfolio',
          description: metadata.description,
        })}
      />
      {children}
    </>
  );
}
