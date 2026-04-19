'use client';
// Static export: client component — generateStaticParams is in layout.tsx



import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    ShieldCheck, Loader2, Users, Monitor, Smartphone, 
    CalendarPlus, AlertTriangle, Box, Eye, Plus, 
    Power, PowerOff, Lock, Trash2, Key, Settings,
    ArrowLeft, XCircle, Store, Activity, Calendar, Ban,
    MoreHorizontal, Building2, Search, Filter, RefreshCw, ArrowUpRight,
    CheckCircle2, TrendingDown, ChevronRight, Zap, Shield, Phone
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { PromptDialog } from '@/components/ui/prompt-dialog';
import { useAuth } from '@/components/auth/auth-provider';
import { cn } from '@/lib/utils';

export default function TenantDetailPage() {
    const { profile, refreshOrg } = useAuth();
    const isSA = profile?.role === 'super_admin';

    const { id } = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Subscription Management State
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [isActioning, setIsActioning] = useState(false);
    const [actionInfo, setActionInfo] = useState<{}>({});
    const [saving, setSaving] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);
    const [override, setOverride] = useState({
        subscription_tier: '',
        max_web_users: 0,
        max_mobile_users: 0,
        trial_ends_at: null as string | null,
        extend_days: 0,
        grace_period_days: 7,
        billing_cycle: 'monthly' as 'monthly' | 'yearly',
        rbac_matrix: {} as Record<string, boolean>
    });

    const [memberManage, setMemberManage] = useState<{
        open: boolean,
        user: any,
        newPassword?: string,
        isResetting?: boolean,
        isPermissions?: boolean,
        tempMatrix?: any
    }>({ open: false, user: null });

    const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
    const [newUser, setNewUser] = useState({
        fullName: '',
        email: '',
        password: 'mandi123',
        role: 'member'
    });
    const [isCreatingUser, setIsCreatingUser] = useState(false);

    // Dialog state
    const [confirmConfig, setConfirmConfig] = useState<{
        open: boolean;
        title: string;
        description: string;
        onConfirm: () => Promise<void> | void;
        variant?: 'default' | 'destructive' | 'warning';
    }>({ open: false, title: '', description: '', onConfirm: () => {} });

    const [promptConfig, setPromptConfig] = useState<{
        open: boolean;
        title: string;
        description: string;
        requiredText: string;
        onConfirm: () => Promise<void> | void;
        variant?: 'default' | 'destructive';
    }>({ open: false, title: '', description: '', requiredText: '', onConfirm: () => {} });

    useEffect(() => {
        if (id) {
            fetchDetails();
            fetchPlans();
        }
    }, [id]);

    const fetchDetails = async () => {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_tenant_details', { p_org_id: id });
        if (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } else {
            setData(data);
            if (data?.org) {
                setOverride({
                    subscription_tier: data.org.subscription_tier || 'basic',
                    max_web_users: data.org.max_web_users ?? 1,
                    max_mobile_users: data.org.max_mobile_users ?? 0,
                    trial_ends_at: data.org.current_period_end || data.org.trial_ends_at,
                    extend_days: 0,
                    grace_period_days: 7,
                    billing_cycle: data.org.billing_cycle || 'monthly',
                    rbac_matrix: data.org.rbac_matrix || {}
                });
            }
        }
        setLoading(false);
    };

    const handleSaveUserPermissions = async () => {
        setIsActioning(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/admin/tenants/${id}/users/${memberManage.user.id}/permissions`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}` 
                },
                body: JSON.stringify({ rbac_matrix: memberManage.tempMatrix })
            });
            if (!res.ok) throw new Error('Update failed');
            toast({ title: 'Permissions Updated', description: `Access modified for ${memberManage.user.full_name}` });
            setMemberManage({ open: false, user: null });
            fetchDetails();
        } catch (e: any) {
            toast({ title: 'Update Failed', description: e.message, variant: 'destructive' });
        } finally {
            setIsActioning(false);
        }
    };

    const handleResetPassword = async () => {
        if (!memberManage.user || !memberManage.newPassword) return;
        setMemberManage(prev => ({ ...prev, isResetting: true }));
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/reset-password', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ userId: memberManage.user.id, newPassword: memberManage.newPassword })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to reset password');
            toast({ title: 'Success', description: `Password reset for ${memberManage.user.full_name}` });
            setMemberManage({ open: false, user: null, newPassword: '', isResetting: false });
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setMemberManage(prev => ({ ...prev, isResetting: false }));
        }
    };

    const handleAdminCreateUser = async () => {
        if (!newUser.email || !newUser.fullName) return;
        setIsCreatingUser(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ ...newUser, orgId: id })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to create user');
            toast({ title: 'Success', description: 'User account created.' });
            setIsCreateUserOpen(false);
            setNewUser({ fullName: '', email: '', password: 'mandi123', role: 'member' });
            fetchDetails();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setIsCreatingUser(false);
        }
    };

    const handleDeleteEmployee = async (employeeId: string, name: string) => {
        setConfirmConfig({
            open: true,
            title: 'Delete Employee Record?',
            description: `This will permanently PERMANENTLY delete ${name} and any associated system access. This action cannot be undone.`,
            variant: 'destructive',
            onConfirm: async () => {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch('/api/admin/delete-employee', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session?.access_token}`
                        },
                        body: JSON.stringify({ employeeId, organizationId: id })
                    });
                    if (!res.ok) {
                        const json = await res.json();
                        throw new Error(json.error || 'Failed to delete employee');
                    }
                    toast({ title: 'Employee Deleted', description: 'Record and access have been purged.' });
                    fetchDetails();
                } catch (e: any) {
                    toast({ title: 'Error', description: e.message, variant: 'destructive' });
                }
            }
        });
    };

    const fetchPlans = async () => {
        const { data } = await supabase
            .schema('core')
            .from('app_plans')
            .select('*')
            .eq('is_active', true)
            .order('price_monthly', { ascending: true });
        if (data) setPlans(data);
    };

    const handlePlanSelect = (planName: string) => {
        const plan = plans.find(p => p.name === planName);
        if (plan) {
            setOverride(prev => ({
                ...prev,
                subscription_tier: planName,
                max_web_users: plan.max_web_users ?? 1,
                max_mobile_users: plan.max_mobile_users ?? 0,
            }));
        }
    };

    const handleSaveSubscription = async () => {
        setSaving(true);
        try {
            // Calculate new target expiry
            let targetExpiry = override.trial_ends_at;
            if (override.extend_days > 0) {
                const currentExpiry = override.trial_ends_at ? new Date(override.trial_ends_at) : new Date();
                targetExpiry = addDays(currentExpiry, override.extend_days).toISOString();
            }

            // Calculate grace period end date (after the expiry)
            let gracePeriodEndsAt: string | null = null;
            if (targetExpiry && override.grace_period_days > 0) {
                gracePeriodEndsAt = addDays(new Date(targetExpiry), override.grace_period_days).toISOString();
            }

            // Determine if this is a downgrade
            const currentTier = org?.subscription_tier || 'Free';
            const newTier = override.subscription_tier;
            const tiers = ['Free', 'Basic', 'Standard', 'Enterprise', 'Premium'];
            const isDowngrade = tiers.indexOf(newTier) < tiers.indexOf(currentTier);

            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/billing/subscription', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    organization_id: id,
                    tier: newTier,
                    billing_cycle: override.billing_cycle,
                    expiry_date: targetExpiry,
                    grace_period_ends_at: gracePeriodEndsAt,
                    is_downgrade: isDowngrade,
                    max_web_users: override.max_web_users,
                    max_mobile_users: override.max_mobile_users,
                    rbac_matrix: override.rbac_matrix
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'API failed to update subscription');
            }

            toast({ 
                title: 'Subscription Enforced', 
                description: isDowngrade 
                    ? 'Compliance active: Extra users have been deactivated.' 
                    : 'Tenant access has been successfully reconfigured.',
                className: 'bg-slate-900 text-white border-slate-800'
            });

            setIsManageOpen(false);
            fetchDetails();
            refreshOrg();
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async () => {
        if (!data) return;
        const newStatus = !data.org.is_active;
        const action = newStatus ? 'Activate' : 'Suspend';
        
        setConfirmConfig({
            open: true,
            title: `${action} Tenant?`,
            description: `Are you sure you want to ${action.toLowerCase()} access for ${data.org.name}? This takes effect immediately.`,
            variant: newStatus ? 'default' : 'warning',
            onConfirm: async () => {
                const { error } = await supabase.rpc('toggle_organization_status', { org_id: id, new_status: newStatus });
                if (error) {
                    toast({ title: 'Error', description: error.message, variant: 'destructive' });
                } else {
                    toast({ title: 'Success', description: `Tenant ${action}d` });
                    fetchDetails();
                }
            }
        });
    };

    const handleDelete = async () => {
        setPromptConfig({
            open: true,
            title: 'Wipe Tenant Data?',
            description: `This will permanently delete ${data.org.name} and ALL associated data. This action is IRREVERSIBLE.`,
            requiredText: 'DELETE',
            variant: 'destructive',
            onConfirm: async () => {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`/api/admin/tenants/${id}`, { 
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${session?.access_token}` }
                    });
                    if (!res.ok) { const json = await res.json(); throw new Error(json.error || "Delete failed"); }
                    toast({ title: 'Tenant Deleted', description: 'Redirecting to list...' });
                    router.push('/admin/tenants');
                } catch (e: any) {
                    toast({ title: 'Delete Failed', description: e.message, variant: 'destructive' });
                }
            }
        });
    };

    const handleImpersonate = async () => {
        if (!data?.owner?.id) {
            toast({ title: 'No Owner', description: 'This tenant has no owner to impersonate.', variant: 'destructive' });
            return;
        }
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                toast({ title: 'Session Error', description: 'No active session. Please refresh.', variant: 'destructive' });
                return;
            }
            const res = await fetch('/api/admin/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ userId: data.owner.id })
            });
            const json = await res.json();
            
            if (!res.ok) {
                toast({ title: 'Impersonation Failed', description: json.error || 'Unknown error', variant: 'destructive' });
                return;
            }

            // Step 2: Preserve Admin session for seamless return
            if (session) {
                localStorage.setItem('mandi_admin_restore_session', JSON.stringify({
                    access_token: session.access_token,
                    refresh_token: session.refresh_token
                }));
            }

            // Aggressive teardown: delete ALL Supabase and Mandi specific tokens
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-') || key.startsWith('mandi_') && !key.includes('restore_session')) {
                    localStorage.removeItem(key);
                }
            });
            
            const redirectUrl = json.impersonateUrl || (json.accessToken ? `/dashboard#access_token=${json.accessToken}&refresh_token=${json.refreshToken}&type=magiclink` : '/dashboard');

            toast({ title: `✓ Redirecting`, description: `Entering ${data?.org?.name} workspace...` });
            
            // Mark impersonation mode BEFORE navigation
            localStorage.setItem('mandi_impersonation_mode', 'true');
            
            setTimeout(() => { window.location.href = redirectUrl; }, 500);
        } catch (e: any) {
            toast({ title: 'Impersonate Failed', description: e.message, variant: 'destructive' });
        }
    };

    const [isCreatingOwner, setIsCreatingOwner] = useState(false);

    const handleCreateOwner = async () => {
        setConfirmConfig({
            open: true,
            title: 'Generate Owner Account?',
            description: `This will create a new owner user for ${data?.org?.name} and grant them full platform access.`,
            onConfirm: async () => {
                setIsCreatingOwner(true);
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`/api/admin/tenants/${id}/owner`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${session?.access_token}` }
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || 'Failed to create owner');
                    toast({ title: 'Owner Created', description: `Auto-generated email: ${json.user.email}` });
                    fetchDetails();
                } catch (e: any) {
                    toast({ title: 'Failed to create owner', description: e.message, variant: 'destructive' });
                } finally {
                    setIsCreatingOwner(false);
                }
            }
        });
    };

    const [isAssigningOwner, setIsAssigningOwner] = useState(false);

    const handleAssignOwner = async (userId: string) => {
        setConfirmConfig({
            open: true,
            title: 'Transfer Ownership?',
            description: 'Are you sure you want to elevate this user to Owner? They will gain full administrative control over this tenant.',
            variant: 'warning',
            onConfirm: async () => {
                setIsAssigningOwner(true);
                try {
                    const { error } = await supabase.rpc('admin_assign_tenant_owner', {
                        p_org_id: id,
                        p_user_id: userId
                    });
                    if (error) throw error;
                    toast({ title: 'Ownership Transferred', description: 'The user has been elevated to Owner.' });
                    fetchDetails();
                } catch (e: any) {
                    toast({ title: 'Assignment Failed', description: e.message, variant: 'destructive' });
                } finally {
                    setIsAssigningOwner(false);
                }
            }
        });
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
    if (!data) return <div className="p-8 text-slate-900">Tenant not found.</div>;

    const { org, owner, stats } = data;

    return (
        <div className="p-8 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" className="text-slate-500 hover:text-slate-900" onClick={() => router.push('/admin/tenants')}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        {org.name}
                        <Badge className={`${org.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {org.is_active ? 'OPERATIONAL' : 'SUSPENDED'}
                        </Badge>
                        {org.status === 'trial' ? (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">FREE TRIAL</Badge>
                        ) : (
                            <Badge className={cn(
                                "border-indigo-500/20 capitalize",
                                org.billing_cycle === 'yearly' ? "bg-purple-500/10 text-purple-500" : "bg-indigo-500/10 text-indigo-600"
                            )}>
                                {org.billing_cycle || 'monthly'} Plan
                            </Badge>
                        )}
                    </h1>
                    <p className="text-slate-500 text-sm font-mono flex items-center gap-2">
                        {id}
                        {(owner?.phone || org.phone) && (
                            <>
                                <span className="text-slate-300">•</span>
                                <span className="text-indigo-600 font-black tracking-tight flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> {owner?.phone || org.phone}
                                </span>
                            </>
                        )}
                    </p>
                </div>
                <div className="ml-auto flex gap-2">
                    {isSA && (
                        <>
                            {/* Manage Subscription Dialog */}
                            <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-indigo-600/10 text-indigo-600 border border-neon-blue/30 hover:bg-indigo-600/20">
                                        <Settings className="w-4 h-4 mr-2" /> Manage Access
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-white border-slate-200 text-slate-900 sm:max-w-lg shadow-2xl rounded-3xl p-0 flex flex-col max-h-[90vh] overflow-hidden">
                                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white relative flex-shrink-0">
                                        <DialogHeader>
                                            <DialogTitle className="text-3xl font-black tracking-tight flex items-center gap-3">
                                                <ShieldCheck className="w-8 h-8" />
                                                Configure Subscription
                                            </DialogTitle>
                                            <p className="text-white/80 font-medium mt-2">Scale limits and access duration for <span className="text-white font-black underline decoration-indigo-300">{org.name}</span></p>
                                        </DialogHeader>
                                        <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
                                    </div>

                                    <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                                        <Tabs defaultValue="limits" className="w-full">
                                            <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-xl h-12">
                                                <TabsTrigger value="limits" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">Limits & Duration</TabsTrigger>
                                                <TabsTrigger value="permissions" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">Menu Access</TabsTrigger>
                                            </TabsList>
                                            
                                            <TabsContent value="limits" className="space-y-6 pt-6">
                                                {/* Plan Selection */}
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-black text-slate-500 uppercase tracking-widest flex justify-between">
                                                        <span>Base Plan Template</span>
                                                        <Badge variant="outline" className="bg-slate-50 text-[10px] text-indigo-600 border-indigo-100">SAAS-OPS</Badge>
                                                    </Label>
                                                    <Select value={override.subscription_tier} onValueChange={handlePlanSelect}>
                                                        <SelectTrigger className="bg-slate-50 border-slate-200 h-12 rounded-xl text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl rounded-xl">
                                                            {Array.from(new Set(plans.map(p => p.name))).map(name => (
                                                                <SelectItem key={name} value={name} className="capitalize font-medium py-3">{name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <p className="text-[10px] text-slate-400 font-medium">Selecting a plan pre-fills standard limits. Manual overrides are tracked as "Custom".</p>
                                                </div>

                                                {/* Billing Cycle Selection */}
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">Billing Cycle</Label>
                                                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                                                        <Button 
                                                            variant={override.billing_cycle === 'monthly' ? "default" : "ghost"}
                                                            className={`rounded-lg font-bold h-10 ${override.billing_cycle === 'monthly' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                                                            onClick={() => setOverride({ ...override, billing_cycle: 'monthly' })}
                                                        >
                                                            Monthly
                                                        </Button>
                                                        <Button 
                                                            variant={override.billing_cycle === 'yearly' ? "default" : "ghost"}
                                                            className={`rounded-lg font-bold h-10 ${override.billing_cycle === 'yearly' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                                                            onClick={() => setOverride({ ...override, billing_cycle: 'yearly' })}
                                                        >
                                                            Yearly
                                                        </Button>
                                                    </div>
                                                </div>


                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 space-y-4 shadow-sm">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2 text-amber-600">
                                                                    <div className="p-2 bg-white rounded-lg shadow-sm"><CalendarPlus className="w-4 h-4" /></div>
                                                                    <Label className="text-xs font-black uppercase tracking-tight">Extend Logic</Label>
                                                                </div>
                                                                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">+{override.extend_days} Days</Badge>
                                                            </div>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                value={override.extend_days}
                                                                onChange={e => setOverride({ ...override, extend_days: parseInt(e.target.value) || 0 })}
                                                                className="bg-white border-slate-200 text-slate-900 text-xl font-black h-12 rounded-xl text-center"
                                                            />
                                                        </div>

                                                        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 space-y-4 shadow-sm">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2 text-blue-600">
                                                                    <div className="p-2 bg-white rounded-lg shadow-sm"><Calendar className="w-4 h-4" /></div>
                                                                    <Label className="text-xs font-black uppercase tracking-tight">Set Specific Date</Label>
                                                                </div>
                                                            </div>
                                                            <Input
                                                                type="date"
                                                                value={override.trial_ends_at ? format(new Date(override.trial_ends_at), 'yyyy-MM-dd') : ''}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setOverride({ ...override, trial_ends_at: val ? new Date(val).toISOString() : null, extend_days: 0 });
                                                                }}
                                                                className="bg-white border-slate-200 text-slate-900 text-sm font-black h-12 rounded-xl text-center"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center px-4 py-3 bg-slate-900 rounded-2xl shadow-lg border border-white/10">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Final System Expiry</p>
                                                        <p className="text-sm text-neon-blue font-[900]">
                                                            {override.extend_days > 0 
                                                                ? format(addDays(new Date(override.trial_ends_at || new Date().toISOString()), override.extend_days), 'dd MMM yyyy')
                                                                : (override.trial_ends_at && override.trial_ends_at !== '')
                                                                    ? format(new Date(override.trial_ends_at), 'dd MMM yyyy')
                                                                    : 'Strictly Restricted (No Expiry Set)'}
                                                        </p>
                                                    </div>

                                                    {/* Grace Period After Expiry */}
                                                    <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-5 space-y-3 shadow-sm">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2 text-orange-600">
                                                                <div className="p-2 bg-white rounded-lg shadow-sm"><CalendarPlus className="w-4 h-4" /></div>
                                                                <Label className="text-xs font-black uppercase tracking-tight">Grace Period (Days after expiry)</Label>
                                                            </div>
                                                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-none">+{override.grace_period_days} Days</Badge>
                                                        </div>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={90}
                                                            value={override.grace_period_days}
                                                            onChange={e => setOverride({ ...override, grace_period_days: parseInt(e.target.value) || 0 })}
                                                            className="bg-white border-slate-200 text-slate-900 text-xl font-black h-12 rounded-xl text-center"
                                                        />
                                                        <p className="text-[10px] text-slate-400 font-medium">Users can log in during grace period. Access is fully blocked after it ends.</p>
                                                        {(() => {
                                                            const finalExpiry = override.extend_days > 0
                                                                ? addDays(new Date(override.trial_ends_at || new Date().toISOString()), override.extend_days)
                                                                : override.trial_ends_at ? new Date(override.trial_ends_at) : null;
                                                            return finalExpiry && override.grace_period_days > 0 ? (
                                                                <div className="flex justify-between items-center px-3 py-2 bg-orange-900/80 rounded-xl">
                                                                    <p className="text-[10px] text-orange-300 font-bold uppercase tracking-widest">Hard Lockout Date</p>
                                                                    <p className="text-sm text-orange-100 font-[900]">{format(addDays(finalExpiry, override.grace_period_days), 'dd MMM yyyy')}</p>
                                                                </div>
                                                            ) : null;
                                                        })()}
                                                    </div>
                                            </TabsContent>

                                            <TabsContent value="permissions" className="pt-6 space-y-6">
                                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-3 bg-white rounded-xl shadow-sm text-purple-600"><Smartphone className="w-5 h-5" /></div>
                                                        <div>
                                                            <Label className="text-sm font-black uppercase tracking-tight text-slate-900">Mobile App Infrastructure</Label>
                                                            <p className="text-[10px] text-slate-500 font-bold">Globally enable/disable mobile module for this tenant.</p>
                                                        </div>
                                                    </div>
                                                    <Button 
                                                        variant={override.rbac_matrix?.mobile_access ? "default" : "outline"}
                                                        className={override.rbac_matrix?.mobile_access ? "bg-purple-600 hover:bg-purple-700 font-black" : "text-slate-400 font-bold"}
                                                        onClick={() => {
                                                            const currentMatrix = override.rbac_matrix || {};
                                                            setOverride({ 
                                                                ...override, 
                                                                rbac_matrix: { ...currentMatrix, mobile_access: !currentMatrix.mobile_access } 
                                                            });
                                                        }}
                                                    >
                                                        {override.rbac_matrix?.mobile_access ? 'ENABLED' : 'DISABLED'}
                                                    </Button>
                                                </div>

                                                <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                                    <PermissionMatrix 
                                                        value={override.rbac_matrix}
                                                        onChange={(val) => setOverride({ ...override, rbac_matrix: val })}
                                                    />
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                    </div>


                                    <DialogFooter className="bg-slate-50 px-8 py-6 border-t border-slate-100 flex items-center justify-between gap-4 flex-shrink-0">
                                        <Button variant="ghost" className="text-slate-500 font-bold hover:bg-white flex-1" onClick={() => setIsManageOpen(false)}>
                                            Discard Changes
                                        </Button>
                                        <Button onClick={handleSaveSubscription} disabled={saving} className="bg-slate-900 text-white font-black hover:bg-slate-800 rounded-xl h-12 px-8 flex-1 group shadow-lg shadow-slate-900/20">
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />}
                                            Apply Configuration
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            {owner ? (
                                <Button variant="outline" className="border-neon-blue/20 text-indigo-600 hover:bg-indigo-600/10" onClick={handleImpersonate}>
                                    <Eye className="w-4 h-4 mr-2" /> Impersonate
                                </Button>
                            ) : (
                                <Button variant="outline" className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10" onClick={handleCreateOwner} disabled={isCreatingOwner}>
                                    {isCreatingOwner ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Create Owner
                                </Button>
                            )}
                            
                            <Button
                                variant="destructive" className="border-slate-200 text-slate-900 hover:bg-white/5" onClick={toggleStatus}>
                                {org.is_active ? <><PowerOff className="w-4 h-4 mr-2" /> Suspend</> : <><Power className="w-4 h-4 mr-2" /> Activate</>}
                            </Button>
                            <Button variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10" title="Instantly Lock Tenant" onClick={() => {
                                setConfirmConfig({
                                    open: true,
                                    title: 'Lock Tenant?',
                                    description: `Are you sure you want to instantly lock ${org.name}? All users will be blocked from access.`,
                                    variant: 'destructive',
                                    onConfirm: async () => {
                                        const { data: { session } } = await supabase.auth.getSession();
                                        await fetch('/api/admin/lifecycle', { method: 'POST', body: JSON.stringify({ action: 'lock', organization_id: id }), headers: { 'Authorization': `Bearer ${session?.access_token}`} });
                                        fetchDetails();
                                    }
                                });
                            }}>
                                <Lock className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" className="border-rose-500/30 text-rose-500 hover:bg-rose-500/10" title="Force Logout All Users" onClick={() => {
                                setConfirmConfig({
                                    open: true,
                                    title: 'Force Logout All Users?',
                                    description: `This will terminate all active sessions for ${org.name}. Users will need to log in again.`,
                                    variant: 'warning',
                                    onConfirm: async () => {
                                        const { data: { session } } = await supabase.auth.getSession();
                                        await fetch('/api/admin/lifecycle', { method: 'POST', body: JSON.stringify({ action: 'force_logout', organization_id: id }), headers: { 'Authorization': `Bearer ${session?.access_token}`} });
                                        toast({ title: 'Force Logout triggered for all active sessions' });
                                    }
                                });
                            }}>
                                <XCircle className="w-4 h-4" />
                            </Button>

                            <Button variant="destructive" onClick={handleDelete}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </div>

            </div>

            {/* Main Tabs */}
            <Tabs defaultValue="overview" className="mt-8">
                <TabsList className="bg-slate-100 p-1 rounded-xl">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 font-black uppercase text-[10px] tracking-widest">Vital Metrics</TabsTrigger>
                    <TabsTrigger value="users" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 font-black uppercase text-[10px] tracking-widest">Team & Access</TabsTrigger>
                    <TabsTrigger value="compliance" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 font-black uppercase text-[10px] tracking-widest">Compliance & Risk</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6 pt-6 animate-in slide-in-from-bottom-2 duration-300">
                    {/* Subscription Overview Card */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <Card className="bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-slate-500 uppercase tracking-widest flex items-center justify-between">
                                    Plan
                                    {org.status === 'trial' && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200 uppercase">Trial</Badge>}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-black text-slate-900 uppercase leading-none">{org.subscription_tier || 'None'}</p>
                                <p className="text-[10px] font-bold text-indigo-500 uppercase mt-1.5 tracking-wider">
                                    {org.status === 'trial' ? 'Free Trial Period' : `${org.billing_cycle || 'monthly'} billing cycle`}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-white shadow-sm border-slate-200">
                            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500 uppercase tracking-widest flex items-center gap-1"><Users className="w-3 h-3 text-emerald-500" /> Active Users</CardTitle></CardHeader>
                            <CardContent><p className="text-2xl font-black text-slate-900">{data?.users?.length ?? 0}</p></CardContent>
                        </Card>
                        <Card className="bg-white shadow-sm border-slate-200">
                            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500 uppercase tracking-widest flex items-center gap-1"><CalendarPlus className="w-3 h-3 text-orange-400" /> Expiry</CardTitle></CardHeader>
                            <CardContent>
                                <p className="text-sm font-black text-slate-900 truncate flex items-center gap-2">
                                    {org.current_period_end ? format(new Date(org.current_period_end), 'dd MMM yy') : 'LIFETIME'}
                                    {org.billing_cycle && (
                                        <Badge variant="outline" className="text-[10px] uppercase h-4 px-1 leading-none border-indigo-200 text-indigo-500 font-black">
                                            {org.billing_cycle}
                                        </Badge>
                                    )}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                            <CardHeader className="border-b border-slate-50 bg-slate-50/50">
                                <CardTitle className="text-sm font-black text-slate-600 uppercase tracking-widest">Market Activity</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-50">
                                    <div className="p-4 flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-500">Total Sales Recorded</span>
                                        <span className="text-lg font-black text-slate-900">{stats.sale_count}</span>
                                    </div>
                                    <div className="p-4 flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-500">Last Transaction Date</span>
                                        <span className="text-sm font-bold text-slate-900">{stats.last_sale ? format(new Date(stats.last_sale), 'PPp') : 'Never'}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden border-l-4 border-l-red-400">
                            <CardHeader className="border-b border-slate-50 bg-slate-50/50">
                                <CardTitle className="text-sm font-black text-red-600 uppercase tracking-widest">Financial Anomalies</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-50">
                                    <div className="p-4 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-red-500" />
                                            <span className="text-xs font-bold text-slate-500">Negative Party Balances</span>
                                        </div>
                                        <span className="text-lg font-black text-red-600">{stats.negative_ledger_count} Party</span>
                                    </div>
                                    <div className="p-4 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <Box className="w-4 h-4 text-orange-500" />
                                            <span className="text-xs font-bold text-slate-500">Stock Discrepancies</span>
                                        </div>
                                        <span className="text-lg font-black text-orange-600">{stats.negative_stock_count} Lots</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="users" className="pt-6 animate-in slide-in-from-right-2 duration-400">
                    <Card className="bg-white shadow-sm border-slate-200">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50">
                            <div>
                                <CardTitle className="text-lg font-black text-slate-900 tracking-tight">Team Roster & Security</CardTitle>
                                <p className="text-xs text-slate-500 font-bold">Manage employee records and system access levels.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="text-slate-500 h-9" 
                                    onClick={() => fetchDetails()}
                                    disabled={loading}
                                    title="Refresh Roster"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </Button>
                                {isSA && (
                                    <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                                        <DialogTrigger asChild>
                                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl h-9">
                                                <Plus className="w-4 h-4 mr-1.5" /> Provision User
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-white border-slate-200">

                                    <DialogHeader>
                                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Provision Tenant User</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Full Name</Label>
                                            <Input value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} className="bg-slate-50" placeholder="e.g. Salim Merchant" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">System Email (Login UID)</Label>
                                            <Input value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="bg-slate-50 font-mono" placeholder="salim@mandi.com" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Initial Password</Label>
                                            <Input value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="bg-slate-50 font-mono" placeholder="••••••••" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Access Role</Label>
                                            <Select value={newUser.role} onValueChange={val => setNewUser({...newUser, role: val})}>
                                                <SelectTrigger className="bg-slate-50">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="tenant_admin">Tenant Admin (Owner)</SelectItem>
                                                    <SelectItem value="member">Staff Member (Limited)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleAdminCreateUser} disabled={isCreatingUser} className="w-full bg-indigo-600 text-white font-black uppercase py-6 rounded-2xl">
                                            {isCreatingUser ? <Loader2 className="animate-spin w-5 h-5" /> : 'Activate User Infrastructure'}
                                        </Button>
                                    </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                                )}
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-50">
                                {data?.employees?.length > 0 ? (
                                    data.employees.map((emp: any) => {
                                        const linkedUser = data.users?.find((u: any) => u.id === emp.user_id);
                                        return (
                                            <div key={emp.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-100">
                                                        {emp.name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-black text-slate-900">{emp.name}</p>
                                                            {linkedUser && (
                                                                <Badge className="text-[9px] font-black uppercase bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                                                                    <ShieldCheck className="w-2.5 h-2.5 mr-1" /> ACCESS ACTIVE
                                                                </Badge>
                                                            )}
                                                            <Badge variant="outline" className="text-[9px] font-black uppercase bg-slate-50 text-slate-500">{emp.designation || 'Staff'}</Badge>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <p className="text-xs text-slate-400 font-bold">{emp.email || 'No email provided'}</p>
                                                            {(emp.phone || linkedUser?.phone) && (
                                                                <>
                                                                    <span className="text-[10px] text-slate-300">•</span>
                                                                    <p className="text-xs text-indigo-500 font-black">{emp.phone || linkedUser.phone}</p>
                                                                </>
                                                            )}
                                                            <span className="text-[10px] text-slate-300">•</span>
                                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{emp.department || 'General'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
                                                        {linkedUser && isSA && (
                                                            <>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="border-slate-200 text-slate-900 font-black uppercase text-[9px] tracking-widest h-9 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
                                                                    onClick={() => setMemberManage({ 
                                                                        open: true, 
                                                                        user: linkedUser, 
                                                                        isPermissions: true, 
                                                                        tempMatrix: linkedUser.rbac_matrix || {} 
                                                                    })}
                                                                >
                                                                    <Shield className="w-3.5 h-3.5 mr-1.5 text-indigo-500" /> Permissions
                                                                </Button>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="border-slate-200 text-slate-900 font-black uppercase text-[9px] tracking-widest h-9 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
                                                                    onClick={() => setMemberManage({ open: true, user: linkedUser, newPassword: 'mandi' + Math.floor(Math.random()*1000), isResetting: false })}
                                                                >
                                                                    <Key className="w-3.5 h-3.5 mr-1.5" /> Reset Pass
                                                                </Button>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="border-rose-100 text-rose-500 font-black uppercase text-[9px] tracking-widest h-9 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                                                    onClick={() => {
                                                                        setConfirmConfig({
                                                                            open: true,
                                                                            title: 'Revoke System Access?',
                                                                            description: `This will permanently delete ${emp.name}'s login credentials. The HR record will remain intact.`,
                                                                            variant: 'destructive',
                                                                            onConfirm: async () => {
                                                                                const { data: { session } } = await supabase.auth.getSession();
                                                                                const res = await fetch('/api/admin/delete-user', {
                                                                                    method: 'POST',
                                                                                    headers: {
                                                                                        'Content-Type': 'application/json',
                                                                                        'Authorization': `Bearer ${session?.access_token}`
                                                                                    },
                                                                                    body: JSON.stringify({ userId: linkedUser.id, organizationId: id })
                                                                                });
                                                                                if (res.ok) {
                                                                                    toast({ title: 'Access Revoked', description: 'User account has been purged.'});
                                                                                    fetchDetails();
                                                                                }
                                                                            }
                                                                        });
                                                                    }}
                                                                >
                                                                    <Ban className="w-3.5 h-3.5 mr-1.5" /> Revoke
                                                                </Button>
                                                            </>
                                                        )}
                                                        {isSA && (
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="border-red-200 bg-red-50 text-red-600 font-black uppercase text-[9px] tracking-widest h-9 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                                                onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Purge Record
                                                            </Button>
                                                        )}
                                                    </div>

                                            </div>
                                        );
                                    })
                                ) : (
                                    data?.users?.map((user: any) => (
                                        <div key={user.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-white text-lg">
                                                    {user.full_name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-black text-slate-900">{user.full_name}</p>
                                                        <Badge variant="outline" className="text-[9px] font-black uppercase bg-slate-50 text-slate-500">{user.role}</Badge>
                                                    </div>
                                                    <p className="text-xs text-slate-500 font-bold">{user.email}</p>
                                                    {user.phone && <p className="text-[10px] text-indigo-500 font-black mt-0.5">{user.phone}</p>}
                                                </div>
                                            </div>
                                            {isSA && (
                                                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="border-slate-200 text-slate-900 font-black uppercase text-[9px] tracking-widest rounded-xl hover:bg-slate-900 hover:text-white transition-all"
                                                        onClick={() => setMemberManage({ open: true, user, newPassword: 'mandi' + Math.floor(Math.random()*1000), isResetting: false })}
                                                    >
                                                        <Key className="w-3.5 h-3.5 mr-1.5" /> Reset Password
                                                    </Button>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="border-rose-100 text-rose-500 font-black uppercase text-[9px] tracking-widest rounded-xl hover:bg-rose-500 hover:text-white transition-all"
                                                        onClick={() => {
                                                            setConfirmConfig({
                                                                open: true,
                                                                title: 'Revoke Security Credentials?',
                                                                description: `This will permanently delete ${user.full_name}'s login credentials. This action cannot be undone.`,
                                                                variant: 'destructive',
                                                                onConfirm: async () => {
                                                                    const { data: { session } } = await supabase.auth.getSession();
                                                                    const res = await fetch('/api/admin/delete-user', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                            'Authorization': `Bearer ${session?.access_token}`
                                                                        },
                                                                        body: JSON.stringify({ userId: user.id, organizationId: id })
                                                                    });
                                                                    if (res.ok) {
                                                                        toast({ title: 'Access Revoked', description: 'User has been purged from the system.'});
                                                                        fetchDetails();
                                                                    }
                                                                    }
                                                                });
                                                            }}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Purge
                                                        </Button>
                                                    </div>
                                            )}

                                            </div>
                                        ))
                                    )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={memberManage.open} onOpenChange={(o) => setMemberManage(prev => ({ ...prev, open: o }))}>
                <DialogContent className="bg-white border-slate-200 p-0 overflow-hidden rounded-[32px] shadow-2xl max-w-lg">
                    {memberManage.isPermissions ? (
                        <>
                            <div className="bg-indigo-600 p-8 text-white relative">
                                <DialogHeader>
                                    <DialogTitle className="text-3xl font-[1000] uppercase tracking-tighter flex items-center gap-3">
                                        <Shield className="w-8 h-8" />
                                        User Permissions
                                    </DialogTitle>
                                    <p className="text-indigo-100 font-bold mt-1">Configuring granular access for {memberManage.user?.full_name}.</p>
                                </DialogHeader>
                                <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
                            </div>
                            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6">
                                    <p className="text-[11px] text-amber-800 font-bold uppercase tracking-widest flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" /> Security Override
                                    </p>
                                    <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                                        Individual user permissions are combined with Organization-level restrictions. If a module is disabled for the entire tenant, it remains disabled even if granted here.
                                    </p>
                                </div>
                                <PermissionMatrix 
                                    value={memberManage.tempMatrix}
                                    onChange={(m) => setMemberManage({ ...memberManage, tempMatrix: m })}
                                />
                            </div>
                            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100 flex gap-3">
                                <Button variant="ghost" onClick={() => setMemberManage({ open: false, user: null })} className="flex-1 font-bold text-slate-500">Discard</Button>
                                <Button onClick={handleSaveUserPermissions} disabled={isActioning} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase shadow-lg shadow-indigo-600/20">
                                    {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Permissions'}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                        <div className="bg-slate-900 p-8 text-white">
                            <DialogHeader>
                                <DialogTitle className="text-3xl font-[1000] uppercase tracking-tighter">Security Override</DialogTitle>
                                <p className="text-slate-400 font-bold mt-1">Force-resetting password for {memberManage.user?.full_name}.</p>
                            </DialogHeader>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">New System Password</Label>
                                <div className="relative">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <Input 
                                        value={memberManage.newPassword} 
                                        onChange={e => setMemberManage({...memberManage, newPassword: e.target.value})}
                                        className="bg-slate-50 border-slate-100 h-14 pl-12 font-mono text-lg font-black text-slate-900 rounded-2xl" 
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-700 font-bold leading-relaxed">
                                    RESETTING A PASSWORD IS A DESTRUCTIVE ACTION. THE USER WILL BE LOGGED OUT OF ALL SESSIONS IMMEDIATELY.
                                </p>
                            </div>
                        </div>
                        <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
                            <Button onClick={handleResetPassword} disabled={memberManage.isResetting} className="w-full bg-slate-900 text-white font-[1000] uppercase tracking-widest py-8 rounded-[24px] shadow-2xl hover:bg-black transition-all">
                                {memberManage.isResetting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirm Reset & Notify'}
                            </Button>
                        </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Vital Signs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Account Info */}
                <Card className="bg-white shadow-sm border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-widest">Ownership</CardTitle>

                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-slate-900 font-bold">{owner?.full_name?.[0]}</div>
                            <div>
                                <p className="text-slate-900 font-bold flex items-center gap-2">
                                    {owner?.full_name || 'No Owner'}
                                    {owner?.username && <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">@{owner.username}</span>}
                                </p>
                                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                                    {owner?.email}
                                    {(owner?.phone || org.phone) && <span className="text-indigo-500 font-black tracking-tighter ml-1 underline decoration-indigo-200/50 underline-offset-4">☏ {owner?.phone || org.phone}</span>}
                                </p>
                                {owner?.role === 'user' && <Badge className="mt-1 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-[9px]">FALLBACK OP</Badge>}
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 space-y-2">
                            <div className="pt-2 border-t border-slate-200">
                                <p className="mb-1">Organization UUID:</p>
                                <div className="flex items-center gap-2">
                                    <code className="bg-white text-slate-500 p-1 rounded font-mono text-[10px] break-all select-all">{org.id}</code>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-900" onClick={() => { navigator.clipboard.writeText(org.id); toast({ title: "Copied UUID" }); }}>
                                        <span className="sr-only">Copy</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Health */}
                <Card className="bg-white shadow-sm border-slate-200 relative group">
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="secondary" className="h-6 text-[10px]" onClick={() => router.push(`/admin/support?id=${id}`)}>
                            <Activity className="w-3 h-3 mr-1" /> Open Console
                        </Button>
                    </div>
                    <CardHeader><CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-widest">Health Score</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                            <span className="text-sm text-slate-500">Ledger Integrity</span>
                            {stats.negative_ledger_count === 0 ? (
                                <Badge className="bg-green-500/10 text-green-500"><ShieldCheck className="w-3 h-3 mr-1" /> Perfect</Badge>
                            ) : (
                                <Badge className="bg-orange-500/10 text-orange-500"><AlertTriangle className="w-3 h-3 mr-1" /> {stats.negative_ledger_count} Risks</Badge>
                            )}
                        </div>
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                            <span className="text-sm text-slate-500">Stock Sync</span>
                            {stats.negative_stock_count === 0 ? (
                                <Badge className="bg-green-500/10 text-green-500"><ShieldCheck className="w-3 h-3 mr-1" /> Perfect</Badge>
                            ) : (
                                <Badge className="bg-red-500/10 text-red-500"><AlertTriangle className="w-3 h-3 mr-1" /> {stats.negative_stock_count} Errors</Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Activity */}
                <Card className="bg-white shadow-sm border-slate-200">
                    <CardHeader><CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-widest">Activity Pulse</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-center py-4">
                            <h3 className="text-4xl font-black text-slate-900">{stats.sale_count}</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase mt-1">Total Transactions</p>
                        </div>
                        <div className="text-center border-t border-slate-200 pt-4">
                            <p className="text-xs text-slate-500">Last Active</p>
                            <p className="text-slate-900 font-mono">{stats.last_sale ? format(new Date(stats.last_sale), 'PP p') : 'Never'}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <ConfirmationDialog
                open={confirmConfig.open}
                onOpenChange={(open) => setConfirmConfig({ ...confirmConfig, open })}
                title={confirmConfig.title}
                description={confirmConfig.description}
                onConfirm={confirmConfig.onConfirm}
                variant={confirmConfig.variant}
            />

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
