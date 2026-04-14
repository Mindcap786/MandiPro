// Client component reads `id` at runtime via useParams() — no static pregeneration needed.
// Keep one stub param so the static build doesn't exclude this route entirely.
export async function generateStaticParams() {
    return [{ id: 'preview' }];
}

import SaleInvoicePage from './PageClient';

export default function InvoicePage() {
    return <SaleInvoicePage />;
}
