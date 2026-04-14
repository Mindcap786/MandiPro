"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Gavel, Loader2, Zap, TrendingUp, Clock, Users, Plus, Play, Square, RefreshCw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";
import { format } from "date-fns";

type AuctionSession = {
    id: string;
    lot_id: string;
    status: "waiting" | "live" | "paused" | "closed" | "settled";
    start_price: number;
    current_price: number;
    increment: number;
    winning_contact_id: string | null;
    winning_price: number | null;
    started_at: string | null;
    closed_at: string | null;
    lot?: { lot_code: string; item?: { name: string }; current_qty: number };
};

type Bid = {
    id: string;
    bidder_name: string;
    amount: number;
    is_winning: boolean;
    bid_at: string;
};

export default function LiveAuctionPage() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [sessions, setSessions] = useState<AuctionSession[]>([]);
    const [selectedSession, setSelectedSession] = useState<AuctionSession | null>(null);
    const [bids, setBids] = useState<Bid[]>([]);
    const [lots, setLots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [bidding, setBidding] = useState(false);
    const [bidderName, setBidderName] = useState("");
    const [bidAmount, setBidAmount] = useState(0);
    const [newAuction, setNewAuction] = useState({ lot_id: "", start_price: 100, increment: 50 });
    const [showCreate, setShowCreate] = useState(false);
    const channelRef = useRef<any>(null);

    useEffect(() => {
        if (profile?.organization_id) {
            fetchSessions();
            fetchLots();
        }
        return () => { channelRef.current?.unsubscribe(); };
    }, [profile]);

    useEffect(() => {
        if (selectedSession?.id) {
            fetchBids(selectedSession.id);
            subscribeToSession(selectedSession.id);
            setBidAmount((selectedSession.current_price || selectedSession.start_price) + selectedSession.increment);
        }
    }, [selectedSession?.id]);

    const fetchSessions = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("auction_sessions")
            .select("*, lot:lots(lot_code, current_qty, item:items(name))")
            .eq("organization_id", profile?.organization_id)
            .order("created_at", { ascending: false })
            .limit(20);
        if (data) {
            setSessions(data as any);
            if (!selectedSession && data.find(s => s.status === "live")) {
                setSelectedSession(data.find(s => s.status === "live") as any);
            }
        }
        setLoading(false);
    };

    const fetchLots = async () => {
        const { data } = await supabase
            .from("lots")
            .select("id, lot_code, current_qty, item:items(name)")
            .eq("organization_id", profile?.organization_id)
            .gt("current_qty", 0)
            .limit(50);
        if (data) setLots(data as any);
    };

    const fetchBids = async (sessionId: string) => {
        const { data } = await supabase
            .from("auction_bids")
            .select("*")
            .eq("session_id", sessionId)
            .order("bid_at", { ascending: false })
            .limit(30);
        if (data) setBids(data as Bid[]);
    };

    const subscribeToSession = (sessionId: string) => {
        const uniqueId = Math.random().toString(36).substring(7);
        channelRef.current = supabase
            .channel(`auction:${sessionId}_${uniqueId}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "auction_bids", filter: `session_id=eq.${sessionId}` },
                (payload) => {
                    setBids(prev => [payload.new as Bid, ...prev]);
                    setSelectedSession(prev => prev ? { ...prev, current_price: (payload.new as any).amount } : prev);
                    setBidAmount((payload.new as any).amount + (selectedSession?.increment || 50));
                })
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "auction_sessions", filter: `id=eq.${sessionId}` },
                (payload) => setSelectedSession(payload.new as AuctionSession))
            .subscribe();
    };

    const handleCreateSession = async () => {
        const { data, error } = await supabase.from("auction_sessions").insert({
            organization_id: profile?.organization_id,
            lot_id: newAuction.lot_id,
            start_price: newAuction.start_price,
            current_price: newAuction.start_price,
            increment: newAuction.increment,
            status: "waiting",
            created_by: profile?.id,
        }).select("*, lot:lots(lot_code,current_qty,item:items(name))").single();
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
        setSessions(prev => [data as any, ...prev]);
        setSelectedSession(data as any);
        setShowCreate(false);
        toast({ title: "Auction created! Start it when ready." });
    };

    const updateStatus = async (sessionId: string, status: string) => {
        await supabase.from("auction_sessions").update({
            status,
            ...(status === "live" ? { started_at: new Date().toISOString() } : {}),
        }).eq("id", sessionId);
        fetchSessions();
    };

    const handleCloseAuction = async (sessionId: string) => {
        await supabase.rpc("close_auction", { p_session_id: sessionId });
        fetchSessions();
        toast({ title: "Auction closed!", description: `Winning bid: ₹${selectedSession?.current_price?.toLocaleString()}` });
    };

    const handleBid = async () => {
        if (!selectedSession || !bidderName.trim()) {
            toast({ title: "Enter bidder name", variant: "destructive" }); return;
        }
        setBidding(true);
        const result = await supabase.rpc("place_auction_bid", {
            p_session_id: selectedSession.id,
            p_contact_id: null,
            p_bidder_name: bidderName,
            p_amount: bidAmount,
        });
        setBidding(false);
        if (result.data?.error) {
            toast({ title: result.data.error, variant: "destructive" });
        } else {
            toast({ title: `✅ Bid of ₹${bidAmount.toLocaleString()} placed!` });
            setBidAmount(bidAmount + selectedSession.increment);
        }
    };

    const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
        waiting: { label: "Waiting", color: "bg-slate-100 text-slate-600" },
        live: { label: "🔴 LIVE", color: "bg-red-100 text-red-700 animate-pulse" },
        paused: { label: "Paused", color: "bg-amber-100 text-amber-700" },
        closed: { label: "Closed", color: "bg-slate-100 text-slate-400" },
        settled: { label: "Settled", color: "bg-emerald-100 text-emerald-700" },
    };

    return (
        <ProtectedRoute requiredPermission="conduct_sales">
            <div className="min-h-screen bg-[#F0F2F5] pb-20">
                {/* Header */}
                <div className="bg-slate-900 px-8 py-5 shadow-2xl">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg">
                                <Gavel className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-[1000] text-white tracking-tighter uppercase">Live Auction</h1>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Open-Cry Bidding Engine</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={fetchSessions} variant="outline" size="icon" className="rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20">
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button onClick={() => setShowCreate(true)}
                                className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-black gap-2">
                                <Plus className="w-4 h-4" /> New Auction
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Session List */}
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sessions</h3>
                        {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" /> : sessions.map(s => (
                            <button key={s.id} onClick={() => setSelectedSession(s)}
                                className={cn("w-full text-left p-4 rounded-2xl border transition-all shadow-sm",
                                    selectedSession?.id === s.id ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 hover:border-slate-300")}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-black text-sm">{s.lot?.item?.name || "Unknown"}</p>
                                    <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-full", STATUS_CONFIG[s.status]?.color)}>
                                        {STATUS_CONFIG[s.status]?.label}
                                    </span>
                                </div>
                                <p className="text-xs font-mono opacity-60">{s.lot?.lot_code}</p>
                                <p className="text-lg font-[1000] text-emerald-400 mt-1">₹{(s.current_price || s.start_price).toLocaleString()}</p>
                            </button>
                        ))}
                    </div>

                    {/* Active Auction Panel */}
                    <div className="lg:col-span-2 space-y-6">
                        {selectedSession ? (
                            <>
                                {/* Price Display */}
                                <div className={cn("rounded-[32px] p-8 text-white relative overflow-hidden",
                                    selectedSession.status === "live" ? "bg-slate-900" : "bg-slate-700")}>
                                    <div className="absolute top-0 right-0 w-48 h-48 bg-red-500 rounded-full opacity-10 -mr-12 -mt-12" />
                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">
                                                    {selectedSession.lot?.item?.name} · {selectedSession.lot?.lot_code}
                                                </p>
                                                <span className={cn("text-[10px] font-black uppercase px-3 py-1 rounded-full", STATUS_CONFIG[selectedSession.status]?.color)}>
                                                    {STATUS_CONFIG[selectedSession.status]?.label}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                {selectedSession.status === "waiting" && (
                                                    <Button onClick={() => updateStatus(selectedSession.id, "live")}
                                                        className="bg-red-500 hover:bg-red-600 text-white rounded-xl gap-2 font-black">
                                                        <Play className="w-4 h-4" /> Start
                                                    </Button>
                                                )}
                                                {selectedSession.status === "live" && (
                                                    <Button onClick={() => handleCloseAuction(selectedSession.id)}
                                                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl gap-2 font-black">
                                                        <Square className="w-4 h-4" /> Settle
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-center py-4">
                                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">Current Highest Bid</p>
                                            <p className="text-6xl font-[1000] tracking-tighter text-white">
                                                ₹{(selectedSession.current_price || selectedSession.start_price).toLocaleString()}
                                            </p>
                                            <p className="text-slate-400 text-sm mt-2 font-bold">
                                                Increment: ₹{selectedSession.increment} · Start: ₹{selectedSession.start_price.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Bid Input */}
                                {selectedSession.status === "live" && (
                                    <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm p-6">
                                        <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm mb-4">Place Bid</h3>
                                        <div className="flex gap-3">
                                            <Input value={bidderName} onChange={e => setBidderName(e.target.value)}
                                                placeholder="Bidder name / party" className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                                                <Input type="number" value={bidAmount} onChange={e => setBidAmount(Number(e.target.value))}
                                                    className="pl-7 w-40 rounded-xl border-slate-200 bg-slate-50 text-black font-mono font-bold" />
                                            </div>
                                            <Button
                                                onClick={handleBid}
                                                disabled={bidding || !bidderName.trim()}
                                                className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-black px-6 gap-2">
                                                {bidding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />}
                                                BID!
                                            </Button>
                                        </div>
                                        <div className="flex gap-2 mt-3">
                                            {[1, 2, 3, 5].map(m => (
                                                <button key={m} onClick={() => setBidAmount((selectedSession.current_price || selectedSession.start_price) + selectedSession.increment * m)}
                                                    className="text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all">
                                                    +{m} inc. · ₹{((selectedSession.current_price || selectedSession.start_price) + selectedSession.increment * m).toLocaleString()}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Bid History */}
                                <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                        <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">Bid History</h3>
                                        <span className="text-[10px] font-black text-slate-400 uppercase">{bids.length} bids</span>
                                    </div>
                                    <div className="max-h-72 overflow-y-auto">
                                        {bids.length === 0 ? (
                                            <p className="text-center py-10 text-slate-400 font-bold text-sm">No bids yet</p>
                                        ) : bids.map((bid, i) => (
                                            <div key={bid.id} className={cn("flex items-center justify-between px-5 py-3 border-b border-slate-50",
                                                bid.is_winning && "bg-emerald-50")}>
                                                <div className="flex items-center gap-3">
                                                    {bid.is_winning && <Trophy className="w-4 h-4 text-emerald-500" />}
                                                    <div>
                                                        <p className="font-black text-slate-700 text-sm">{bid.bidder_name}</p>
                                                        <p className="text-[10px] font-mono text-slate-400">
                                                            {format(new Date(bid.bid_at), "HH:mm:ss")}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className={cn("font-[1000] text-xl tracking-tighter", bid.is_winning ? "text-emerald-600" : "text-slate-400 line-through text-base")}>
                                                    ₹{bid.amount.toLocaleString()}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="bg-white rounded-[32px] border border-slate-200 p-20 text-center">
                                <Gavel className="w-16 h-16 mx-auto text-slate-200 mb-4" />
                                <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Select or create an auction session</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Create Auction Modal */}
                {showCreate && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
                        <div className="bg-white rounded-[32px] shadow-2xl p-8 w-full max-w-md space-y-5">
                            <h2 className="text-2xl font-[1000] text-slate-800 tracking-tighter">New Auction</h2>
                            <div className="space-y-3">
                                <select value={newAuction.lot_id} onChange={e => setNewAuction(p => ({ ...p, lot_id: e.target.value }))}
                                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-700">
                                    <option value="">Select Lot</option>
                                    {lots.map(l => <option key={l.id} value={l.id}>{l.lot_code} — {l.item?.name} ({l.current_qty} units)</option>)}
                                </select>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Start Price ₹</label>
                                        <Input type="number" value={newAuction.start_price} onChange={e => setNewAuction(p => ({ ...p, start_price: Number(e.target.value) }))}
                                            className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Increment ₹</label>
                                        <Input type="number" value={newAuction.increment} onChange={e => setNewAuction(p => ({ ...p, increment: Number(e.target.value) }))}
                                            className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Button onClick={() => setShowCreate(false)} variant="outline" className="flex-1 rounded-xl">Cancel</Button>
                                <Button onClick={handleCreateSession} disabled={!newAuction.lot_id}
                                    className="flex-1 bg-slate-900 text-white rounded-xl font-black">Create</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
