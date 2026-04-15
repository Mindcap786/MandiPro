'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Mail, Trash2, Shield, User, AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff, Calendar, Settings, ShieldCheck, ShieldAlert, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import { cn } from '@/lib/utils';
import { isNativePlatform } from '@/lib/capacitor-utils';
import { NativeCard } from '@/components/mobile/NativeCard';
import { NativeSectionLabel } from '@/components/mobile/NativeInput';
import { BottomSheet } from '@/components/mobile/BottomSheet';
import { snackbar } from '@/components/mobile/Snackbar';

export default function TeamPage() {
    const { profile } = useAuth();
    const [members, setMembers] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [planLimit, setPlanLimit] = useState<{ current: number; max: number | string; plan: string } | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null); // null = loading

    // Auth Form (Authorized Employee)
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [authEmail, setAuthEmail] = useState('');
    const [authUsername, setAuthUsername] = useState('');
    const [password, setPassword] = useState('mandi123');
    const [showPassword, setShowPassword] = useState(false);
    const [userType, setUserType] = useState('web');
    const [sending, setSending] = useState(false);
    const [authError, setAuthError] = useState<{ title: string; message: string } | null>(null);
    const [authRbacMatrix, setAuthRbacMatrix] = useState<Record<string, boolean>>({
        'nav.field_governance': false,
        'nav.trading_pl': false
    });
    const [orgLimits, setOrgLimits] = useState<any>(null);

    const [revokeConfig, setRevokeConfig] = useState({
        open: false,
        user: null as any,
        isRevoking: false
    });

    // RBAC Modal (Manage Existing)
    const [rbacUser, setRbacUser] = useState<any>(null);
    const [rbacMatrix, setRbacMatrix] = useState<any>({});
    const [rbacUserType, setRbacUserType] = useState('web');
    const [savingRbac, setSavingRbac] = useState(false);

    useEffect(() => {
        if (profile) {
            const isAdmin = profile.role === 'tenant_admin' || profile.role === 'owner' || profile.role === 'super_admin' || profile.role === 'company_admin';
            const hasTeamAccess = profile.rbac_matrix?.['nav.team_access'] === true;
            
            const authorized = isAdmin || hasTeamAccess;
            setIsAuthorized(authorized);
            
            if (authorized && profile.organization_id) {
                fetchTeam();
            }
        }
    }, [profile]);

    const fetchTeam = async () => {
        setLoading(true);

        // 1. Fetch current users (profiles)
        const { data: memberData } = await supabase
            .schema('core')
            .from('profiles')
            .select('*')
            .eq('organization_id', profile?.organization_id);

        // 2. Fetch all employees from Master Data
        const { data: employeeData } = await supabase
            .schema('mandi')
            .from('employees')
            .select('id, name, email, role, user_id, status')
            .eq('organization_id', profile?.organization_id);

        if (memberData) setMembers(memberData);
        if (employeeData) setEmployees(employeeData);

        // 3. Fetch current plan limit stats
        if (profile?.organization_id) {
            const { data: limitData } = await supabase
                .schema('core')
                .rpc('check_user_limit', { p_organization_id: profile.organization_id, p_user_type: 'web' });
            
            const { data: orgData } = await supabase
                .schema('core')
                .from('organizations')
                .select('max_web_users, max_mobile_users, rbac_matrix')
                .eq('id', profile.organization_id)
                .single();

            if (limitData) {
                setPlanLimit({ 
                    current: limitData.current ?? memberData?.length ?? 0, 
                    max: limitData.max ?? 'unlimited', 
                    plan: limitData.plan ?? '' 
                });
            }
            if (orgData) {
                setOrgLimits(orgData);
            }
        }
        setLoading(false);
    };

    const handleAuthorize = async (e: React.FormEvent) => {
        e.preventDefault();
        const emp = employees.find(e => e.id === selectedEmployeeId);
        if (!emp) return;

        setSending(true);

        try {
            if (!selectedEmployeeId) throw new Error('Please select an employee first.');
            if (!authEmail) throw new Error('Login email is required.');
            if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

            // Check if mobile access is being granted but not enabled
            const isMobile = userType === 'mobile';
            if (isMobile && (!orgLimits?.rbac_matrix?.mobile_access || (orgLimits?.max_mobile_users || 0) <= 0)) {
                throw new Error('Mobile Access is not enabled for your organization. Please contact support.');
            }

            // 0. GET AUTH TOKEN
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    email: authEmail,
                    password,
                    fullName: emp.name,
                    orgId: profile?.organization_id,
                    role: 'member', // Default staff role
                    employeeId: emp.id, // Pass employeeId to link them in the background
                    userType: userType, // Pass userType (web/mobile)
                    username: authUsername // Pass the new UserID
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Authorization failed.');

            // Once user created, update their matrix permissions
            if (result.userId) {
                await supabase.schema('core')
                    .from('profiles')
                    .update({ rbac_matrix: authRbacMatrix })
                    .eq('id', result.userId);
            }

            toast.success(`Access granted to ${emp.name} successfully!`);
            setSelectedEmployeeId('');
            setPassword('mandi123');
            setOpen(false);
            fetchTeam();
        } catch (error: any) {
            const msg = error.message || 'Authorization failed.';
            // Provide a user-friendly title based on the error message
            let title = 'Authorization Failed';
            if (msg.toLowerCase().includes('email')) title = 'Email Already in Use';
            else if (msg.toLowerCase().includes('userid') || msg.toLowerCase().includes('username')) title = 'UserID Already Taken';
            else if (msg.toLowerCase().includes('limit')) title = 'Seat Limit Reached';
            setAuthError({ title, message: msg });
        } finally {
            setSending(false);
        }
    };

    const handleSaveRbac = async () => {
        if (!rbacUser) return;
        setSavingRbac(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/admin/update-permissions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    targetUserId: rbacUser.id,
                    rbacMatrix: rbacMatrix,
                    userType: rbacUserType
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to update permissions.');

            toast.success('Permissions updated successfully.');
            setRbacUser(null);
            
            // Refresh local members state for instant update
            setMembers(prev => prev.map(m => m.id === rbacUser.id ? { ...m, rbac_matrix: rbacMatrix } : m));
            fetchTeam();
        } catch (error: any) {
            toast.error('Failed to save permissions: ' + error.message);
        } finally {
            setSavingRbac(false);
        }
    };

    const handleRevokeAccess = async () => {
        if (!revokeConfig.user) return;
        setRevokeConfig(prev => ({ ...prev, isRevoking: true }));

        try {
            // 0. GET AUTH TOKEN
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    userId: revokeConfig.user.id, 
                    organizationId: revokeConfig.user.organization_id 
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            toast.success(`Access for ${revokeConfig.user.full_name} has been revoked.`);
            setRevokeConfig({ open: false, user: null, isRevoking: false });
            fetchTeam();
        } catch (error: any) {
            toast.error('Failed to revoke access: ' + error.message);
        } finally {
            setRevokeConfig(prev => ({ ...prev, isRevoking: false }));
        }
    };

    // Filter employees who do NOT have web access yet
    const unlinkedEmployees = employees.filter(emp => !emp.user_id && emp.status === 'active');

    return (
        <div className={cn(
            "min-h-screen bg-[#F8FAFC]",
            isNativePlatform() ? "pb-24" : "p-8 pb-32"
        )}>
            {isNativePlatform() ? (
                <div className="space-y-6">
                    {/* Header Summary */}
                    <div className="bg-white px-4 py-6 border-b border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                <Shield className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-slate-900 tracking-tight">Team Access</h1>
                                <p className="text-xs text-slate-500 font-medium">Manage logins & permissions</p>
                            </div>
                        </div>

                        {planLimit && (
                            <div className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black border uppercase tracking-widest",
                                planLimit.max !== 'unlimited' && planLimit.current >= Number(planLimit.max)
                                    ? 'bg-red-50 border-red-100 text-red-700'
                                    : 'bg-blue-50 border-blue-100 text-blue-700'
                            )}>
                                {planLimit.current} Active {planLimit.max !== 'unlimited' ? `/ ${planLimit.max} Seats` : 'Users'} · {planLimit.plan}
                            </div>
                        )}
                    </div>

                    {/* Authorized Team Members */}
                    <div className="px-4 space-y-3">
                        <NativeSectionLabel>Authorized Team ({members.length})</NativeSectionLabel>
                        <NativeCard divided>
                            {loading ? (
                                <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
                            ) : members.length === 0 ? (
                                <div className="p-10 text-center text-slate-400 text-xs font-bold uppercase">No authorized members</div>
                            ) : (
                                members.map(member => (
                                    <div key={member.id} className="flex items-center gap-3 px-4 py-4 active:bg-slate-50 transition-colors">
                                        <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-lg shadow-sm">
                                            {member.full_name?.[0]?.toUpperCase() || <User className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-900 truncate leading-tight">
                                                {member.full_name || 'Staff User'}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <p className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]">{member.email}</p>
                                                {member.username && (
                                                    <p className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">@{member.username}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <Badge className={cn(
                                                "text-[8px] font-black uppercase tracking-widest h-5 rounded-md border-none",
                                                member.role === 'owner' ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700"
                                            )}>
                                                {member.role}
                                            </Badge>
                                            <button 
                                                onClick={() => {
                                                    setRbacUser(member);
                                                    setRbacMatrix(member.rbac_matrix || {});
                                                    setRbacUserType(member.user_type || 'web');
                                                }}
                                                className="p-2 text-slate-400 hover:text-blue-600 active:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </NativeCard>
                    </div>

                    {/* Inactive Employees Section */}
                    <div className="px-4 space-y-3 pb-8">
                        <NativeSectionLabel>Inactive in System ({unlinkedEmployees.length})</NativeSectionLabel>
                        <div className="space-y-3">
                            {unlinkedEmployees.length === 0 && !loading ? (
                                <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center bg-white/50">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                                    <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">All set!</p>
                                </div>
                            ) : (
                                unlinkedEmployees.map(emp => (
                                    <NativeCard key={emp.id} className="p-4 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-400 shadow-sm border border-slate-200">
                                                {emp.name?.[0].toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm text-slate-900 truncate leading-tight">{emp.name}</p>
                                                <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest text-slate-400 border-slate-200 mt-1 h-4">
                                                    No System Access
                                                </Badge>
                                            </div>
                                        </div>
                                        <button 
                                            className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-transform"
                                            onClick={() => { 
                                                setSelectedEmployeeId(emp.id); 
                                                setAuthEmail(emp.email || '');
                                                setOpen(true); 
                                            }}
                                        >
                                            Grant Login
                                        </button>
                                    </NativeCard>
                                ))
                            )}
                        </div>
                    </div>

                    {/* FAB: Authorize Employee */}
                    <div className="fixed bottom-6 right-6 z-50">
                        <Button 
                            className="bg-blue-600 text-white hover:bg-blue-700 font-black uppercase tracking-widest h-14 w-14 rounded-full shadow-2xl flex items-center justify-center"
                            onClick={() => setOpen(true)}
                        >
                            <UserPlus className="w-6 h-6" />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="max-w-6xl mx-auto space-y-12">
                
                {isAuthorized === false ? (
                    <div className="min-h-[60vh] flex flex-col items-center justify-center bg-white rounded-[40px] border border-slate-200 shadow-xl p-12 text-center">
                        <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-8">
                            <ShieldAlert className="w-12 h-12 text-red-500" />
                        </div>
                        <h1 className="text-4xl font-[1000] text-black tracking-tighter uppercase mb-4">Access Denied</h1>
                        <p className="text-slate-500 font-bold max-w-md mx-auto">
                            You do not have administrative privileges to manage team access. Only organization owners can view and modify team permissions.
                        </p>
                        <Button 
                            className="mt-8 bg-black text-white hover:bg-slate-800 font-black uppercase tracking-widest h-14 px-8 rounded-2xl"
                            onClick={() => window.location.href = '/dashboard'}
                        >
                            Return to Dashboard
                        </Button>
                    </div>
                ) : (
                    <>
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/30 rounded-full blur-3xl -mr-32 -mt-32" />
                    <div className="relative z-10">
                        <h1 className="text-4xl font-[1000] text-black tracking-tighter uppercase flex items-center gap-3">
                            <Shield className="w-10 h-10 text-blue-600" />
                            Team <span className="text-blue-600">Access</span>
                        </h1>
                        <p className="text-slate-500 font-bold mt-1">Manage logins and permissions for your employees.</p>
                        {planLimit && (
                            <div className={`flex items-center gap-2 mt-4 px-3 py-1.5 rounded-xl text-[10px] font-black border w-fit uppercase tracking-widest ${
                                planLimit.max !== 'unlimited' && planLimit.current >= Number(planLimit.max)
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                                {planLimit.max !== 'unlimited' && planLimit.current >= Number(planLimit.max) && (
                                    <AlertTriangle className="w-3 h-3" />
                                )}
                                {planLimit.current} Active {planLimit.max !== 'unlimited' ? `/ ${planLimit.max} Seats` : 'Users'} · {planLimit.plan}
                            </div>
                        )}
                    </div>

                    <Dialog open={open} onOpenChange={(o) => {
                        setOpen(o);
                        if (!o) {
                            setSelectedEmployeeId('');
                            setAuthEmail('');
                            setAuthUsername('');
                            setPassword('mandi123');
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button className="bg-black text-white hover:bg-slate-800 font-black uppercase tracking-widest h-14 px-8 rounded-2xl shadow-xl transition-all active:scale-95 group">
                                <UserPlus className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" /> 
                                Authorize Employee
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border-slate-200 text-black sm:max-w-xl rounded-[40px] p-0 overflow-hidden max-h-[90vh] flex flex-col shadow-2xl">
                            <div className="bg-blue-600 p-8 text-white shrink-0">
                                <DialogHeader>
                                    <DialogTitle className="text-3xl font-[1000] uppercase tracking-tighter">Grant System Access</DialogTitle>
                                    <p className="text-blue-100 font-bold mt-1 text-sm">Pick an employee from your register and set their login.</p>
                                </DialogHeader>
                            </div>
                            
                            <form onSubmit={handleAuthorize} className="flex flex-col flex-1 min-h-0">
                                <div className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar pb-10">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pick Employee (Active only)</Label>
                                        <Select 
                                            value={selectedEmployeeId} 
                                            onValueChange={(val) => {
                                                setSelectedEmployeeId(val);
                                                const emp = unlinkedEmployees.find(e => e.id === val);
                                                if (emp) setAuthEmail(emp.email || '');
                                            }}
                                        >
                                            <SelectTrigger className="bg-slate-50 border-slate-200 h-14 rounded-2xl text-black font-black text-lg">
                                                <SelectValue placeholder="Select an employee..." />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white border-slate-200 rounded-2xl">
                                                {unlinkedEmployees.length > 0 ? (
                                                    unlinkedEmployees.map(emp => (
                                                        <SelectItem key={emp.id} value={emp.id} className="font-bold py-3">
                                                            {emp.name} {emp.email && <span className="text-slate-400 font-normal ml-2 text-[10px]">({emp.email})</span>}
                                                        </SelectItem>
                                                    ))
                                                ) : (
                                                    <div className="p-4 text-center text-sm text-slate-500 font-bold">No unauthorized active employees found.<br/><span className="text-[10px] font-normal">Add them in Master Data {' > '} Employees first.</span></div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Login Email (Required for Login)</Label>
                                        <Input
                                            type="email"
                                            placeholder="Enter login email..."
                                            value={authEmail}
                                            onChange={e => setAuthEmail(e.target.value)}
                                            className="bg-slate-50 border-slate-200 h-14 rounded-2xl text-black font-black text-lg"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-blue-600">Global UserID / Login Nickname</Label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">@</span>
                                            <Input
                                                placeholder="e.g. malik786"
                                                value={authUsername}
                                                onChange={e => setAuthUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                                                className="bg-slate-50 border-slate-200 h-14 rounded-2xl text-black font-black text-lg pl-9"
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold italic">User can login using this ID instead of their email.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Set Initial Password</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showPassword ? "text" : "password"}
                                                    value={password}
                                                    onChange={e => setPassword(e.target.value)}
                                                    className="bg-slate-50 border-slate-200 h-12 rounded-xl text-black font-bold pr-10"
                                                    required
                                                />
                                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">System Access</Label>
                                            <div className="h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center px-4 gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Unified Access (Web + Mobile)</span>
                                            </div>
                                            <p className="text-[9px] text-slate-400 font-bold italic">* One identity for both platforms. Strictly one active session allowed at a time.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">System Permissions</Label>
                                        <div className="max-h-[300px] overflow-y-auto pr-1">
                                            <PermissionMatrix 
                                                value={authRbacMatrix}
                                                onChange={setAuthRbacMatrix}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 bg-white border-t border-slate-100 shrink-0">
                                    <Button type="submit" disabled={sending || !selectedEmployeeId} className="w-full bg-blue-600 text-white hover:bg-blue-700 font-[900] uppercase tracking-widest h-14 rounded-2xl shadow-lg transition-all active:scale-95 group">
                                        {sending ? <Loader2 className="animate-spin" /> : <><CheckCircle2 className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" /> Confirm & Authorize</>}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Auth Error Dialog - shown when authorize fails */}
                    <Dialog open={!!authError} onOpenChange={(o) => !o && setAuthError(null)}>
                        <DialogContent className="bg-white border-slate-200 p-0 overflow-hidden rounded-[32px] shadow-2xl sm:max-w-md">
                            <div className="bg-red-600 p-8 text-white">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-[1000] uppercase tracking-tighter flex items-center gap-3">
                                        <AlertTriangle className="w-7 h-7" />
                                        {authError?.title}
                                    </DialogTitle>
                                </DialogHeader>
                            </div>
                            <div className="p-8 space-y-5">
                                <p className="text-slate-700 font-bold leading-relaxed">{authError?.message}</p>
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                    <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 mb-1">What to do</p>
                                    <p className="text-[12px] text-amber-600 font-bold leading-relaxed">
                                        {authError?.title.includes('Email') 
                                            ? 'Please change the Login Email to one that has not been used by any other employee in the system.'
                                            : authError?.title.includes('UserID')
                                            ? 'Please choose a different @UserID. Try adding numbers or initials to make it unique (e.g. @raju2, @ahamed_sales).'
                                            : 'Please check your plan or contact your administrator to resolve this issue.'}
                                    </p>
                                </div>
                                <Button 
                                    className="w-full h-12 bg-black text-white rounded-2xl font-black uppercase tracking-widest"
                                    onClick={() => setAuthError(null)}
                                >
                                    Got It, Fix Now
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Active Team Members */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                Authorized Team <Badge className="bg-blue-600 text-white border-none h-5 px-1.5 min-w-[20px] justify-center">{members.length}</Badge>
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {loading ? <div className="col-span-full flex justify-center py-12"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div> :
                                members.map(member => (
                                    <div key={member.id} className="p-5 bg-white border border-slate-200 rounded-[32px] flex flex-col justify-between group hover:border-blue-400 hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-slate-50/50">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center font-[1000] text-white text-xl shadow-lg shadow-blue-200">
                                                    {member.full_name?.[0]?.toUpperCase() || <User className="w-7 h-7" />}
                                                </div>
                                                <div>
                                                    <p className="font-black text-black text-lg tracking-tight leading-tight">{member.full_name || 'Incognito User'}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <p className="text-[10px] text-slate-400 font-bold truncate max-w-[150px]">{member.email}</p>
                                                        {member.username && (
                                                            <>
                                                                <span className="text-[10px] text-slate-300">•</span>
                                                                <p className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">@{member.username}</p>
                                                            </>
                                                        )}
                                                        <span className="text-[10px] text-slate-300">•</span>
                                                        <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                                            <Calendar className="w-2.5 h-2.5" /> Joined {member.created_at ? format(new Date(member.created_at), 'MMM yyyy') : 'Recently'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <Badge className={cn(
                                                "text-[9px] font-black uppercase tracking-widest h-6 rounded-lg",
                                                member.role === 'owner' ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700"
                                            )}>
                                                {member.role}
                                            </Badge>
                                        </div>
                                        
                                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                                            <div className="flex gap-1.5 items-center">
                                                {member.is_active !== false ? (
                                                    <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                                                        <CheckCircle2 className="w-3 h-3" /> System Active
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[10px] font-black text-red-600 uppercase tracking-tighter bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                                                        <XCircle className="w-3 h-3" /> Suspended
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="flex gap-2 items-center">
                                                {member.role !== 'tenant_admin' && member.role !== 'owner' && (
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-9 w-9 p-0 text-red-100 hover:text-red-500 hover:bg-red-50 rounded-xl"
                                                        onClick={() => setRevokeConfig({ open: true, user: member, isRevoking: false })}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                {(member.role === 'tenant_admin' || member.role === 'owner') ? (
                                                    <div
                                                        className="h-9 px-3 flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 cursor-not-allowed"
                                                        title="Admin accounts cannot be permission-edited"
                                                    >
                                                        <Lock className="w-3.5 h-3.5" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Protected</span>
                                                    </div>
                                                ) : (
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-9 w-9 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl"
                                                        onClick={() => {
                                                            setRbacUser(member);
                                                            setRbacMatrix(member.rbac_matrix || {});
                                                            setRbacUserType(member.user_type || 'web');
                                                        }}
                                                    >
                                                        <Settings className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Pending Actions / Unassigned */}
                    <div className="space-y-6">
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                           Inactive in System <Badge variant="outline" className="text-slate-500 border-slate-200 bg-white h-5 px-1.5">{unlinkedEmployees.length}</Badge>
                        </h2>
                        <div className="space-y-4">
                            {unlinkedEmployees.length === 0 && !loading && (
                                <div className="p-12 border-2 border-dashed border-slate-200 rounded-[40px] text-center bg-white/50">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
                                        <CheckCircle2 className="w-8 h-8 text-emerald-300" />
                                    </div>
                                    <p className="text-slate-500 font-bold text-sm">All set!</p>
                                    <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-1">Everyone has system access.</p>
                                </div>
                            )}
                            {unlinkedEmployees.map(emp => (
                                <div key={emp.id} className="p-5 bg-white border border-slate-200 rounded-3xl flex flex-col gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-300 group">
                                    <div className="flex justify-between items-start">
                                        <div className="flex gap-3 items-center">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center font-bold text-slate-400">
                                                {emp.name?.[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-sm text-black">{emp.name}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{emp.role}</p>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="text-[9px] font-bold text-slate-400 border-slate-200">
                                            No Login
                                        </Badge>
                                    </div>
                                    <Button size="sm" className="w-full bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest h-10 group-hover:bg-indigo-600 transition-colors" 
                                        onClick={() => { 
                                            setSelectedEmployeeId(emp.id); 
                                            setAuthEmail(emp.email || '');
                                            setOpen(true); 
                                        }}>
                                        Grant System Access
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            {/* RBAC Visual Matrix Modal */}
            <Dialog open={!!rbacUser} onOpenChange={(o) => !o && setRbacUser(null)}>
                <DialogContent className="sm:max-w-2xl bg-white border-slate-200 shadow-2xl rounded-[40px] p-0 overflow-hidden">
                    <div className="bg-black p-10 flex items-center justify-between text-white relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl -mr-16 -mt-16" />
                        <div className="relative z-10">
                            <DialogTitle className="text-3xl font-[1000] tracking-tighter uppercase italic leading-none">Security <span className="text-blue-500">Matrix</span></DialogTitle>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">{rbacUser?.full_name} • {rbacUser?.email}</p>
                        </div>
                        <Shield className="w-12 h-12 text-blue-500 relative z-10 animate-pulse" />
                    </div>
                    <div className="p-10 space-y-8 max-h-[65vh] overflow-y-auto bg-slate-50/30 custom-scrollbar">
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-black uppercase tracking-widest text-slate-900">System Access Active</Label>
                                <Badge variant="outline" className="text-[10px] bg-emerald-500 text-white border-none uppercase tracking-widest h-6 px-3">UNIFIED ACTIVE</Badge>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <p className="text-[10px] text-slate-500 font-bold italic leading-relaxed">
                                    * This user has unified access to both Mobile and Web platforms. 
                                    The system automatically manages session concurrency to ensure only one platform is active at a time.
                                </p>
                            </div>
                        </div>

                        <PermissionMatrix 
                            value={rbacMatrix}
                            onChange={setRbacMatrix}
                        />
                    </div>
                    <div className="p-8 bg-white border-t border-slate-100 flex justify-end gap-4 shadow-2xl">
                        <Button variant="ghost" className="rounded-2xl font-black uppercase tracking-widest text-slate-400 px-6" onClick={() => setRbacUser(null)}>Cancel</Button>
                        <Button className="rounded-2xl font-[1000] uppercase tracking-[0.15em] bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 px-10 h-14" onClick={handleSaveRbac} disabled={savingRbac}>
                            {savingRbac ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Permissions'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={revokeConfig.open} onOpenChange={(o) => setRevokeConfig(prev => ({ ...prev, open: o }))}>
                <DialogContent className="bg-white border-slate-200 p-0 overflow-hidden rounded-[32px] shadow-2xl">
                    <div className="bg-red-600 p-8 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-3xl font-[1000] uppercase tracking-tighter">Revoke Security Access</DialogTitle>
                            <p className="text-red-100 font-bold mt-1">This will permanently delete authentication for {revokeConfig.user?.full_name}.</p>
                        </DialogHeader>
                    </div>
                    <div className="p-8 space-y-6 pt-6">
                        <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center font-black text-slate-900 border border-slate-100">
                                <ShieldCheck className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 uppercase">Employee Data Preservation</p>
                                <p className="text-[10px] text-slate-500 font-bold">HR records, attendance, and payroll will NOT be deleted.</p>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-bold text-slate-400" onClick={() => setRevokeConfig({open: false, user: null, isRevoking: false})}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleRevokeAccess} 
                                disabled={revokeConfig.isRevoking}
                                className="flex-2 bg-red-600 text-white font-[900] uppercase tracking-widest h-14 px-8 rounded-2xl shadow-lg transition-all active:scale-95 group"
                            >
                                {revokeConfig.isRevoking ? <Loader2 className="animate-spin" /> : <><Trash2 className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" /> Confirm Revocation</>}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
                    </>
                )}
            </div>
        )}
    </div>
    );
}
