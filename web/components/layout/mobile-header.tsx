"use client";

import { usePermission } from "@/hooks/use-permission";
import { ShieldCheck, Bell, User, Menu as MenuIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";

export function MobileHeader() {
    const { profile, isImpersonating } = usePermission();
    const [isImpersonatingState, setIsImpersonatingState] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        setIsImpersonatingState(localStorage.getItem('mandi_impersonation_mode') === 'true');
    }, []);

    const handleExitImpersonation = async () => {
        const restoreSession = localStorage.getItem('mandi_admin_restore_session');
        localStorage.removeItem('mandi_impersonation_mode');
        localStorage.removeItem('mandi_admin_restore_session');
        if (restoreSession) {
            try {
                const { access_token, refresh_token } = JSON.parse(restoreSession);
                await supabase.auth.setSession({ access_token, refresh_token });
                window.location.href = '/admin';
            } catch (e) {
                window.location.href = '/login';
            }
        } else {
            window.location.href = '/login';
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#050510]/95 backdrop-blur-xl border-b border-white/5 pt-safe px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                    <SheetTrigger asChild>
                        <button
                            type="button"
                            aria-label="Open menu"
                            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform flex-shrink-0"
                        >
                            <MenuIcon className="w-5 h-5" />
                        </button>
                    </SheetTrigger>
                    <SheetContent
                        side="left"
                        className="!z-[200] p-0 w-[86vw] max-w-[340px] border-r-0 overflow-y-auto bg-[#E9F5D1]"
                        onClick={(e) => {
                            if ((e.target as HTMLElement).closest('a')) setMenuOpen(false);
                        }}
                    >
                        <Sidebar />
                    </SheetContent>
                </Sheet>
                <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] leading-none mb-0.5">
                        MandiGrow
                    </span>
                    <h1 className="text-base font-black text-white tracking-tight leading-none truncate">
                        {profile?.organization?.name || "MandiGrow"}
                    </h1>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {isImpersonating && (
                    <button
                        onClick={handleExitImpersonation}
                        className="bg-amber-500 text-black p-2 rounded-full shadow-lg shadow-amber-500/20"
                    >
                        <ShieldCheck className="w-4 h-4" />
                    </button>
                )}
                <button className="text-gray-400 hover:text-white transition-colors relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-[#050510]" />
                </button>
                <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-400" />
                </div>
            </div>
        </header>
    );
}
