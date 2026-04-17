"use client";

import DayBook from "@/components/finance/day-book";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";
import { isNativePlatform } from "@/lib/capacitor-utils";

export default function DayBookPageClient() {
    const router = useRouter();

    if (isNativePlatform()) {
        return (
            <NativePageWrapper>
                <DayBook />
            </NativePageWrapper>
        );
    }

    return (
        <div className="p-8 space-y-8 min-h-screen bg-[#F8FAFC] pb-24 animate-in fade-in duration-700 relative overflow-hidden print:overflow-visible print:block print:p-0 print:bg-white print:m-0">
            {/* Global Print Overrides */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    /* Hide Sidebar and Header from main layout */
                    aside, nav, header, footer, .sidebar, .no-print {
                        display: none !important;
                    }
                    /* Ensure main content takes full width */
                    main, .main-content, #root {
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: block !important;
                    }
                    /* Remove background ornaments */
                    .bg-ornament {
                        display: none !important;
                    }
                }
            ` }} />

            {/* Super Premium Background Ornaments */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-ornament">
                <div className="absolute top-[5%] right-[-10%] w-[500px] h-[500px] bg-indigo-100/30 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] bg-blue-100/20 rounded-full blur-[100px]"></div>
            </div>

            <div className="relative z-10 flex items-center gap-4 print:hidden">
                <Button variant="ghost" className="text-slate-500 hover:text-slate-800 hover:bg-slate-200/50" onClick={() => router.back()}>
                    <ArrowLeft className="w-5 h-5 mr-2" /> Back
                </Button>
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Day Book</h1>
                    <p className="text-slate-500 text-sm font-bold opacity-80 italic">Daily transaction register and debit/credit inflow-outflow view.</p>
                </div>
            </div>

            <DayBook />
        </div>
    );
}

