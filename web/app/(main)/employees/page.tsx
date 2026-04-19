'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
    Briefcase, Plus, Search, Phone, Mail, MapPin, IndianRupee,
    Loader2, Pencil, Trash2, UserCheck, UserX, Calendar,
    Eye, EyeOff
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { ExpenseDialog } from '@/components/finance/expense-dialog'
import { PermissionMatrix } from '@/components/rbac/permission-matrix'
import { useCachedEmployees } from '@/hooks/use-cached-lists'

const ROLES = ['Owner', 'Manager', 'Accountant', 'Salesman', 'Loader', 'Driver', 'Watchman', 'Other']
const SALARY_TYPES = ['monthly', 'weekly', 'daily']

const defaultForm = {
    name: '', role: 'Salesman', phone: '', email: '',
    address: '', salary: '', salary_type: 'monthly',
    join_date: '', status: 'active', notes: '',
}

export default function EmployeesPage() {
    const { profile } = useAuth()
    const { toast } = useToast()
    const { data: employees, loading, refresh: fetchEmployees } = useCachedEmployees(profile?.organization_id)
    const [search, setSearch] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState({ ...defaultForm })
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [paidAmounts, setPaidAmounts] = useState<Record<string, number>>({})
    const [salaryAccountId, setSalaryAccountId] = useState<string | null>(null)
    const [showPassword, setShowPassword] = useState(false)

    useEffect(() => {
        if (profile?.organization_id) {
            fetchSalaryStatus()
        }
    }, [profile])

    const fetchSalaryStatus = async () => {
        if (!profile?.organization_id) return

        // 1. Find Salary Account
        const { data: accounts } = await supabase
            .schema('mandi')
            .from('accounts')
            .select('id')
            .eq('organization_id', profile.organization_id)
            .ilike('name', '%salar%')
            .limit(1)

        const salId = accounts?.[0]?.id
        if (!salId) return
        setSalaryAccountId(salId)

        // 2. Fetch payments for this month
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)

        const { data: payments } = await supabase
            .schema('mandi')
            .from('ledger_entries')
            .select('employee_id, debit')
            .eq('account_id', salId)
            .gte('entry_date', startOfMonth.toISOString())
            .not('employee_id', 'is', null)

        if (payments) {
            const amounts: Record<string, number> = {}
            payments.forEach(p => {
                const id = p.employee_id
                if (id) {
                    amounts[id] = (amounts[id] || 0) + (Number(p.debit) || 0)
                }
            })
            setPaidAmounts(amounts)
        }
    }

    const openAdd = () => {
        setEditingId(null)
        setForm({ ...defaultForm })
        setDialogOpen(true)
    }

    const openEdit = (emp: any) => {
        setEditingId(emp.id)
        setForm({
            name: emp.name || '',
            role: emp.role || 'Salesman',
            phone: emp.phone || '',
            email: emp.email || '',
            address: emp.address || '',
            salary: emp.salary?.toString() || '',
            salary_type: emp.salary_type || 'monthly',
            join_date: emp.join_date || '',
            status: emp.status || 'active',
            notes: emp.notes || '',
        })
        setDialogOpen(true)
    }

    const handleSave = async () => {
        if (!form.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return }
        
        setSaving(true)

        const payload = {
            organization_id: profile!.organization_id,
            name: form.name.trim(),
            role: form.role,
            phone: form.phone || null,
            email: form.email || null,
            address: form.address || null,
            salary: form.salary ? parseFloat(form.salary) : null,
            salary_type: form.salary_type,
            join_date: form.join_date || null,
            status: form.status,
            notes: form.notes || null,
            updated_at: new Date().toISOString()
        }

        let error
        if (editingId) {
            ; ({ error } = await supabase.schema('mandi').from('employees').update(payload).eq('id', editingId))
        } else {
            ; ({ error } = await supabase.schema('mandi').from('employees').insert(payload))
        }

        if (error) {
            toast({ title: 'Error saving employee', description: error.message, variant: 'destructive' })
        } else {
            toast({ title: editingId ? 'Employee updated!' : 'Employee added!' })
            setDialogOpen(false)
            fetchEmployees()
            fetchSalaryStatus()
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        const { error } = await supabase.schema('mandi').from('employees').delete().eq('id', id)
        if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' })
        else { toast({ title: 'Employee removed' }); fetchEmployees() }
        setDeleteId(null)
    }

    const toggleStatus = async (emp: any) => {
        const newStatus = emp.status === 'active' ? 'inactive' : 'active'
        await supabase.schema('mandi').from('employees').update({ status: newStatus }).eq('id', emp.id)
        fetchEmployees()
    }

    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.role?.toLowerCase().includes(search.toLowerCase()) ||
        e.phone?.includes(search)
    )

    const active = employees.filter(e => e.status === 'active').length
    const totalSalary = employees.filter(e => e.status === 'active').reduce((s, e) => s + (e.salary || 0), 0)

    return (
        <div className="min-h-screen bg-slate-50 p-6 pb-32">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div>
                        <h1 className="text-4xl font-[1000] tracking-tighter text-black uppercase flex items-center gap-3">
                            <Briefcase className="w-9 h-9 text-indigo-600" />
                            Employee <span className="text-indigo-600">Register</span>
                        </h1>
                        <p className="text-slate-500 font-bold mt-1 text-sm">Manage your team — staff, salaries & roles</p>
                    </div>
                    <Button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-wider h-12 px-6 rounded-2xl shadow-md">
                        <Plus className="w-5 h-5 mr-2" /> Add Employee
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                        { label: 'Total Staff', value: employees.length, color: 'text-slate-800', bg: 'bg-white' },
                        { label: 'Active', value: active, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                        { label: 'Monthly Payroll', value: `₹${totalSalary.toLocaleString('en-IN')}`, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
                    ].map(stat => (
                        <div key={stat.label} className={`${stat.bg} border border-slate-200 rounded-2xl p-5 shadow-sm`}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                            <p className={`text-3xl font-[1000] tracking-tighter mt-1 ${stat.color}`}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, role, phone…"
                        className="pl-11 h-12 bg-white border-slate-200 rounded-2xl text-black font-bold shadow-sm"
                    />
                </div>

                {/* Table */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">
                            <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="font-black uppercase tracking-widest text-sm">No employees found</p>
                            <p className="text-xs mt-1">Click "Add Employee" to get started</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {/* Col headers */}
                            <div className="grid grid-cols-12 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50">
                                <span className="col-span-3">Name / Role</span>
                                <span className="col-span-2">Contact</span>
                                <span className="col-span-2">Salary</span>
                                <span className="col-span-2">Joined</span>
                                <span className="col-span-1">Status</span>
                                <span className="col-span-2 text-right">Actions</span>
                            </div>
                            {filtered.map(emp => (
                                <div key={emp.id} className="grid grid-cols-12 px-6 py-4 items-center hover:bg-slate-50 transition-colors group">
                                    {/* Name */}
                                    <div className="col-span-3">
                                        <p className="font-black text-black text-sm">{emp.name}</p>
                                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 mt-1">
                                            {emp.role}
                                        </span>
                                    </div>
                                    {/* Contact */}
                                    <div className="col-span-2 space-y-1">
                                        {emp.phone && <p className="flex items-center gap-1 text-xs text-slate-600 font-medium"><Phone className="w-3 h-3" />{emp.phone}</p>}
                                        {emp.email && <p className="flex items-center gap-1 text-xs text-slate-500"><Mail className="w-3 h-3" />{emp.email}</p>}
                                    </div>
                                    {/* Salary */}
                                    <div className="col-span-2">
                                        {emp.salary ? (
                                            <p className="text-sm font-black text-emerald-600 flex items-center gap-0.5">
                                                <IndianRupee className="w-3 h-3" />{Number(emp.salary).toLocaleString('en-IN')}
                                                <span className="text-[10px] text-slate-400 font-bold ml-1">/{emp.salary_type?.charAt(0)}</span>
                                            </p>
                                        ) : <span className="text-xs text-slate-300 font-bold">—</span>}
                                    </div>
                                    {/* Joined */}
                                    <div className="col-span-2">
                                        {emp.join_date
                                            ? <p className="text-xs text-slate-600 font-medium flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(emp.join_date), 'dd MMM yyyy')}</p>
                                            : <span className="text-xs text-slate-300">—</span>}
                                    </div>
                                    {/* Status */}
                                    <div className="col-span-1">
                                        <button onClick={() => toggleStatus(emp)} title="Toggle status">
                                            {emp.status === 'active'
                                                ? <UserCheck className="w-5 h-5 text-emerald-500" />
                                                : <UserX className="w-5 h-5 text-slate-300" />}
                                        </button>
                                    </div>
                                    {/* Actions */}
                                    <div className="col-span-2 flex justify-end items-center gap-2">
                                        {emp.status === 'active' && (() => {
                                            const paid = paidAmounts[emp.id] || 0
                                            const balance = (emp.salary || 0) - paid
                                            
                                            if (paid > 0 && balance <= 0) {
                                                return (
                                                    <ExpenseDialog 
                                                        defaultEmployeeId={emp.id} 
                                                        defaultAmount={emp.salary} 
                                                        defaultCategoryName="Staff Salaries"
                                                        onSuccess={() => {
                                                            fetchEmployees()
                                                            fetchSalaryStatus()
                                                        }}
                                                    >
                                                        <button className="flex items-center justify-center min-w-[80px] gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 font-black text-[10px] uppercase tracking-wider transition-all shadow-sm active:scale-95" title="Salary Fully Paid">
                                                            PAID ✓
                                                        </button>
                                                    </ExpenseDialog>
                                                )
                                            }
                                            
                                            return (
                                                <div className="flex flex-col items-end gap-1">
                                                    <ExpenseDialog 
                                                        defaultEmployeeId={emp.id} 
                                                        defaultAmount={balance > 0 ? balance : emp.salary} 
                                                        defaultCategoryName="Staff Salaries"
                                                        onSuccess={() => {
                                                            fetchEmployees()
                                                            fetchSalaryStatus()
                                                        }}
                                                    >
                                                        <button className="flex items-center justify-center min-w-[80px] gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider transition-all shadow-sm active:scale-95" title="Pay Salary">
                                                            <IndianRupee className="w-3.5 h-3.5" /> {paid > 0 ? 'PAY BAL' : 'PAY'}
                                                        </button>
                                                    </ExpenseDialog>
                                                    {paid > 0 && balance > 0 && (
                                                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-1.5 py-0.5 rounded-lg border border-amber-100">
                                                            Bal: ₹{balance.toLocaleString('en-IN')}
                                                        </span>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                        <button onClick={() => openEdit(emp)} className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition-colors">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setDeleteId(emp.id)} className="p-2 rounded-xl hover:bg-red-50 text-red-300 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Add / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[520px] bg-white border-slate-200 text-black rounded-[32px] shadow-2xl p-0 flex flex-col max-h-[90vh]">
                    <div className="bg-gradient-to-r from-indigo-50 to-slate-50 p-8 pb-4 border-b border-slate-100">
                        <DialogHeader>
                            <DialogTitle className="text-3xl font-[1000] italic tracking-tighter text-black uppercase">
                                {editingId ? 'EDIT' : 'ADD'} <span className="text-indigo-600">EMPLOYEE</span>
                            </DialogTitle>
                        </DialogHeader>
                    </div>
                    <div className="p-8 pt-6 space-y-5 overflow-y-auto flex-1">
                        {/* Name + Role */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Full Name *</Label>
                                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. Raju Kumar"
                                    className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Role</Label>
                                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                                    <SelectTrigger className="h-12 bg-slate-50 border-slate-200 font-bold text-black rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[9999] bg-white shadow-xl border border-slate-200 rounded-xl">
                                        {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</Label>
                                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                                    <SelectTrigger className="h-12 bg-slate-50 border-slate-200 font-bold text-black rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[9999] bg-white shadow-xl border border-slate-200 rounded-xl">
                                        <SelectItem value="active">✅ Active</SelectItem>
                                        <SelectItem value="inactive">⛔ Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Contact */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Phone</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                                        placeholder="+91 9876543210" maxLength={13}
                                        className="pl-9 bg-slate-50 border-slate-200 h-11 font-bold text-black rounded-xl" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                        placeholder="email@example.com" type="email"
                                        className="pl-9 bg-slate-50 border-slate-200 h-11 font-bold text-black rounded-xl" />
                                </div>
                            </div>
                        </div>

                        {/* Salary */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Salary (₹)</Label>
                                <div className="relative">
                                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })}
                                        placeholder="15000" type="number"
                                        className="pl-9 bg-slate-50 border-slate-200 h-11 font-black text-emerald-700 rounded-xl" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pay Cycle</Label>
                                <Select value={form.salary_type} onValueChange={v => setForm({ ...form, salary_type: v })}>
                                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 font-bold text-black rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[9999] bg-white shadow-xl border border-slate-200 rounded-xl">
                                        {SALARY_TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Join Date + Address */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date of Joining</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input value={form.join_date} onChange={e => setForm({ ...form, join_date: e.target.value })}
                                    type="date"
                                    className="pl-9 bg-slate-50 border-slate-200 h-11 font-bold text-black rounded-xl" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Address</Label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                                <textarea
                                    value={form.address}
                                    onChange={e => setForm({ ...form, address: e.target.value })}
                                    placeholder="Village, City, State"
                                    rows={2}
                                    className="w-full pl-9 pt-2.5 bg-slate-50 border border-slate-200 rounded-xl text-black font-bold text-sm resize-none p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</Label>
                            <textarea
                                value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })}
                                placeholder="Any additional notes…"
                                rows={2}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl text-black font-medium text-sm resize-none p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                        </div>


                        <Button onClick={handleSave} disabled={saving}
                            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black tracking-wider uppercase rounded-2xl shadow-md">
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : editingId ? 'UPDATE EMPLOYEE' : 'ADD EMPLOYEE'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
                <DialogContent className="sm:max-w-[360px] bg-white rounded-[24px] p-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <Trash2 className="w-7 h-7 text-red-500" />
                    </div>
                    <h3 className="text-xl font-black text-black uppercase tracking-tight">Remove Employee?</h3>
                    <p className="text-slate-500 text-sm mt-2 font-medium">This action cannot be undone.</p>
                    <div className="flex gap-3 mt-6">
                        <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 h-11 font-black rounded-xl">Cancel</Button>
                        <Button onClick={() => deleteId && handleDelete(deleteId)} className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl">Delete</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
