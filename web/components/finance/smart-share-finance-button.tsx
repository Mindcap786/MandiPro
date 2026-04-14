"use client";

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import { Loader2, Share2, Mail, MessageCircle, Download } from 'lucide-react';
import { supabase } from "@/lib/supabaseClient";
import { isNativePlatform } from '@/lib/capacitor-utils';

interface SmartShareFinanceButtonProps {
    orgId: string;
    filterType: string;
    subFilter: string;
    organizationName: string;
    branding?: any;
    searchQuery?: string;
}

export default function SmartShareFinanceButton({
    orgId,
    filterType,
    subFilter,
    organizationName,
    branding,
    searchQuery
}: SmartShareFinanceButtonProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const label = filterType === 'all' ? 'All_Parties' :
        filterType.charAt(0).toUpperCase() + filterType.slice(1) + 's';
    const filename = `${label}_Balances_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`;
    const shareTitle = `Financial Summary - ${organizationName}`;
    const shareText = `*Financial Summary from ${organizationName}*\nType: ${filterType.toUpperCase()}\nDate: ${new Date().toLocaleDateString('en-IN')}`;

    const fetchAndGenerate = async () => {
        let query = supabase
            .schema('mandi')
            .from('view_party_balances')
            .select('*')
            .eq('organization_id', orgId);

        if (filterType !== 'all') query = query.eq('contact_type', filterType);
        if (subFilter === 'receivable') query = query.gt('net_balance', 0);
        else if (subFilter === 'payable') query = query.lt('net_balance', 0);
        if (searchQuery) query = query.or(`contact_name.ilike.%${searchQuery}%,contact_city.ilike.%${searchQuery}%`);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("No data available for this report.");

        const { generateFinancePDF } = await import('@/lib/generate-finance-pdf');
        return generateFinancePDF(data, filterType, subFilter, organizationName, branding);
    };

    const handleNativeShare = async () => {
        if (loadingId) return;
        setLoadingId('native');
        try {
            const blob = await fetchAndGenerate();
            const { shareBlob } = await import('@/lib/capacitor-share');
            await shareBlob(blob, filename, { title: shareTitle, text: shareText });
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            console.error('[SmartShareFinance] native failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const handleWhatsApp = async () => {
        if (loadingId) return;
        setLoadingId('whatsapp');
        try {
            const blob = await fetchAndGenerate();
            const { shareToWhatsApp } = await import('@/lib/capacitor-share');
            await shareToWhatsApp(blob, filename, shareText);
        } catch (err: any) {
            console.error('[SmartShareFinance] WhatsApp failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const handleEmail = async () => {
        if (loadingId) return;
        setLoadingId('email');
        try {
            const blob = await fetchAndGenerate();
            const { downloadBlobSilent } = await import('@/lib/capacitor-share');
            // Trigger download in background — don't await so Mail opens immediately
            downloadBlobSilent(blob, filename);
            const subject = encodeURIComponent(shareTitle);
            const body = encodeURIComponent(
                `${shareText}\n\n` +
                `The report PDF (${filename}) has been saved to your Downloads folder.\n` +
                `Please attach it to this email before sending.`
            );
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
        } catch (err: any) {
            console.error('[SmartShareFinance] Email failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const handleDownload = async () => {
        if (loadingId) return;
        setLoadingId('download');
        try {
            const blob = await fetchAndGenerate();
            const { downloadBlob } = await import('@/lib/capacitor-share');
            await downloadBlob(blob, filename);
        } catch (err: any) {
            console.error('[SmartShareFinance] Download failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const isLoading = loadingId !== null;

    // Native Capacitor: single button → system share sheet
    if (isNativePlatform()) {
        return (
            <Button
                onClick={handleNativeShare}
                disabled={isLoading || !orgId}
                className="bg-white border border-emerald-100 hover:bg-emerald-50 text-[#0C831F] font-bold gap-2 min-w-[140px] shadow-sm rounded-xl transition-all active:scale-95"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                {isLoading ? 'Generating...' : 'Share Report'}
            </Button>
        );
    }

    // Web: dropdown shown immediately — no gesture timeout issue
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    disabled={isLoading || !orgId}
                    className="bg-white border border-emerald-100 hover:bg-emerald-50 text-[#0C831F] font-bold gap-2 min-w-[140px] shadow-sm rounded-xl transition-all active:scale-95"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                    {isLoading
                        ? (loadingId === 'whatsapp' ? 'Opening WhatsApp...'
                            : loadingId === 'email' ? 'Opening Mail...'
                            : loadingId === 'download' ? 'Downloading...'
                            : 'Generating...')
                        : 'Share Report'}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white shadow-xl rounded-xl border-slate-200">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400">Share Report</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="gap-2 cursor-pointer font-bold text-emerald-700 focus:bg-emerald-50"
                    onSelect={(e) => { e.preventDefault(); handleWhatsApp(); }}
                >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="gap-2 cursor-pointer font-bold text-blue-700 focus:bg-blue-50"
                    onSelect={(e) => { e.preventDefault(); handleEmail(); }}
                >
                    <Mail className="w-4 h-4" /> Email
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="gap-2 cursor-pointer font-bold text-slate-700 focus:bg-slate-50"
                    onSelect={(e) => { e.preventDefault(); handleDownload(); }}
                >
                    <Download className="w-4 h-4" /> Download PDF
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
