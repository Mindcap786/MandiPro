'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Shield, Lock, UserX, UserCheck, MoreVertical, Plus, Loader2, Trash2, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function AdminsPage() {
    const { toast } = useToast();
    const [admins, setAdmins] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [sessionToken, setSessionToken] = useState<string | null>(null);

    // Form state
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('read_only');
    const [submitting, setSubmitting] = useState(false);

    // Permission Matrix State
    const [permissionOpen, setPermissionOpen] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState<any>(null);
    const [matrix, setMatrix] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                setSessionToken(session.access_token);
                fetchAdmins(session.access_token);
            } else {
                setLoading(false);
            }
        };
        init();
    }, []);

    const fetchAdmins = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/admins', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch admins');
            setAdmins(data.admins || []);
        } catch (e: any) {
            toast({ title: 'Access Denied', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/admins', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ email, full_name: fullName, password, role })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create admin');
            
            toast({ title: 'Success', description: 'Admin account created successfully' });
            setCreateOpen(false);
            // Reset form
            setEmail(''); setFullName(''); setPassword(''); setRole('read_only');
            if (sessionToken) fetchAdmins(sessionToken);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleAction = async (adminId: string, action: string, newRole?: string) => {
        try {
            const res = await fetch(`/api/admin/admins/${adminId}`, {
                method: action === 'delete' ? 'DELETE' : 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: action === 'delete' ? undefined : JSON.stringify({ action: action === 'role' ? 'change_role' : action, role: newRole })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Action failed');
            
            toast({ title: 'Success', description: `Action executed successfully` });
            if (sessionToken) fetchAdmins(sessionToken);
        } catch (e: any) {
            toast({ title: 'Permission Error', description: e.message, variant: 'destructive' });
        }
    };

    const handleUpdatePermissions = async () => {
        if (!editingAdmin) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/admin/admins/${editingAdmin.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ action: 'update_rbac', rbac_matrix: matrix })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update permissions');
            
            toast({ title: 'Permissions Updated', description: `Access matrix for ${editingAdmin.full_name} has been synchronized.` });
            setPermissionOpen(false);
            if (sessionToken) fetchAdmins(sessionToken);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    const ROLE_LABELS: any = {
        super_admin: 'Super Admin',
        platform_admin: 'Platform Admin',
        finance_admin: 'Finance',
        support_admin: 'Support',
        operations_admin: 'Operations',
        read_only: 'Read-Only'
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 p-8 pb-20 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black flex items-center gap-3">
                            <Shield className="w-8 h-8 text-indigo-400" /> Administrative Access
                        </h1>
                        <p className="text-slate-400 mt-1 uppercase tracking-widest text-xs font-bold">Bank-Grade Control Center</p>
                    </div>

                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-slate-900 gap-2 font-bold">
                                <Plus className="w-4 h-4" /> Provision Admin
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border-slate-200 text-slate-900 sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-black">Provision New Admin</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleCreateAdmin} className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label>Full Name</Label>
                                    <Input value={fullName} onChange={e => setFullName(e.target.value)} required className="bg-slate-50 border-slate-200" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email Address</Label>
                                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="bg-slate-50 border-slate-200" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Initial Password</Label>
                                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-slate-50 border-slate-200" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Access Role</Label>
                                    <Select value={role} onValueChange={setRole}>
                                        <SelectTrigger className="bg-slate-50 border-slate-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                            <SelectItem value="super_admin">Super Admin (Full Access)</SelectItem>
                                            <SelectItem value="platform_admin">Platform Admin</SelectItem>
                                            <SelectItem value="finance_admin">Finance Admin</SelectItem>
                                            <SelectItem value="support_admin">Support Admin</SelectItem>
                                            <SelectItem value="operations_admin">Operations Admin</SelectItem>
                                            <SelectItem value="read_only">Read-Only Analyst</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold mt-4">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <Card className="bg-white shadow-sm border-slate-200">
                    <CardHeader className="border-b border-slate-200 pb-4">
                        <CardTitle className="text-lg text-slate-900 font-bold">Authorized Personnel</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-12 text-center text-slate-500">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 opacity-50" />
                                <p>Verifying access parameters...</p>
                            </div>
                        ) : admins.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">No admin records found or permission denied.</div>
                        ) : (
                            <div className="divide-y divide-slate-200">
                                {admins.map((admin) => (
                                    <div key={admin.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                                                <KeyRound className="w-4 h-4 text-indigo-500" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 flex items-center gap-2">
                                                    {admin.full_name || 'System User'}
                                                    {admin.admin_status === 'active' ? (
                                                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] h-5">Active</Badge>
                                                    ) : admin.admin_status === 'suspended' ? (
                                                        <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10 text-[10px] h-5">Suspended</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-[10px] h-5">Locked</Badge>
                                                    )}
                                                </p>
                                                <p className="text-xs text-slate-400 font-mono mt-0.5">{admin.email}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="hidden md:block text-sm">
                                                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Access Level</p>
                                                <Badge className={cn(
                                                    "font-mono font-bold text-xs uppercase shadow-none",
                                                    admin.role === 'super_admin' ? "bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-indigo-200" : "bg-slate-100 outline outline-1 outline-slate-200 text-slate-500 pointer-events-none"
                                                )}>
                                                    {ROLE_LABELS[admin.role] || admin.role}
                                                </Badge>
                                            </div>

                                            <div className="hidden lg:block text-right text-sm">
                                                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Last Auth</p>
                                                <p className="text-slate-900 font-mono font-medium">
                                                    {admin.last_login_time ? formatDistanceToNow(new Date(admin.last_login_time), { addSuffix: true }) : 'Never'}
                                                </p>
                                            </div>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56 bg-white border-slate-200 text-slate-900">
                                                    {admin.admin_status !== 'active' ? (
                                                        <DropdownMenuItem onClick={() => handleAction(admin.id, 'unlock')} className="hover:bg-slate-50 cursor-pointer text-emerald-600 font-medium">
                                                            <UserCheck className="w-4 h-4 mr-2" /> Restore Access
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <>
                                                            <DropdownMenuItem onClick={() => {
                                                                setEditingAdmin(admin);
                                                                setMatrix(admin.rbac_matrix || {});
                                                                setPermissionOpen(true);
                                                            }} className="hover:bg-slate-50 cursor-pointer text-indigo-600 font-bold">
                                                                <Shield className="w-4 h-4 mr-2" /> Grant Permissions
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleAction(admin.id, 'lock')} className="hover:bg-slate-50 cursor-pointer text-orange-600 font-medium">
                                                                <Lock className="w-4 h-4 mr-2" /> Instantly Lock Account
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleAction(admin.id, 'suspend')} className="hover:bg-slate-50 cursor-pointer text-orange-600 font-medium">
                                                                <UserX className="w-4 h-4 mr-2" /> Suspend Account
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    <DropdownMenuSeparator className="bg-slate-200" />
                                                    <DropdownMenuItem onClick={() => handleAction(admin.id, 'delete')} className="hover:bg-red-50 cursor-pointer text-red-600 font-bold">
                                                        <Trash2 className="w-4 h-4 mr-2" /> Terminate Account
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Permission Matrix Dialog */}
                <Dialog open={permissionOpen} onOpenChange={setPermissionOpen}>
                    <DialogContent className="bg-white border-slate-200 text-slate-900 sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl">
                        <div className="bg-indigo-600 p-6 text-white shrink-0">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-black flex items-center gap-3">
                                    <Shield className="w-6 h-6 text-indigo-200" />
                                    Access Control Console
                                </DialogTitle>
                                <p className="text-indigo-100 text-sm mt-1">Configure granular menu access for <span className="font-bold underline">{editingAdmin?.full_name || editingAdmin?.email}</span></p>
                            </DialogHeader>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
                            <PermissionMatrix 
                                value={matrix}
                                onChange={setMatrix}
                            />
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
                            <Button variant="ghost" onClick={() => setPermissionOpen(false)} className="text-slate-400 font-bold">Cancel</Button>
                            <Button 
                                onClick={handleUpdatePermissions} 
                                disabled={submitting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 rounded-xl shadow-lg shadow-indigo-200"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                                Apply Access Matrix
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

        </div>
    );
}
