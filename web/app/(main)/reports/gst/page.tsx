"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
    Download,
    FileText,
    Filter,
    Search,
    IndianRupee,
    Calendar as CalendarIcon,
    PieChart,
    Building2,
    CheckCircle2
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";
import SmartShareGSTButton from "@/components/reports/smart-share-gst-button";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

export default function GSTReportsPage() {
    const { profile } = useAuth();
    const { branding } = usePlatformBranding();

    // Pre-load from cache for instant render on re-navigation
    const orgId = profile?.organization_id;
    const dateKey = `${format(startOfMonth(new Date()), 'yyyyMMdd')}_${format(endOfMonth(new Date()), 'yyyyMMdd')}`;
    const cachedData = orgId ? cacheGet<any>(`gst_report_${dateKey}`, orgId) : null;

    const [sales, setSales] = useState<any[]>(cachedData?.sales || []);
    const [hsnData, setHsnData] = useState<any[]>(cachedData?.hsnData || []);
    const [loading, setLoading] = useState(!cachedData);
    const [searchTerm, setSearchTerm] = useState("");
    const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });

    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

    const [summary, setSummary] = useState(cachedData?.summary || {
        totalTaxable: 0,
        totalIgst: 0,
        totalCgst: 0,
        totalSgst: 0,
        totalTax: 0,
        b2bCount: 0,
        b2cCount: 0
    });

    useEffect(() => {
        if (profile?.organization_id) {
            fetchGstData();
        }
    }, [profile, dateRange]);

    const fetchGstData = async () => {
        if (sales.length === 0) setLoading(true);
        try {
            // Fetch Outward Supplies (Sales/Invoices) with Items for HSN
            const { data, error } = await supabase
                .schema('mandi')
                .from('sales')
                .select(`
                    *,
                    contact:contacts(name),
                    sale_items(*)
                `)
                .eq('organization_id', profile?.organization_id)
                .gte('sale_date', dateRange.from.toISOString().split('T')[0])
                .lte('sale_date', dateRange.to.toISOString().split('T')[0])
                .or('status.is.null,status.neq.Cancelled')
                .order('sale_date', { ascending: false });

            if (error) throw error;

            if (data) {
                setSales(data);

                // Calculate Summary and HSN Grouping
                let taxable = 0;
                let igst = 0;
                let cgst = 0;
                let sgst = 0;
                let b2b = 0;
                let b2c = 0;
                
                const hsnMap: Record<string, any> = {};

                data.forEach(sale => {
                    const buyerGstin = sale.buyer_gstin || sale.contact?.gstin;
                    if (buyerGstin) b2b++; else b2c++;

                    // Item level aggregation for HSN summary
                    sale.sale_items?.forEach((item: any) => {
                        const hsn = item.hsn_code || "N/A";
                        const rate = Number(item.gst_rate) || 0;
                        const key = `${hsn}_${rate}`;

                        if (!hsnMap[key]) {
                            hsnMap[key] = {
                                hsn_code: hsn,
                                gst_rate: rate,
                                quantity: 0,
                                unit: item.unit || 'PCS',
                                taxable_value: 0,
                                igst: 0,
                                cgst: 0,
                                sgst: 0,
                                total_tax: 0
                            };
                        }

                        const itemTaxable = Number(item.amount || item.total_price) || 0;
                        const itemTax = Number(item.tax_amount) || 0;

                        hsnMap[key].quantity += Number(item.qty || item.quantity) || 0;
                        hsnMap[key].taxable_value += itemTaxable;
                        hsnMap[key].total_tax += itemTax;

                        // Split tax based on sale type
                        if (Number(sale.igst_amount) > 0) {
                            hsnMap[key].igst += itemTax;
                        } else {
                            hsnMap[key].cgst += itemTax / 2;
                            hsnMap[key].sgst += itemTax / 2;
                        }

                        taxable += itemTaxable;
                        igst += (Number(sale.igst_amount) > 0 ? itemTax : 0);
                        cgst += (Number(sale.igst_amount) > 0 ? 0 : itemTax / 2);
                        sgst += (Number(sale.igst_amount) > 0 ? 0 : itemTax / 2);
                    });
                });

                const newSummary = {
                    totalTaxable: taxable,
                    totalIgst: igst,
                    totalCgst: cgst,
                    totalSgst: sgst,
                    totalTax: igst + cgst + sgst,
                    b2bCount: b2b,
                    b2cCount: b2c
                };
                
                const hsnList = Object.values(hsnMap);
                setHsnData(hsnList);
                setSummary(newSummary);
                
                if (orgId) {
                    cacheSet(`gst_report_${dateKey}`, orgId, { sales: data, hsnData: hsnList, summary: newSummary });
                }
            }
        } catch (e) {
            console.error("Failed to fetch GST data", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (sales.length === 0) return;

        const q = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const fmt2 = (n: number) => Number(n || 0).toFixed(2);

        const lines: string[] = [];

        // ── Section 4: B2B Invoices ──────────────────────────────────────────
        const b2bSales = sales.filter(s => s.buyer_gstin || s.contact?.gstin);
        lines.push(
            "Section 4 - B2B Invoices",
            [
                "GSTIN/UIN of Recipient",
                "Receiver Name",
                "Invoice Number",
                "Invoice Date (DD-MMM-YYYY)",
                "Invoice Value",
                "Place Of Supply",
                "Reverse Charge",
                "Applicable % of Tax Rate",
                "Invoice Type",
                "E-Commerce GSTIN",
                "Rate",
                "Taxable Value",
                "Integrated Tax Amount",
                "Central Tax Amount",
                "State/UT Tax Amount",
                "Cess Amount"
            ].map(q).join(",")
        );
        b2bSales.forEach(s => {
            const dt = s.sale_date ? new Date(s.sale_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") : "";
            const invType = s.buyer_gstin ? "Regular B2B" : "Regular B2C";
            lines.push([
                q(s.buyer_gstin || s.contact?.gstin || ""), q(s.contact?.name || ""),
                q(s.contact_bill_no ?? s.bill_no ?? ""), q(dt),
                q(fmt2(s.total_amount_inc_tax || s.total_amount || 0)),
                q(s.place_of_supply || ""), q("N"), q(""), q(invType), q(""),
                q(fmt2(s.sale_items?.[0]?.gst_rate || 0)),
                q(fmt2(s.total_amount || 0)),
                q(fmt2(s.igst_amount || 0)), q(fmt2(s.cgst_amount || 0)), q(fmt2(s.sgst_amount || 0)), q("0.00")
            ].join(","));
        });
        lines.push(""); // blank row separator

        // ── Section 7: B2C Invoices ──────────────────────────────────────────
        const b2cSales = sales.filter(s => !s.buyer_gstin && !s.contact?.gstin);
        lines.push(
            "Section 7 - B2C Large Invoices",
            [
                "Type", "Place Of Supply", "Applicable % of Tax Rate",
                "Rate", "Taxable Value", "Integrated Tax Amount",
                "Central Tax Amount", "State/UT Tax Amount", "Cess Amount",
                "E-Commerce GSTIN"
            ].map(q).join(",")
        );
        b2cSales.forEach(s => {
            lines.push([
                q("OE"), q(s.place_of_supply || ""),  q(""),
                q(fmt2(s.sale_items?.[0]?.gst_rate || 0)),
                q(fmt2(s.total_amount || 0)),
                q(fmt2(s.igst_amount || 0)), q(fmt2(s.cgst_amount || 0)), q(fmt2(s.sgst_amount || 0)),
                q("0.00"), q("")
            ].join(","));
        });
        lines.push("");

        // ── Section 12: HSN Summary ──────────────────────────────────────────
        lines.push(
            "Section 12 - HSN-wise Summary of Outward Supplies",
            [
                "HSN", "Description", "UQC", "Total Quantity",
                "Total Value", "Taxable Value", "Integrated Tax Amount",
                "Central Tax Amount", "State/UT Tax Amount", "Cess Amount"
            ].map(q).join(",")
        );
        hsnData.forEach(h => {
            lines.push([
                q(h.hsn_code || h.hsn || ""), q(h.description || "Commodity Supply"),
                q(h.unit || "BOX"), q(fmt2(h.quantity || 0)),
                q(fmt2(h.taxable_value || h.taxable || 0)),
                q(fmt2(h.taxable_value || h.taxable || 0)),
                q(fmt2(h.igst || 0)), q(fmt2(h.cgst || 0)), q(fmt2(h.sgst || 0)), q("0.00")
            ].join(","));
        });

        // UTF-8 BOM (\uFEFF) ensures Excel auto-detects encoding on Windows
        const csvContent = "\uFEFF" + lines.join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);

        return () => URL.revokeObjectURL(url);
    }, [sales, hsnData]);

    const filteredSales = sales.filter(s => 
        String(s.bill_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.contact?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(s.buyer_gstin || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 md:p-10 space-y-8 pb-32">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        GST Compliance Dashboard 🇮🇳
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Audit-ready GSTR-1 and GSTR-3B summaries.</p>
                </div>

                <div className="flex items-center gap-3">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="font-semibold shadow-sm rounded-xl border-slate-200">
                                <CalendarIcon className="w-4 h-4 mr-2" />
                                {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="range"
                                selected={{ from: dateRange.from, to: dateRange.to }}
                                onSelect={(range) => {
                                    if (range?.from && range?.to) {
                                        setDateRange({ from: range.from, to: range.to });
                                    }
                                }}
                                numberOfMonths={2}
                            />
                        </PopoverContent>
                    </Popover>

                    <SmartShareGSTButton
                        sales={sales}
                        hsnData={hsnData}
                        summary={summary}
                        dateRange={dateRange}
                        organizationName={profile?.organization?.name}
                        branding={branding}
                    />

                    {downloadUrl ? (
                        <a
                            href={downloadUrl}
                            download={`GSTR1_Report_${format(dateRange.from, "MMM_yyyy")}.csv`}
                            className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md h-12 px-6 no-underline"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                        </a>
                    ) : (
                        <Button disabled className="bg-slate-200 text-slate-400 font-bold rounded-xl h-12 px-6">
                            Generating...
                        </Button>
                    )}
                </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="rounded-3xl border-slate-200 shadow-xl bg-slate-900 text-white">
                    <CardContent className="p-8">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-2">Liability Summary</p>
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-3xl font-[1000] tracking-tighter">₹{summary.totalTax.toLocaleString('en-IN')}</p>
                                <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Ready to File
                                </p>
                            </div>
                            <PieChart className="w-10 h-10 opacity-20" />
                        </div>
                    </CardContent>
                </Card>

                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="rounded-3xl border-slate-200 shadow-sm">
                        <CardContent className="p-6">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxable Value</p>
                            <p className="text-2xl font-black text-slate-800">₹{summary.totalTaxable.toLocaleString('en-IN')}</p>
                            <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 w-[70%]" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-3xl border-slate-200 shadow-sm">
                        <CardContent className="p-6">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">IGST (Inter-State)</p>
                            <p className="text-2xl font-black text-indigo-600">₹{summary.totalIgst.toLocaleString('en-IN')}</p>
                            <p className="text-[10px] font-bold text-indigo-400 mt-2">External Supplies</p>
                        </CardContent>
                    </Card>
                    <Card className="rounded-3xl border-slate-200 shadow-sm">
                        <CardContent className="p-6">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">CGST / SGST (Intra)</p>
                            <p className="text-2xl font-black text-emerald-600">₹{(summary.totalCgst + summary.totalSgst).toLocaleString('en-IN')}</p>
                            <p className="text-[10px] font-bold text-emerald-400 mt-2">Local Consumption</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Main Content */}
            <Card className="rounded-[40px] border-slate-200 shadow-2xl overflow-hidden bg-white">
                <Tabs defaultValue="b2b" className="w-full">
                    <div className="px-10 py-8 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-6">
                        <TabsList className="bg-slate-100 p-1.5 rounded-2xl h-auto flex flex-wrap gap-1">
                            <TabsTrigger value="b2b" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 py-3 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600">
                                B2B Invoices ({summary.b2bCount})
                            </TabsTrigger>
                            <TabsTrigger value="b2c" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 py-3 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600">
                                B2C Invoices ({summary.b2cCount})
                            </TabsTrigger>
                            <TabsTrigger value="hsn" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 py-3 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600">
                                HSN Summary ({hsnData.length})
                            </TabsTrigger>
                            <TabsTrigger value="3b" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 py-3 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-rose-600">
                                GSTR-3B VIEW
                            </TabsTrigger>
                        </TabsList>

                        <div className="relative w-full lg:w-80">
                            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input 
                                placeholder="Filter by Party / GSTIN / Invoice..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-12 h-14 bg-slate-50 border-none rounded-2xl focus-visible:ring-2 focus-visible:ring-indigo-500 font-medium" 
                            />
                        </div>
                    </div>

                    <TabsContent value="b2b" className="p-0 m-0 border-none outline-none">
                        <div className="overflow-x-auto p-4">
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest pl-6">GSTIN of Recipient</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">Party Name</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">Invoice Details</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">Place of Supply</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest text-right">Taxable Val</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest text-right pr-6">GST Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredSales.filter(s => s.buyer_gstin || s.contact?.gstin).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-20">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                                                        <FileText className="w-8 h-8 text-slate-300" />
                                                    </div>
                                                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No B2b Records Found</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredSales.filter(s => s.buyer_gstin || s.contact?.gstin).map((sale) => (
                                            <TableRow key={sale.id} className="hover:bg-indigo-50/30 transition-colors border-slate-50">
                                                <TableCell className="font-bold text-slate-900 pl-6 uppercase">{sale.buyer_gstin || sale.contact?.gstin}</TableCell>
                                                <TableCell className="font-bold text-slate-700">{sale.contact?.name}</TableCell>
                                                <TableCell className="space-y-1">
                                                    <p className="font-black text-xs text-slate-900 tracking-tight">{sale.bill_no}</p>
                                                    <p className="text-[10px] font-bold text-slate-400">{format(new Date(sale.sale_date), 'dd MMM yyyy')}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-none px-3 py-1 rounded-lg font-black uppercase text-[9px]">
                                                        {sale.place_of_supply || 'INTRA-STATE'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-black text-slate-900 text-lg tracking-tighter">₹{Number(sale.total_amount).toLocaleString('en-IN')}</TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <p className="font-bold text-indigo-600">₹{(Number(sale.igst_amount || 0) + Number(sale.cgst_amount || 0) + Number(sale.sgst_amount || 0)).toLocaleString('en-IN')}</p>
                                                    <p className="text-[8px] font-black uppercase tracking-tighter text-slate-400">
                                                        {Number(sale.igst_amount) > 0 ? "IGST (Inter)" : "CGST+SGST (Local)"}
                                                    </p>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="b2c" className="p-0 m-0 border-none outline-none">
                        <div className="overflow-x-auto p-4">
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest pl-6">Supply Type</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">Party Info</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">Invoice</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest text-right">Taxable Val</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest text-right pr-6">Tax Collected</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredSales.filter(s => !s.buyer_gstin && !s.contact?.gstin).map((sale) => (
                                        <TableRow key={sale.id} className="hover:bg-emerald-50/30 transition-colors border-slate-50">
                                            <TableCell className="pl-6">
                                                <Badge className="bg-emerald-50 text-emerald-700 font-black uppercase text-[9px] border-none">CONSUMER</Badge>
                                            </TableCell>
                                            <TableCell className="font-bold text-slate-700">{sale.contact?.name || "Cash Customer"}</TableCell>
                                            <TableCell className="font-black text-xs text-slate-900">{sale.bill_no}</TableCell>
                                            <TableCell className="text-right font-black text-slate-900">₹{Number(sale.total_amount).toLocaleString('en-IN')}</TableCell>
                                            <TableCell className="text-right pr-6 font-bold text-emerald-600">
                                                ₹{(Number(sale.igst_amount || 0) + Number(sale.cgst_amount || 0) + Number(sale.sgst_amount || 0)).toLocaleString('en-IN')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="hsn" className="p-0 m-0 border-none outline-none">
                        <div className="overflow-x-auto p-4">
                            <div className="bg-amber-50 p-4 rounded-2xl mx-6 mb-4 flex items-center gap-3 border border-amber-100">
                                <div className="bg-amber-500 p-2 rounded-xl text-white">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-amber-900">GSTR-1 Table 12: HSN-wise Summary</p>
                                    <p className="text-[10px] font-bold text-amber-700">Required for filing inward and outward supplies.</p>
                                </div>
                            </div>
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest pl-8">HSN Code</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">Description</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">GST Rate</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">UOM</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest">Quantity</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest text-right">Taxable Val</TableHead>
                                        <TableHead className="font-black text-slate-400 h-14 uppercase text-[10px] tracking-widest text-right pr-8">Integrated Tax</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {hsnData.map((hsn, idx) => (
                                        <TableRow key={idx} className="hover:bg-slate-50 transition-colors border-slate-50">
                                            <TableCell className="pl-8 font-black text-slate-900 text-lg tracking-tight">{hsn.hsn_code}</TableCell>
                                            <TableCell className="font-bold text-slate-500 uppercase text-[10px]">Supply of Goods</TableCell>
                                            <TableCell>
                                                <Badge className="bg-slate-900 text-white border-none rounded-lg font-black">{hsn.gst_rate}%</Badge>
                                            </TableCell>
                                            <TableCell className="font-black text-slate-400 text-xs">{hsn.unit}</TableCell>
                                            <TableCell className="font-black text-slate-800">{hsn.quantity.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-black text-slate-900">₹{hsn.taxable_value.toLocaleString('en-IN')}</TableCell>
                                            <TableCell className="text-right pr-8 font-bold text-indigo-600">₹{hsn.total_tax.toLocaleString('en-IN')}</TableCell>
                                        </TableRow>
                                    ))}
                                    {hsnData.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-20 text-slate-300 uppercase font-black text-xs tracking-widest">
                                                No HSN data found for this period
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="3b" className="p-10 space-y-8 animate-in fade-in duration-500">
                        <div className="max-w-4xl mx-auto space-y-8">
                            <div className="flex items-center gap-4 border-b-2 border-rose-100 pb-4">
                                <Building2 className="w-10 h-10 text-rose-500" />
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">GSTR-3B Summary View</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Values for Section 3.1 & 4</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h4 className="font-black text-slate-900 uppercase tracking-[0.2em] text-xs underline underline-offset-8">3.1 Outward Taxable Supplies</h4>
                                    
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center p-6 bg-slate-50 rounded-[24px] border border-slate-100">
                                            <span className="font-bold text-slate-600">Total Taxable Value</span>
                                            <span className="font-black text-xl text-slate-900">₹{summary.totalTaxable.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between items-center p-6 bg-indigo-50/50 rounded-[24px] border border-indigo-100">
                                            <span className="font-bold text-indigo-700">Integrated Tax (IGST)</span>
                                            <span className="font-black text-xl text-indigo-700">₹{summary.totalIgst.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between items-center p-6 bg-emerald-50/50 rounded-[24px] border border-emerald-100">
                                            <span className="font-bold text-emerald-700">Central Tax (CGST)</span>
                                            <span className="font-black text-xl text-emerald-700">₹{summary.totalCgst.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between items-center p-6 bg-amber-50/50 rounded-[24px] border border-amber-100">
                                            <span className="font-bold text-amber-700">State/UT Tax (SGST)</span>
                                            <span className="font-black text-xl text-amber-700">₹{summary.totalSgst.toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="relative group cursor-not-allowed opacity-60">
                                    <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-[32px]">
                                        <Badge className="bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest px-6 py-3 shadow-2xl">
                                            ITC Data Coming Soon
                                        </Badge>
                                    </div>
                                    <h4 className="font-black text-slate-400 uppercase tracking-[0.2em] text-xs underline underline-offset-8">4. Eligible ITC</h4>
                                    <div className="mt-6 space-y-4">
                                        <div className="h-20 w-full bg-slate-50 rounded-[24px] border border-dashed border-slate-200" />
                                        <div className="h-20 w-full bg-slate-50 rounded-[24px] border border-dashed border-slate-200" />
                                        <div className="h-20 w-full bg-slate-50 rounded-[24px] border border-dashed border-slate-200" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-rose-50 p-8 rounded-[32px] border border-rose-100 mt-10">
                                <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] mb-4 text-center">Final Filing Liability</p>
                                <div className="text-center">
                                    <p className="text-6xl font-[1000] text-rose-600 tracking-tighter">₹{summary.totalTax.toLocaleString('en-IN')}</p>
                                    <p className="text-xs font-black text-rose-400 mt-2 uppercase tracking-widest">Payable to Government (Outward)</p>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </Card>
        </div>
    );
}
