"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import {
    Trees,
    Plus,
    MapPin,
    TrendingUp,
    Calendar,
    Loader2,
    Search,
    Filter,
    ArrowUpRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrchardCard } from "@/components/field-manager/orchard-card";
import { OrchardDialog } from "@/components/field-manager/orchard-dialog";

export default function FieldManagerPage() {
    const { profile } = useAuth();
    const [orchards, setOrchards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (profile?.organization_id) {
            fetchOrchards();
        }
    }, [profile]);

    const fetchOrchards = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('orchards')
            .select(`
                *,
                contacts (name),
                items (name)
            `)
            .eq('organization_id', profile?.organization_id)
            .order('created_at', { ascending: false });

        if (data) setOrchards(data);
        setLoading(false);
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const stats = [
        { label: "Active Orchards", value: orchards.length, icon: Trees, color: "text-neon-green" },
        { label: "Est. Total Yield", value: "1.2k Tons", icon: TrendingUp, color: "text-neon-blue" },
        { label: "Upcoming Harvests", value: "8 Fields", icon: Calendar, color: "text-neon-purple" },
        { label: "Field Visits", value: "24 this week", icon: MapPin, color: "text-amber-400" },
    ];

    return (
        <div className="flex-1 min-h-screen bg-[#050510] text-white p-8 space-y-12 pb-32">
            <div className="max-w-7xl mx-auto space-y-12">

                {/* Header Section */}
                <motion.header
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
                >
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 text-neon-green font-black italic tracking-tighter uppercase text-xs">
                            <div className="w-8 h-px bg-neon-green/30" />
                            AGRICULTURAL GOVERNANCE
                        </div>
                        <h1 className="text-6xl font-black tracking-tighter text-white italic">
                            FIELD <span className="text-neon-green">MANAGER</span>
                        </h1>
                        <p className="text-gray-400 font-medium max-w-lg">
                            Track harvest cycles, predict yields, and monitor orchard health directly from the field.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <Button className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-2xl h-14 px-8 font-black uppercase tracking-widest text-xs group transition-all">
                            <Filter className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform" />
                            Filters
                        </Button>
                        <OrchardDialog onSuccess={fetchOrchards}>
                            <Button className="bg-neon-green text-black hover:bg-green-400 rounded-2xl h-14 px-8 font-black uppercase tracking-widest text-xs shadow-[0_0_30px_rgba(57,255,20,0.3)] transition-all hover:scale-105 active:scale-95">
                                <Plus className="w-4 h-4 mr-2" />
                                Register Orchard
                            </Button>
                        </OrchardDialog>
                    </div>
                </motion.header>

                {/* KPI Matrix */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                    {stats.map((stat, idx) => (
                        <motion.div
                            key={idx}
                            variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
                            className="bg-white/[0.02] border border-white/5 p-6 rounded-[32px] group hover:bg-white/[0.04] hover:border-white/10 transition-all relative overflow-hidden"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-2xl bg-white/5 ${stat.color}`}>
                                    <stat.icon className="w-6 h-6" />
                                </div>
                                <ArrowUpRight className="w-4 h-4 text-gray-700 group-hover:text-white transition-colors" />
                            </div>
                            <div className="text-3xl font-black tracking-tight mb-1">{stat.value}</div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{stat.label}</div>

                            {/* Ambient Glow */}
                            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-white/5 blur-3xl rounded-full group-hover:bg-neon-green/10 transition-colors" />
                        </motion.div>
                    ))}
                </motion.div>

                {/* Search & Main Content */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-[24px] p-2 focus-within:border-neon-green/50 transition-all">
                        <div className="pl-4">
                            <Search className="w-5 h-5 text-gray-500" />
                        </div>
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search Orchards, Farmers, or Locations..."
                            className="bg-transparent border-none h-12 text-white font-bold placeholder:text-gray-600 focus-visible:ring-0"
                        />
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4">
                            <Loader2 className="w-12 h-12 text-neon-green animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 animate-pulse">Syncing Field Database...</span>
                        </div>
                    ) : orchards.length === 0 ? (
                        <div className="py-32 text-center border border-dashed border-white/10 rounded-[40px] bg-white/[0.01]">
                            <Trees className="w-16 h-16 mx-auto text-gray-800 mb-6" />
                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tight">No Fields Registered</h3>
                            <p className="text-gray-500 max-w-xs mx-auto mt-2 text-sm">Register your first orchard to start tracking growth cycles and harvest predictions.</p>
                            <OrchardDialog onSuccess={fetchOrchards}>
                                <Button className="mt-8 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10">
                                    Start Registration
                                </Button>
                            </OrchardDialog>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {orchards.filter(o =>
                                o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                o.contacts?.name.toLowerCase().includes(searchTerm.toLowerCase())
                            ).map((orchard) => (
                                <OrchardCard key={orchard.id} orchard={orchard} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
