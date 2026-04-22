"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Trees, Loader2, Save, MapPin, User, Target } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    farmer_id: z.string().min(1, "Farmer is required"),
    item_id: z.string().optional(),
    location: z.string().optional(),
    tree_count: z.number().min(0),
    estimated_yield: z.number().min(0),
    status: z.string()
});

type OrchardFormValues = z.infer<typeof formSchema>;

interface OrchardDialogProps {
    children?: React.ReactNode;
    onSuccess?: () => void;
}

export function OrchardDialog({ children, onSuccess }: OrchardDialogProps) {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [farmers, setFarmers] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);

    const form = useForm<OrchardFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            farmer_id: "",
            status: "growing",
            tree_count: 0,
            estimated_yield: 0,
            item_id: "",
            location: ""
        }
    });

    useEffect(() => {
        if (open && profile?.organization_id) {
            fetchMasterData();
        }
    }, [open, profile]);

    const fetchMasterData = async () => {
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('organization_id', profile!.organization_id)
            .eq('contact_type', 'farmer');
        setFarmers(contacts || []);

        const { data: itemsData } = await supabase
            .from('commodities')
            .select('id, name')
            .eq('organization_id', profile!.organization_id);
        setItems(itemsData || []);
    };

    async function onSubmit(values: OrchardFormValues) {
        if (!profile?.organization_id) return;
        setIsSubmitting(true);

        try {
            const { error } = await supabase
                .from('orchards')
                .insert({
                    ...values,
                    organization_id: profile.organization_id
                });

            if (error) throw error;

            toast({ title: "Orchard Registered", description: `${values.name} has been added to the system.` });
            setOpen(false);
            form.reset();
            onSuccess?.();
        } catch (error: any) {
            toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || <Button>Register Orchard</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-white/10 text-white p-0 overflow-hidden rounded-[32px] shadow-2xl">
                <DialogHeader className="p-8 border-b border-white/5 bg-white/[0.02]">
                    <DialogTitle className="text-3xl font-black italic tracking-tighter uppercase flex items-center gap-3">
                        <Trees className="w-8 h-8 text-neon-green" />
                        FIELD <span className="text-neon-green">ENTRY</span>
                    </DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-6">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-gray-500">Orchard / Field Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. North Apple Farm" {...field} className="bg-white/5 border-white/10 h-12 rounded-xl text-white font-bold" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="farmer_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                                            <User className="w-3 h-3" /> Owner (Farmer)
                                        </FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl">
                                                    <SelectValue placeholder="Select Farmer" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                {farmers.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="item_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                                            <Target className="w-3 h-3" /> Primary Crop
                                        </FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl">
                                                    <SelectValue placeholder="Crop Type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="location"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> Location / Village
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Village, District" {...field} className="bg-white/5 border-white/10 h-12 rounded-xl" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="tree_count"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-gray-500">Tree Count</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-white/5 border-white/10 h-12 rounded-xl font-bold" />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="estimated_yield"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-gray-500">Est. Yield (Tons)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-white/5 border-white/10 h-12 rounded-xl font-bold" />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-16 bg-neon-green text-black font-black uppercase tracking-widest text-sm rounded-2xl shadow-[0_10px_30px_-5px_rgba(57,255,20,0.4)] hover:bg-green-400 transition-all hover:scale-[1.02]"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Authorize Field Governance"}
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
