"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export function AddGuarantorDialog({ children, onGuarantorAdded }: { children: React.ReactNode, onGuarantorAdded?: (guarantor: any) => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleSave = async () => {
        if (!name) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.from("guarantors").insert({
                name,
                phone,
                address,
                merchant_id: "PLACEHOLDER_MERCHANT_ID"
            }).select().single();

            if (error) throw error;

            toast({ title: "Guarantor Added" });
            setOpen(false);
            setName("");
            setPhone("");
            setAddress("");
            if (onGuarantorAdded) onGuarantorAdded(data);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Guarantor</DialogTitle>
                    <DialogDescription>
                        Quickly add a guarantor to the database.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="guarantor-name" className="text-right">
                            Name
                        </Label>
                        <Input id="guarantor-name" value={name} onChange={e => setName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="guarantor-phone" className="text-right">
                            Phone
                        </Label>
                        <Input id="guarantor-phone" value={phone} onChange={e => setPhone(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="guarantor-address" className="text-right">
                            Address
                        </Label>
                        <Input id="guarantor-address" value={address} onChange={e => setAddress(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Save Guarantor"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
