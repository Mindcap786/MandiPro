"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";
import { format } from "date-fns";

type CommodityRate = {
    rate_date: string;
    avg_rate: number;
    min_rate: number;
    max_rate: number;
    volume_qty: number;
};

type ForecastData = {
    current_avg: number;
    forecast_tomorrow: number;
    forecast_7d: number;
    trend: "rising" | "falling" | "stable";
    trend_pct: number;
};

export default function PriceForecastPage() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [items, setItems] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [rates, setRates] = useState<CommodityRate[]>([]);
    const [forecast, setForecast] = useState<ForecastData | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        if (profile?.organization_id) fetchItems();
    }, [profile]);

    useEffect(() => {
        if (selectedItem) fetchRatesAndForecast(selectedItem.id);
    }, [selectedItem?.id]);

    const fetchItems = async () => {
        const { data } = await supabase.schema('mandi').from("commodities").select("id, name").eq("organization_id", profile?.organization_id).limit(50);
        if (data) { setItems(data); if (data.length > 0) setSelectedItem(data[0]); }
    };

    const fetchRatesAndForecast = async (itemId: string) => {
        setLoading(true);
        const [ratesRes, forecastRes] = await Promise.all([
            supabase.schema('mandi').from("commodity_rates").select("*")
                .eq("organization_id", profile?.organization_id)
                .eq("item_id", itemId)
                .order("rate_date", { ascending: false }).limit(30),
            supabase.rpc("forecast_commodity_rate", {
                p_org_id: profile?.organization_id,
                p_item_id: itemId,
                p_days: 14
            }),
        ]);
        if (ratesRes.data) setRates(ratesRes.data);
        if (forecastRes.data) setForecast(forecastRes.data);
        setLoading(false);
    };

    const syncRates = async () => {
        setSyncing(true);
        const { data } = await supabase.rpc("sync_daily_commodity_rates", { p_org_id: profile?.organization_id });
        setSyncing(false);
        toast({ title: `Synced ${data || 0} commodity rates from today's sales` });
        if (selectedItem) fetchRatesAndForecast(selectedItem.id);
    };

    const maxRate = rates.length > 0 ? Math.max(...rates.map(r => r.max_rate)) : 1;

    const TREND_CONFIG = {
        rising: { icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "Rising ↑" },
        falling: { icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50 border-rose-100", label: "Falling ↓" },
        stable: { icon: Minus, color: "text-blue-600", bg: "bg-blue-50 border-blue-100", label: "Stable →" },
    };

    const trendConf = forecast ? TREND_CONFIG[forecast.trend] : null;
    const TrendIcon = trendConf?.icon || Minus;

    return (
        <ProtectedRoute requiredPermission="view_reports">
            <div className="min-h-screen bg-[#F0F2F5] pb-20">
                <div className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm">
                    <div className="max-w-6xl mx-auto flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-[1000] tracking-tighter text-slate-800 uppercase flex items-center gap-3">
                                <BarChart3 className="w-7 h-7 text-indigo-600" /> AI Price Forecast
                            </h1>
                            <p className="text-slate-400 font-bold text-sm mt-0.5">7-14 day commodity rate trend analysis</p>
                        </div>
                        <div className="flex gap-3 items-center">
                            <select value={selectedItem?.id || ""} onChange={e => setSelectedItem(items.find(i => i.id === e.target.value))}
                                className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">
                                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                            <Button onClick={syncRates} disabled={syncing} variant="outline"
                                className="h-11 rounded-xl gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold">
                                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Sync Rates
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
                    {loading ? (
                        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>
                    ) : (
                        <>
                            {/* Forecast Cards */}
                            {forecast && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                    <div className={cn("rounded-[28px] border p-7 shadow-sm col-span-1", trendConf?.bg)}>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">AI Trend Signal</p>
                                        <div className="flex items-center gap-2">
                                            <TrendIcon className={cn("w-8 h-8", trendConf?.color)} />
                                            <div>
                                                <p className={cn("text-2xl font-[1000] tracking-tighter", trendConf?.color)}>{trendConf?.label}</p>
                                                <p className={cn("text-sm font-black", trendConf?.color)}>
                                                    {forecast.trend_pct > 0 ? "+" : ""}{forecast.trend_pct}%
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    {[
                                        { label: "Current Avg Rate", val: `₹${forecast.current_avg.toLocaleString()}`, sub: "Last 14 days" },
                                        { label: "Tomorrow Forecast", val: `₹${forecast.forecast_tomorrow.toLocaleString()}`, sub: "Next session est." },
                                        { label: "7-Day Forecast", val: `₹${forecast.forecast_7d.toLocaleString()}`, sub: "Week ahead est." },
                                    ].map(({ label, val, sub }) => (
                                        <div key={label} className="bg-white rounded-[28px] border border-slate-200 shadow-sm p-7">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</p>
                                            <p className="text-3xl font-[1000] text-slate-800 tracking-tighter">{val}</p>
                                            <p className="text-xs font-bold text-slate-400 mt-1">{sub}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rate History Chart (Bar visualization) */}
                            {rates.length > 0 ? (
                                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
                                    <h3 className="font-black text-slate-800 uppercase tracking-tight mb-6 text-sm">
                                        Rate History — {selectedItem?.name}
                                    </h3>
                                    <div className="flex items-end gap-2 h-48 overflow-x-auto pb-2">
                                        {[...rates].reverse().map((rate, i) => {
                                            const pct = maxRate > 0 ? (rate.avg_rate / maxRate) * 100 : 0;
                                            const isRecent = i >= rates.length - 3;
                                            return (
                                                <div key={rate.rate_date} className="flex flex-col items-center gap-1 min-w-[36px] group">
                                                    <div className="relative">
                                                        <div className="text-[8px] font-mono text-slate-400 group-hover:text-indigo-600 transition-colors text-center">
                                                            ₹{rate.avg_rate.toFixed(0)}
                                                        </div>
                                                    </div>
                                                    <div className="w-8 rounded-t-lg transition-all group-hover:opacity-80"
                                                        style={{
                                                            height: `${Math.max(4, pct * 1.6)}px`,
                                                            background: isRecent
                                                                ? "linear-gradient(to top, #6366f1, #8b5cf6)"
                                                                : "linear-gradient(to top, #e2e8f0, #cbd5e1)"
                                                        }} />
                                                    <p className="text-[8px] font-mono text-slate-300 rotate-45 origin-left mt-1 whitespace-nowrap">
                                                        {format(new Date(rate.rate_date), "dd/MM")}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                        {/* Forecast bars */}
                                        {forecast && [
                                            { label: "Tomorrow", val: forecast.forecast_tomorrow },
                                            { label: "+7d", val: forecast.forecast_7d },
                                        ].map(({ label, val }) => {
                                            const pct = maxRate > 0 ? (val / maxRate) * 100 : 0;
                                            return (
                                                <div key={label} className="flex flex-col items-center gap-1 min-w-[36px] opacity-70">
                                                    <div className="text-[8px] font-mono text-emerald-500">₹{val.toFixed(0)}</div>
                                                    <div className="w-8 rounded-t-lg border-2 border-dashed border-emerald-400"
                                                        style={{
                                                            height: `${Math.max(4, pct * 1.6)}px`,
                                                            background: "repeating-linear-gradient(45deg, #bbf7d0, #bbf7d0 3px, transparent 3px, transparent 8px)"
                                                        }} />
                                                    <p className="text-[8px] font-bold text-emerald-500 mt-1">{label}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex gap-4 mt-4 text-[10px] font-bold">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-3 rounded bg-gradient-to-t from-indigo-500 to-violet-500" />
                                            <span className="text-slate-400">Recent (3 days)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-3 rounded bg-slate-200" />
                                            <span className="text-slate-400">Historical</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-3 rounded border-2 border-dashed border-emerald-400" />
                                            <span className="text-emerald-500">AI Forecast</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-[32px] border border-slate-200 p-16 text-center">
                                    <BarChart3 className="w-12 h-12 mx-auto text-slate-200 mb-4" />
                                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs mb-4">No rate history yet</p>
                                    <Button onClick={syncRates} className="bg-indigo-600 text-white rounded-xl font-black gap-2">
                                        <RefreshCw className="w-4 h-4" /> Sync from Today's Sales
                                    </Button>
                                </div>
                            )}

                            {/* Rate Table */}
                            {rates.length > 0 && (
                                <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                            <tr>
                                                <th className="p-4">Date</th>
                                                <th className="p-4 text-right">Min</th>
                                                <th className="p-4 text-right">Avg</th>
                                                <th className="p-4 text-right">Max</th>
                                                <th className="p-4 text-right">Volume (kg)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {rates.map(r => (
                                                <tr key={r.rate_date} className="hover:bg-slate-50/60">
                                                    <td className="p-4 font-mono font-bold text-slate-500 text-sm">{format(new Date(r.rate_date), "dd MMM yyyy")}</td>
                                                    <td className="p-4 text-right font-mono text-rose-600">₹{r.min_rate.toFixed(2)}</td>
                                                    <td className="p-4 text-right font-mono font-black text-slate-800">₹{r.avg_rate.toFixed(2)}</td>
                                                    <td className="p-4 text-right font-mono text-emerald-600">₹{r.max_rate.toFixed(2)}</td>
                                                    <td className="p-4 text-right font-mono text-slate-400">{r.volume_qty?.toLocaleString() || "-"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
