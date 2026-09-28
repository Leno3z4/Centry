import StructuredData, { webPageStructuredData } from '../../../components/StructuredData';

export const metadata = {
  title: 'Swap',
  description: 'Swap supported assets on Arc through Centry.',
  alternates: {
    canonical: '/app/swap',
  },
};

export default function SwapLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app/swap',
          name: 'Centry Swap',
          description: metadata.description,
        })}
      />
      {children}
    </>
  );
}
