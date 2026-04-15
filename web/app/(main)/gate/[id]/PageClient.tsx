"use client";
// Static export: client component — generateStaticParams is in layout.tsx



import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import {
    Truck,
    Calendar,
    Clock,
    User,
    Phone,
    MapPin,
    Package,
    ChevronLeft,
    Printer,
    CheckCircle2,
    AlertCircle,
    Activity,
    Hash,
    BadgeCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { motion } from "framer-motion";

export default function GateEntryDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const { profile } = useAuth();
    const [entry, setEntry] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id && profile?.organization_id) {
            fetchEntry();
        }
    }, [id, profile]);

    const fetchEntry = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .schema('mandi')
            .from('gate_entries')
            .select('*')
            .eq('id', id)
            .eq('organization_id', profile?.organization_id)
            .single();

        if (data) {
            setEntry(data);
        }
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
                />
            </div>
        );
    }

    if (!entry) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
                <AlertCircle className="w-16 h-16 text-rose-500" />
                <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Entry Not Found</h1>
                <Button onClick={() => router.back()} variant="outline" className="rounded-xl">Go Back</Button>
            </div>
        );
    }

    const getStatusColor = (status: string) => {
        const colors: any = {
            'pending': 'bg-amber-100 text-amber-700 border-amber-200',
            'arrived': 'bg-emerald-100 text-emerald-700 border-emerald-200',
            'stock_loaded': 'bg-blue-100 text-blue-700 border-blue-200',
            'completed': 'bg-slate-100 text-slate-700 border-slate-200',
            'cancelled': 'bg-rose-100 text-rose-700 border-rose-200'
        };
        return colors[status] || 'bg-slate-100 text-slate-500 border-slate-200';
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header Actions */}
                <div className="flex justify-between items-center">
                    <Button
                        variant="ghost"
                        onClick={() => router.back()}
                        className="rounded-xl hover:bg-white hover:shadow-sm text-slate-600 font-bold gap-2"
                    >
                        <ChevronLeft className="w-5 h-5" /> Back to Gate
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => window.print()}
                            className="rounded-xl bg-white border-slate-200 font-bold gap-2"
                        >
                            <Printer className="w-4 h-4" /> Print Token
                        </Button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left Column: Basic Info */}
                    <div className="md:col-span-2 space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <Card className="border-none shadow-2xl shadow-slate-200/50 rounded-[2rem] overflow-hidden bg-white">
                                <CardHeader className="bg-emerald-600 p-8 text-white relative">
                                    <div className="relative z-10 space-y-2">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-white/20 backdrop-blur-md p-2 rounded-xl">
                                                <Truck className="w-8 h-8 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-emerald-100 text-xs font-black uppercase tracking-[0.2em]">Gate Entry Token</p>
                                                <h1 className="text-4xl font-black tracking-tighter uppercase">#{entry.token_no}</h1>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Abstract Design Elements */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
                                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-400/20 rounded-full -ml-12 -mb-12 blur-2xl" />
                                </CardHeader>
                                <CardContent className="p-8 space-y-8">
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                <Hash className="w-3 h-3" /> Vehicle Number
                                            </p>
                                            <p className="text-2xl font-black text-slate-800 uppercase tracking-tight">{entry.vehicle_no}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                <Activity className="w-3 h-3" /> Status
                                            </p>
                                            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase border ${getStatusColor(entry.status)}`}>
                                                <div className="w-1.5 h-1.5 rounded-full bg-current mr-2 animate-pulse" />
                                                {entry.status.replace('_', ' ')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-slate-100 w-full" />

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <User className="w-5 h-5 text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver Name</p>
                                                <p className="font-bold text-slate-900">{entry.driver_name || 'Not Provided'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <Phone className="w-5 h-5 text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Number</p>
                                                <p className="font-bold text-slate-900">{entry.driver_phone || 'Not Provided'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <Package className="w-5 h-5 text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commodity</p>
                                                <p className="font-bold text-slate-900">{entry.commodity || 'General Goods'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <MapPin className="w-5 h-5 text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coming From</p>
                                                <p className="font-bold text-slate-900">{entry.source || 'Local Source'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Right Column: Timeline & Metadata */}
                    <div className="space-y-6">
                        <Card className="border-none shadow-xl shadow-slate-200/30 rounded-[2rem] bg-white overflow-hidden">
                            <CardHeader className="bg-slate-50 border-b border-slate-100">
                                <CardTitle className="text-sm font-black text-slate-400 uppercase tracking-widest">Audit Logs</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="space-y-6">
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border-2 border-white shadow-sm ring-4 ring-emerald-50">
                                                <CheckCircle2 className="w-4 h-4" />
                                            </div>
                                            <div className="w-0.5 h-full bg-slate-100 my-1" />
                                        </div>
                                        <div className="pb-6">
                                            <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Gate Entry Created</p>
                                            <p className="text-[10px] text-slate-400 font-bold">{format(new Date(entry.created_at), 'PPPp')}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-sm ring-4 ${entry.updated_at !== entry.created_at ? 'bg-blue-100 text-blue-600 ring-blue-50' : 'bg-slate-50 text-slate-300 ring-transparent'}`}>
                                                <BadgeCheck className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <p className={`text-xs font-black uppercase tracking-tight ${entry.updated_at !== entry.created_at ? 'text-slate-800' : 'text-slate-300'}`}>Last Status Update</p>
                                            <p className="text-[10px] text-slate-400 font-bold">{format(new Date(entry.updated_at || entry.created_at), 'PPPp')}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="bg-slate-800 rounded-[2rem] p-8 text-white space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                                <BadgeCheck className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black tracking-tight">Verified Entry</h3>
                                <p className="text-slate-400 text-sm font-medium leading-relaxed mt-2">
                                    This token represents a verified vehicle arrival. Total process duration:
                                    <span className="text-emerald-400 ml-1 font-bold">
                                        {Math.floor((new Date().getTime() - new Date(entry.created_at).getTime()) / (1000 * 60))} mins
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
