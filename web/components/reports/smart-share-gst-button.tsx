"use client";

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';

interface SmartShareGSTButtonProps {
    sales: any[];
    hsnData: any[];
    summary: {
        totalTaxable: number;
        totalIgst: number;
        totalCgst: number;
        totalSgst: number;
        totalTax: number;
        b2bCount: number;
        b2cCount: number;
    };
    dateRange: { from: Date; to: Date };
    organizationName?: string;
    branding?: any;
}

export default function SmartShareGSTButton({
    sales,
    hsnData,
    summary,
    dateRange,
    organizationName,
    branding,
}: SmartShareGSTButtonProps) {
    const [isGenerating, setIsGenerating] = useState(false);

    const fromStr = dateRange.from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const toStr = dateRange.to.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const filename = `GSTR1_Report_${fromStr.replace(/\s/g, '_')}_to_${toStr.replace(/\s/g, '_')}.pdf`;

    const handleShare = async () => {
        if (isGenerating) return;
        if (!sales || sales.length === 0) {
            alert("No GST data available to share.");
            return;
        }

        try {
            setIsGenerating(true);

            const { generateGSTPDF } = await import('@/lib/generate-gst-pdf');
            const { shareBlob } = await import('@/lib/capacitor-share');
            const blob = await generateGSTPDF({
                sales,
                hsnData,
                summary,
                dateRange: { from: fromStr, to: toStr },
                organizationName,
                branding,
            });

            const text = `*GST Report from ${organizationName || 'MandiGrow'}*\n` +
                `Period: ${fromStr} to ${toStr}\n` +
                `Total Tax: Rs.${summary.totalTax.toLocaleString('en-IN')}\n` +
                `B2B: ${summary.b2bCount} | B2C: ${summary.b2cCount}`;
            await shareBlob(blob, filename, { title: `GST Report - ${organizationName || 'MandiGrow'}`, text });
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            console.error('[SmartShareGST] failed:', err);
            alert(`Failed to generate report: ${err?.message || err}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Button
            onClick={handleShare}
            disabled={isGenerating || !sales || sales.length === 0}
            className="bg-white border border-emerald-100 hover:bg-emerald-50 text-emerald-700 font-bold gap-2 min-w-[140px] shadow-sm rounded-xl transition-all active:scale-95 h-12 px-6"
        >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            {isGenerating ? 'Generating...' : 'Share PDF'}
        </Button>
    );
}
