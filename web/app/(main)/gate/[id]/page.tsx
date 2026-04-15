// Server component wrapper — required for generateStaticParams with "use client" pages in Next.js 14 App Router
// The actual page content is in PageClient.tsx which uses React hooks
export async function generateMetadata({ params }: { params: { id: string } }) {
    return { title: `Gate Entry #${params.id} | MandiGrow` };
}

export const dynamic = 'force-dynamic';

import GateEntryDetailsPage from './PageClient';

export default function GateEntryPage() {
    return <GateEntryDetailsPage />;
}
