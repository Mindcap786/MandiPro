'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus } from 'lucide-react';

export function ManualInvoiceDialog({ onInvoiceCreated }: { onInvoiceCreated: () => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        orgId: '',
        amount: '',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Default +7 days
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase.rpc('admin_create_invoice', {
                p_org_id: formData.orgId,
                p_amount: parseFloat(formData.amount),
                p_due_date: new Date(formData.dueDate).toISOString()
            });

            if (error) throw error;

            toast({ title: 'Invoice Created', description: `Invoice for ₹${formData.amount} generated successfully.` });
            setOpen(false);
            setFormData({ ...formData, orgId: '', amount: '' }); // Reset
            onInvoiceCreated();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-neon-blue text-black hover:bg-neon-blue/90 font-bold">
                    <Plus className="w-4 h-4 mr-2" /> Manual Invoice
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-black/95 border-white/10 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Manual Invoice</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="orgId">Organization ID (UUID)</Label>
                        <Input
                            id="orgId"
                            placeholder="e.g., 550e8400-e29b..."
                            value={formData.orgId}
                            onChange={(e) => setFormData({ ...formData, orgId: e.target.value })}
                            required
                            className="bg-white/5 border-white/10"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount (₹)</Label>
                        <Input
                            id="amount"
                            type="number"
                            placeholder="0.00"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            required
                            className="bg-white/5 border-white/10"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="dueDate">Due Date</Label>
                        <Input
                            id="dueDate"
                            type="date"
                            value={formData.dueDate}
                            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                            required
                            className="bg-white/5 border-white/10"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="bg-neon-blue text-black hover:bg-neon-blue/90 w-full font-bold">
                            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create Invoice
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
