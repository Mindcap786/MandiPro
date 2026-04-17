"use client";

import { motion } from "framer-motion";
import { Trees, MapPin, User, Calendar, Droplets, Target } from "lucide-react";

interface OrchardCardProps {
    orchard: any;
}

export function OrchardCard({ orchard }: OrchardCardProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'growing': return 'text-neon-blue border-neon-blue/30 bg-neon-blue/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]';
            case 'flowering': return 'text-pink-500 border-pink-500/30 bg-pink-500/5 shadow-[0_0_15px_rgba(236,72,153,0.1)]';
            case 'harvested': return 'text-neon-green border-neon-green/30 bg-neon-green/5 shadow-[0_0_15px_rgba(57,255,20,0.1)]';
            default: return 'text-gray-500 border-white/10 bg-white/5';
        }
    };

    return (
        <motion.div
            whileHover={{ y: -10, scale: 1.02 }}
            className="group relative bg-white/[0.02] border border-white/5 rounded-[40px] p-8 overflow-hidden transition-all hover:bg-white/[0.04] hover:border-white/10 shadow-2xl"
        >
            {/* Visual Header */}
            <div className="flex justify-between items-start mb-8">
                <div className={`px-4 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${getStatusColor(orchard.status)}`}>
                    {orchard.status}
                </div>
                <div className="text-gray-600 group-hover:text-neon-green transition-colors">
                    <Trees className="w-8 h-8" />
                </div>
            </div>

            {/* Core Info */}
            <div className="space-y-1 mb-8">
                <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none group-hover:text-neon-green transition-colors">
                    {orchard.name}
                </h3>
                <div className="flex items-center gap-2 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
                    <MapPin className="w-3 h-3 text-neon-blue" />
                    {orchard.location || 'Location Pending'}
                </div>
            </div>

            {/* Owner & Item */}
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl mb-8 border border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neon-blue/10 flex items-center justify-center border border-neon-blue/20">
                        <User className="w-5 h-5 text-neon-blue" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Farmer</span>
                        <span className="text-sm font-bold text-white">{orchard.contacts?.name}</span>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Main Crop</span>
                    <span className="text-sm font-black text-neon-green italic">{orchard.items?.name || 'Assorted'}</span>
                </div>
            </div>

            {/* Production Stats */}
            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-3xl bg-black/20 border border-white/5 flex flex-col items-center justify-center group-hover:border-neon-blue/30 transition-all">
                    <Droplets className="w-4 h-4 text-neon-blue mb-2" />
                    <span className="text-xl font-black text-white tabular-nums">{orchard.tree_count}</span>
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Trees</span>
                </div>
                <div className="p-4 rounded-3xl bg-black/20 border border-white/5 flex flex-col items-center justify-center group-hover:border-neon-purple/30 transition-all">
                    <Target className="w-4 h-4 text-neon-purple mb-2" />
                    <span className="text-xl font-black text-white tabular-nums">{orchard.estimated_yield}T</span>
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Est. Yield</span>
                </div>
            </div>

            {/* Action Bar */}
            <div className="mt-8 pt-6 border-t border-white/5 flex gap-2">
                <button className="flex-1 h-12 rounded-xl bg-white/5 border border-white/10 text-white font-black uppercase text-[10px] tracking-widest hover:bg-white/10 transition-all">
                    View Logs
                </button>
                <button className="flex-1 h-12 rounded-xl bg-neon-green text-black font-black uppercase text-[10px] tracking-widest hover:bg-green-400 transition-all shadow-lg shadow-neon-green/10">
                    Update
                </button>
            </div>

            {/* Parallax Background Accent */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-green/5 blur-[100px] rounded-full pointer-events-none group-hover:bg-neon-green/10 transition-colors" />
        </motion.div>
    );
}
