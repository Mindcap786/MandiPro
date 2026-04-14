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

export function AddFarmerDialog({ children, onFarmerAdded }: { children: React.ReactNode, onFarmerAdded?: (farmer: any) => void }) {

    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [village, setVillage] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);
    // const supabase = createClientComponentClient();
    const { toast } = useToast();

    const handleSave = async () => {
        if (!name) return;
        setLoading(true);
        try {
            // TODO: Get merchant_id from context
            const { data, error } = await supabase.from("farmers").insert({
                name,
                village,
                phone,
                merchant_id: "PLACEHOLDER_MERCHANT_ID"
            }).select().single();

            if (error) throw error;

            toast({ title: "Farmer Added" });
            setOpen(false);
            setName("");
            setVillage("");
            setPhone("");
            if (onFarmerAdded) onFarmerAdded(data);
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
                    <DialogTitle>Add New Farmer</DialogTitle>
                    <DialogDescription>
                        Quickly add a farmer to the database.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            Name
                        </Label>
                        <Input id="name" value={name} onChange={e => setName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="village" className="text-right">
                            Village
                        </Label>
                        <Input id="village" value={village} onChange={e => setVillage(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="phone" className="text-right">
                            Phone
                        </Label>
                        <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Save Farmer"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
