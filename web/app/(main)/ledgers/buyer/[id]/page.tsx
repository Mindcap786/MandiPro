// [native-patched]
// Server component wrapper — required for generateStaticParams with "use client" pages in Next.js 14 App Router
export const dynamic = 'force-dynamic';

import BuyerLedgerDetail from './PageClient';

export default function BuyerLedgerPage() {
    return <BuyerLedgerDetail />;
}
