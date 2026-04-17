"use client";

import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

export default function SuspendedPage() {
    const { signOut } = useAuth();

    return (
        <div className="flex h-screen flex-col items-center justify-center bg-[#050510] text-white p-6 text-center">
            <div className="relative mb-8">
                <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full animate-pulse" />
                <ShieldAlert className="w-24 h-24 text-red-500 relative z-10" />
            </div>

            <h1 className="text-5xl font-black tracking-tighter mb-4 italic uppercase">Mandi Suspended</h1>
            <p className="text-gray-400 max-w-md text-lg font-medium">
                Your organization's access to MandiOS has been temporarily restricted due to non-payment or policy violations.
            </p>

            <div className="mt-12 p-6 glass-panel border-red-500/20 rounded-2xl max-w-sm">
                <p className="text-xs text-gray-500 uppercase font-black tracking-widest mb-4">Immediate Actions</p>
                <div className="space-y-4">
                    <Button
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold"
                        onClick={() => window.open('mailto:support@mandios.com')}
                    >
                        Contact Billing Support
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full text-gray-500 hover:text-white"
                        onClick={() => signOut()}
                    >
                        <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </Button>
                </div>
            </div>

            <p className="mt-12 text-[10px] text-gray-700 uppercase font-black tracking-[0.3em]">
                Reference Code: ORG_SUSPENDED_ERR_V2
            </p>
        </div>
    );
}
