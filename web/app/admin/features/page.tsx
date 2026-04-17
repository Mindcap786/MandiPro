'use client';

import { useEffect, useState } from 'react';
import {
    AlertOctagon, Loader2, Globe, Building2, RefreshCw, Search
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PromptDialog } from '@/components/ui/prompt-dialog';

// Category is derived from key convention for display purposes
function getCategory(key: string): string {
    if (key === 'maintenance_mode') return 'KILL SWITCH';
    if (key === 'mandi_pro' || key === 'wholesale_pro') return 'Domain';
    if (key === 'gst_module') return 'Finance';
    if (key === 'ai_analytics') return 'Premium';
    if (key === 'pos_module') return 'Module';
    if (key === 'multi_user') return 'Access';
    return 'Platform';
}

const CATEGORY_COLORS: Record<string, string> = {
    Domain: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    Finance: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Premium: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    Module: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    Access: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    Platform: 'text-slate-500 bg-gray-500/10 border-gray-500/20',
    'KILL SWITCH': 'text-red-400 bg-red-500/10 border-red-500/20',
};

export default function FeatureFlagsPage() {
    const { toast } = useToast();
    // All flags come from DB now — no hardcoded JS array
    const [flags, setFlags] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [promptConfig, setPromptConfig] = useState<{
        open: boolean;
        title: string;
        description: string;
        requiredText: string;
        onConfirm: () => Promise<void> | void;
        variant?: 'default' | 'destructive';
    }>({ open: false, title: '', description: '', requiredText: '', onConfirm: () => {} });

    useEffect(() => { fetchFlags(); }, []);

    const fetchFlags = async () => {
        setLoading(true);
        // Fetch all global flags (organization_id IS NULL = platform-wide)
        const { data, error } = await supabase
            .schema('core')
            .from('feature_flags')
            .select('*')
            .is('organization_id', null)
            .order('created_at', { ascending: true });

        if (error) {
            toast({ title: 'Error loading flags', description: error.message, variant: 'destructive' });
        } else {
            setFlags(data || []);
        }
        setLoading(false);
    };

    const handleToggle = async (flag: any) => {
        const newStatus = !flag.is_enabled;

        const updateFlag = async () => {
            setToggling(flag.id);
            try {
                const { error } = await supabase
                    .schema('core')
                    .from('feature_flags')
                    .update({ is_enabled: newStatus })
                    .eq('id', flag.id);

                if (error) throw error;
                toast({ title: 'Flag Updated', description: `${flag.label} → ${newStatus ? 'ENABLED' : 'DISABLED'}` });
                fetchFlags();
            } catch (e: any) {
                toast({ title: 'Error', description: e.message, variant: 'destructive' });
            } finally {
                setToggling(null);
            }
        };

        // Safety check for maintenance mode
        if (flag.key === 'maintenance_mode' && newStatus) {
            setPromptConfig({
                open: true,
                title: 'Activate Maintenance Mode?',
                description: '⚠ DANGER: This will lock ALL tenants out of the system immediately. Only proceed if you are performing critical maintenance.',
                requiredText: 'DOWN',
                variant: 'destructive',
                onConfirm: updateFlag
            });
            return;
        }

        await updateFlag();
    };

    const enriched = flags
        .filter(f => f.key !== 'wholesale_pro' && f.key !== 'gst_module')
        .map(f => ({ ...f, category: getCategory(f.key) }));
    const filtered = enriched.filter(f =>
        f.label?.toLowerCase().includes(search.toLowerCase()) ||
        f.key?.toLowerCase().includes(search.toLowerCase()) ||
        f.category?.toLowerCase().includes(search.toLowerCase())
    );
    const categories = Array.from(new Set(filtered.map(f => f.category)));

    // Is maintenance mode currently ON?
    const maintenanceOn = flags.find(f => f.key === 'maintenance_mode')?.is_enabled ?? false;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-[0.2em] uppercase mb-1">Feature Flags</h1>
                    <p className="text-slate-500 text-sm font-medium">
                        Safe rollouts, emergency kill switches &amp; per-tenant module control. All flags are database-driven.
                    </p>
                </div>
                <Button variant="outline" className="border-slate-200 text-slate-900 hover:bg-white/5" onClick={fetchFlags} disabled={loading}>
                    <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Refresh
                </Button>
            </div>

            {/* Kill Switch Banner */}
            <div className={cn(
                "p-4 rounded-2xl border flex items-center gap-4 transition-all",
                maintenanceOn
                    ? "border-red-500/50 bg-red-950/40"
                    : "border-red-500/20 bg-red-50"
            )}>
                <AlertOctagon className={cn("w-6 h-6 flex-shrink-0", maintenanceOn ? "text-red-400 animate-ping" : "text-red-400 animate-pulse")} />
                <div className="flex-1">
                    <p className="text-sm font-black text-red-400">Emergency Kill Switch</p>
                    <p className="text-xs text-red-400/60">
                        Maintenance Mode immediately locks all tenant access. Requires confirmation code &quot;DOWN&quot;.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={cn(
                        "text-xs font-black",
                        maintenanceOn ? "text-red-400" : "text-emerald-400"
                    )}>
                        {maintenanceOn ? "⚠ MAINTENANCE" : "PLATFORM ONLINE"}
                    </span>
                    <div className={cn(
                        "w-3 h-3 rounded-full animate-pulse",
                        maintenanceOn ? "bg-red-500" : "bg-emerald-500"
                    )} />
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                    placeholder="Search flags..."
                    className="pl-9 bg-white shadow-sm border-slate-200 text-slate-900 placeholder:text-slate-400"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Loading state */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : flags.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                    <p className="font-bold">No feature flags found in database.</p>
                    <p className="text-sm mt-1">Run the migration to seed the feature_flags table.</p>
                </div>
            ) : (
                /* Flag Groups */
                categories.map(cat => (
                    <div key={cat}>
                        <div className="flex items-center gap-3 mb-4">
                            <Badge variant="outline" className={cn("text-[10px] font-black uppercase", CATEGORY_COLORS[cat])}>
                                {cat}
                            </Badge>
                            <div className="h-px flex-1 bg-white/5" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filtered.filter(f => f.category === cat).map(flag => (
                                <Card key={flag.id} className={cn(
                                    "border-slate-200 transition-all hover:border-slate-300",
                                    flag.key === 'maintenance_mode' ? "bg-red-50 border-red-500/20" : "bg-white shadow-sm",
                                    flag.is_enabled && flag.key !== 'maintenance_mode' && "border-emerald-500/10"
                                )}>
                                    <CardContent className="p-5 flex items-start justify-between gap-4">
                                        <div className="flex-1 space-y-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-sm font-black text-slate-900">{flag.label}</h3>
                                                <Badge variant="outline" className={cn("text-[9px]", CATEGORY_COLORS[flag.category])}>
                                                    {flag.organization_id
                                                        ? <><Building2 className="w-2.5 h-2.5 mr-1 inline" />Targeted</>
                                                        : <><Globe className="w-2.5 h-2.5 mr-1 inline" />Global</>
                                                    }
                                                </Badge>
                                                {flag.key === 'maintenance_mode' && (
                                                    <Badge variant="destructive" className="text-[9px]">
                                                        <AlertOctagon className="w-2.5 h-2.5 mr-1" /> DANGER
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 font-mono">{flag.key}</p>
                                            <p className="text-xs text-slate-500">{flag.description}</p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            {toggling === flag.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                            ) : (
                                                <span className={cn(
                                                    "text-[10px] font-black uppercase",
                                                    flag.is_enabled ? "text-emerald-400" : "text-slate-400"
                                                )}>
                                                    {flag.is_enabled ? 'ON' : 'OFF'}
                                                </span>
                                            )}
                                            <Switch
                                                checked={flag.is_enabled ?? false}
                                                onCheckedChange={() => handleToggle(flag)}
                                                disabled={toggling === flag.id}
                                                className="data-[state=checked]:bg-indigo-600"
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                ))
            )}

            <PromptDialog
                open={promptConfig.open}
                onOpenChange={(open) => setPromptConfig({ ...promptConfig, open })}
                title={promptConfig.title}
                description={promptConfig.description}
                requiredText={promptConfig.requiredText}
                onConfirm={promptConfig.onConfirm}
                variant={promptConfig.variant}
            />
        </div>
    );
}
