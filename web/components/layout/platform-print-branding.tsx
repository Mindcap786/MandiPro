'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface BrandingSettings {
    document_footer_powered_by_text: string;
    document_footer_presented_by_text: string;
    document_footer_developed_by_text: string;
    watermark_text: string;
    is_watermark_enabled: boolean;
}

export function PlatformPrintBranding() {
    const [settings, setSettings] = useState<BrandingSettings | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        const { data, error } = await supabase
            .schema('core')
            .from('platform_branding_settings')
            .select('*')
            .maybeSingle();

        if (data && !error) {
            setSettings(data);
        }
    };

    if (!settings) return null;

    return (
        <div className="hidden print:block pointer-events-none z-[9999]" aria-hidden="true">
            {/* Watermark Support (Future Ready) */}
            {settings.is_watermark_enabled && (
                <div className="fixed inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none">
                    <span className="text-[120px] font-black uppercase tracking-tighter text-slate-900 rotate-[-30deg] whitespace-nowrap">
                        {settings.watermark_text}
                    </span>
                </div>
            )}

            {/* Absolute Footer Attribution */}
            <div className="fixed bottom-0 left-0 right-0 w-full flex justify-between items-end text-[8px] font-bold text-slate-400 uppercase tracking-widest px-8 pb-4 pt-4 border-t border-slate-200 mt-12 bg-white break-inside-avoid">
                <div className="flex flex-col gap-1 text-left">
                    <span>{settings.document_footer_presented_by_text}</span>
                </div>
                
                <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-800 tracking-tight">{settings.document_footer_powered_by_text}</span>
                </div>

                <div className="flex flex-col gap-1 text-right">
                    <span>{settings.document_footer_developed_by_text}</span>
                </div>
            </div>

            {/* Print specific CSS fix to ensure the fixed element doesn't overlap text on multi-page outputs */}
            <style jsx global>{`
                @media print {
                    @page {
                        margin-bottom: 25mm;
                    }
                }
            `}</style>
        </div>
    );
}
