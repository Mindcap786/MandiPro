import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import DownloadInvoiceButton from '@/components/billing/download-invoice-button';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default async function PublicInvoicePage({ params }: { params: { id: string } }) {

    const { id } = params;

    // Initialize admin client inside the request scope to ensure env vars are fresh
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );

    // 1. Fetch Sale Data with Joins (Native Postgres Joins via Supabase)
    const { data: sale, error: saleError } = await supabaseAdmin
        .schema('mandi')
        .from('sales')
        .select(`
            *,
            contact:contacts(*),
            sale_items(id, sale_id, lot_id, quantity, rate, total_price, qty, amount, unit, item_id, gst_rate, tax_amount, hsn_code, lot:lots(*, item:commodities(*))),
            vouchers(*)
        `)
        .eq('id', id)
        .maybeSingle();

    if (saleError || !sale) {
        console.error('[PublicInvoice] Error fetching sale:', saleError || 'Sale not found');
        return notFound();
    }

    // 2. Fetch Organization Data
    const { data: organization } = await supabaseAdmin
        .schema('core')
        .from('organizations')
        .select('*')
        .eq('id', sale.organization_id)
        .maybeSingle();

    // 3. Fetch Mandi Settings (Payment Info)
    const { data: mandiSettings } = await supabaseAdmin
        .schema('mandi')
        .from('mandi_settings')
        .select('*')
        .eq('organization_id', sale.organization_id)
        .maybeSingle();

    // 4. Branding Settings (Optional)
    const { data: branding } = await supabaseAdmin
        .schema('core')
        .from('platform_branding_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

    const orgData = {
        ...organization,
        settings: {
            payment: mandiSettings 
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 selection:bg-blue-100 print:bg-white print:p-0">
            <div className="max-w-4xl mx-auto space-y-8 print:max-w-none print:space-y-0">
                {/* Header Actions (Hidden when printing) */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-700 print:hidden">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight italic uppercase">Mandi<span className="text-blue-600">Grow</span> Invoice</h1>
                        <p className="text-slate-500 font-medium tracking-wide">#{sale.contact_bill_no || sale.bill_no} • {new Date(sale.sale_date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-white rounded-full shadow-lg border border-slate-200 overflow-hidden flex items-center p-1">
                            <DownloadInvoiceButton sale={sale} organization={orgData} />
                        </div>
                    </div>
                </div>

                {/* The "Paper" Invoice Preview (Web View) */}
                <div className="bg-white shadow-2xl rounded-[32px] overflow-hidden border border-slate-200 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150 print:shadow-none print:border-0 print:rounded-none">
                    <div className="p-8 md:p-16 print:p-4">
                        {/* Summary Header */}
                        <div className="flex justify-between items-start mb-16 print:mb-8">
                            <div className="space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 print:text-slate-500">Billed From</span>
                                <h2 className="text-3xl font-black text-slate-900 border-b-4 border-blue-600 pb-1 print:border-slate-900 print:text-2xl">{organization?.name}</h2>
                                <div className="text-sm text-slate-500 font-medium leading-relaxed max-w-[240px]">
                                    {organization?.address_line1 && <div>{organization.address_line1}</div>}
                                    {organization?.address_line2 && <div>{organization.address_line2}</div>}
                                    <div>{organization?.city}, {organization?.state}</div>
                                    {organization?.gstin && <div className="mt-2 font-black text-slate-900">GST: {organization.gstin}</div>}
                                </div>
                            </div>
                            <div className="text-right space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 print:text-slate-500">Billed To</span>
                                <h3 className="text-3xl font-black text-slate-900 print:text-2xl">{sale.contact?.name}</h3>
                                <div className="text-sm text-slate-500 font-medium">
                                    {sale.contact?.city}
                                    {sale.contact?.gstin && <div className="mt-2 text-[11px] font-black text-slate-900 uppercase">GSTIN: {sale.contact.gstin}</div>}
                                </div>
                            </div>
                        </div>

                        {/* Items Table (Web Version) */}
                        <div className="overflow-x-auto mb-16 print:mb-8">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b-2 border-slate-900 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                        <th className="py-5">Item Details</th>
                                        <th className="py-5 text-right">Qty</th>
                                        <th className="py-5 text-right pr-6">Rate</th>
                                        <th className="py-5 text-right w-[150px]">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sale.sale_items?.map((item: any, i: number) => (
                                        <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="py-8">
                                                <div className="font-black text-slate-900 uppercase text-lg tracking-tight leading-none">{item.lot?.item?.name || item.item_name}</div>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">{item.lot?.lot_code}</span>
                                                </div>
                                            </td>
                                            <td className="py-8 text-right font-black text-slate-800 text-lg">
                                                {item.qty} <span className="text-[10px] text-slate-400 ml-1 uppercase font-black">{item.unit || 'Unit'}</span>
                                            </td>
                                            <td className="py-8 text-right font-bold text-slate-500 pr-6">₹{Number(item.rate).toLocaleString()}</td>
                                            <td className="py-8 text-right font-black text-slate-900 text-xl tracking-tighter">₹{Math.round(Number(item.amount)).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Section */}
                        <div className="flex flex-col md:flex-row justify-between gap-12 pt-12 border-t-2 border-slate-900">
                            <div className="flex-1 space-y-6">
                                <div className="bg-slate-50 p-8 rounded-[24px] border border-slate-100 print:bg-white print:border-slate-200">
                                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 mb-6">Payment Overview</h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="font-bold text-slate-500">Subtotal</span>
                                            <span className="font-black text-slate-900 tracking-tight">₹{Number(sale.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        {Number(sale.market_fee) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-bold text-slate-500">Market Fee</span>
                                                <span className="font-bold text-slate-900">₹{Number(sale.market_fee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                        {Number(sale.nirashrit) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-bold text-slate-500">Nirashrit Code</span>
                                                <span className="font-bold text-slate-900">₹{Number(sale.nirashrit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                        {Number(sale.gst_total) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-bold text-blue-600">GST (Total Tax)</span>
                                                <span className="font-black text-blue-700">₹{Number(sale.gst_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                        <div className="pt-6 border-t border-slate-200 flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <span className="font-black text-slate-900 uppercase text-xs tracking-widest">Grand Total</span>
                                                <span className="text-[10px] font-bold text-slate-400 italic">Incl. all taxes & fees</span>
                                            </div>
                                            <span className="text-4xl font-black text-blue-600 tracking-tighter print:text-2xl">₹{Number(sale.total_amount_inc_tax || sale.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="px-4">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em] italic">1. Goods once sold will not be taken back.</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em] italic">2. Subject to {organization?.city || 'Local'} Jurisdiction.</p>
                                </div>
                            </div>
                            
                            <div className="w-full md:w-80 text-center md:text-right flex flex-col justify-between items-center md:items-end p-2">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">Digitally Signed By</div>
                                    <div className="font-black text-slate-900 uppercase text-xl leading-none">{organization?.name}</div>
                                    <div className="text-[#059669] font-black text-[9px] uppercase tracking-widest flex items-center justify-end gap-1.5 mt-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse"></div>
                                        Verified MandiGrow ERP Merchant
                                    </div>
                                </div>
                                
                                <div className="mt-12 md:mt-0">
                                    <div className="w-32 h-32 border-4 border-slate-100 rounded-[20px] bg-slate-50 flex items-center justify-center relative group p-2">
                                        <div className="absolute inset-0 bg-[#059669] opacity-0 group-hover:opacity-5 transition-opacity rounded-[16px]"></div>
                                        <div className="text-[10px] font-black text-slate-300 uppercase rotate-45 select-none">Auth Stamp</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Attribution */}
                <div className="text-center space-y-4 opacity-50 hover:opacity-100 transition-opacity pb-20 print:hidden">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] selection:text-blue-500 cursor-default">Powered by MandiGrow OS Enterprise</p>
                    <div className="flex items-center justify-center gap-6 text-[10px] font-bold text-slate-400">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                            <span>SOC-2 TYPE II AUDITED</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                            <span>BANK-GRADE 256-BIT AES</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                            <span>MINDT CORPORATION</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
