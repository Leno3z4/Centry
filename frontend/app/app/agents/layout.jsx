import StructuredData, { webPageStructuredData } from '../../../components/StructuredData';

export const metadata = {
  title: 'Agents',
  description: 'Create and manage owner-controlled onchain agents with Centry smart accounts.',
  alternates: {
    canonical: '/app/agents',
  },
};

export default function AgentsLayout({ children }) {
  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url: 'https://centry.ink/app/agents',
          name: 'Centry Agents',
          description: metadata.description,
        })}
      />
      {children}
    </>
  );
}
