"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, CalendarIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssignLotModal } from "@/components/billing/assign-lot-modal";
import { useRouter } from "next/navigation";

// Form Schema
const itemSchema = z.object({
    lot_id: z.string(),
    lot_code: z.string(),
    item_type: z.string(),
    unit_type: z.string(),
    available_qty: z.coerce.number(),
    quantity: z.coerce.number().min(1),
    weight: z.coerce.number().optional(), // total items weight
    rate: z.coerce.number().min(0),
    amount: z.coerce.number(),
});

const billSchema = z.object({
    buyer_id: z.string().min(1, "Buyer is required"),
    bill_date: z.date(),
    vehicle_number: z.string().optional(),
    destination: z.string().optional(),
    items: z.array(itemSchema).min(1, "Add at least one item"),
});

export default function CreateBillPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [buyers, setBuyers] = useState<any[]>([]);

    const form = useForm<z.infer<typeof billSchema>>({
        resolver: zodResolver(billSchema) as any, // suppressed type error
        defaultValues: {
            bill_date: new Date(),
            items: [],
            buyer_id: "",
        },
    });

    const { fields, append, remove, update } = useFieldArray({
        control: form.control,
        name: "items",
    });

    // Watch items for calculations
    const watchedItems = form.watch("items");
    const grossTotal = watchedItems.reduce((sum, item) => sum + (item.amount || 0), 0);

    // Simple commission 6% logic (Mock)
    const commissionRate = 0.06;
    const commissionAmount = Math.round(grossTotal * commissionRate);
    const netPayable = grossTotal + commissionAmount; // Usually commission is added to buyer bill?? Or deducted from farmer...
    // Wait, for Purchase Bill (Buyer Invoice), usually:
    // Item Cost + Commission + HAMALI + Other Exp = Total Buyer Payable.
    // Let's assume Commission is ADDED to buyer bill.

    useEffect(() => {
        async function fetchBuyers() {
            const { data } = await supabase.from("buyers").select("id, name");
            if (data) setBuyers(data);
        }
        fetchBuyers();
    }, []);

    // Update line item amount when Qty/Rate changes
    const handleItemChange = (index: number, field: keyof z.infer<typeof itemSchema>, value: number) => {
        const currentItem = form.getValues(`items.${index}`);
        let updates: any = { [field]: value };

        if (field === 'quantity' || field === 'rate') {
            const qty = field === 'quantity' ? value : currentItem.quantity;
            const rate = field === 'rate' ? value : currentItem.rate;
            updates.amount = qty * rate;
            form.setValue(`items.${index}.amount`, updates.amount);
        }
        form.setValue(`items.${index}.${field}` as any, value);
    };

    const onSubmit = async (values: z.infer<typeof billSchema>) => {
        try {
            console.log("Submitting Bill:", values);

            // 1. Create Bill
            const { data: billData, error: billError } = await supabase.from("bills").insert({
                buyer_id: values.buyer_id,
                bill_date: values.bill_date.toISOString(),
                vehicle_number: values.vehicle_number,
                // destination: values.destination, // TODO: Add to schema if missing
                merchant_id: "PLACEHOLDER_MERCHANT_ID", // Auth context needed
                total_amount: netPayable,
                status: "pending",
                metadata: {
                    commission: commissionAmount,
                    destination: values.destination
                }
            }).select().single();

            if (billError) throw billError;

            // 2. Create Items
            const itemsToInsert = values.items.map(item => ({
                bill_id: billData.id,
                lot_id: item.lot_id,
                quantity: item.quantity,
                weight: item.weight || 0,
                rate: item.rate,
                unit: item.unit_type,
                amount: item.amount,
                commission_amount: item.amount * commissionRate // Per item breakdown
            }));

            const { error: itemsError } = await supabase.from("bill_items").insert(itemsToInsert);
            if (itemsError) throw itemsError;

            // 3. Update Lots Qty (Decrement)
            // Ideally handled via Database Trigger or RPC for atomicity. 
            // For now, client-side loop (Not recommended for prod, but okay for prototype)
            // Better: user RPC. But let's leave for now as "Pending" until confirmed.

            toast({ title: "Bill Created", description: "Purchase bill generated successfully." });
            router.push("/bills");

        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">New Purchase Bill</h1>
                <div className="space-x-2">
                    <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                    <Button onClick={form.handleSubmit(onSubmit)}>Save Bill</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Buyer Details */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Buyer Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Buyer Name</Label>
                            <Select onValueChange={(val) => form.setValue("buyer_id", val)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Buyer" />
                                </SelectTrigger>
                                <SelectContent>
                                    {buyers.map(b => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 flex flex-col pt-1">
                            <Label>Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !form.watch("bill_date") && "text-muted-foreground")}>
                                        {form.watch("bill_date") ? format(form.watch("bill_date"), "PPP") : <span>Pick a date</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={form.watch("bill_date")} onSelect={(d) => d && form.setValue("bill_date", d)} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>Vehicle Number</Label>
                            <Input placeholder="MH-12-AB-1234" {...form.register("vehicle_number")} />
                        </div>
                        <div className="space-y-2">
                            <Label>Destination</Label>
                            <Input placeholder="City / Market" {...form.register("destination")} />
                        </div>
                    </CardContent>
                </Card>

                {/* Bill Summary */}
                <Card>
                    <CardHeader>
                        <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between text-sm">
                            <span>Gross Total</span>
                            <span className="font-bold">₹{grossTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-green-600">
                            <span>Commission (6%) (+)</span>
                            <span>₹{commissionAmount.toFixed(2)}</span>
                        </div>
                        {/* 
             <div className="flex justify-between text-sm text-red-500">
                <span>Expenses (-)</span>
                <span>₹0.00</span>
             </div>
             */}
                        <div className="border-t pt-4 flex justify-between text-lg font-bold">
                            <span>Net Payable</span>
                            <span>₹{netPayable.toFixed(2)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Line Items Grid */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Items</CardTitle>
                    <AssignLotModal onLotSelected={(lot) => {
                        append({
                            lot_id: lot.id,
                            lot_code: lot.lot_code,
                            item_type: lot.item_type,
                            unit_type: lot.unit_type,
                            available_qty: lot.current_quantity,
                            quantity: lot.current_quantity, // Default to all
                            weight: 0,
                            rate: 0,
                            amount: 0
                        })
                    }}>
                        <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
                    </AssignLotModal>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Lot No</TableHead>
                                <TableHead>Item / Quality</TableHead>
                                <TableHead className="text-right w-24">Qty</TableHead>
                                <TableHead className="text-right w-24">Weight (Kg)</TableHead>
                                <TableHead className="text-right w-24">Rate</TableHead>
                                <TableHead className="text-right w-28">Amount</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((field, index) => (
                                <TableRow key={field.id}>
                                    <TableCell className="font-medium">{field.lot_code}</TableCell>
                                    <TableCell>{field.item_type}</TableCell>
                                    <TableCell className="text-right">
                                        <Input
                                            type="number"
                                            className="h-8 text-right"
                                            defaultValue={field.quantity}
                                            onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                                        />
                                        <div className="text-[10px] text-muted-foreground mt-1">
                                            of {field.available_qty} {field.unit_type}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Input
                                            type="number"
                                            className="h-8 text-right"
                                            defaultValue={field.weight}
                                            onChange={(e) => handleItemChange(index, 'weight', Number(e.target.value))}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Input
                                            type="number"
                                            className="h-8 text-right"
                                            defaultValue={field.rate}
                                            onChange={(e) => handleItemChange(index, 'rate', Number(e.target.value))}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {/* Display watched amount or calculated? Need to watch field to update UI */}
                                        ₹{form.watch(`items.${index}.amount`)?.toFixed(2) || 0}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {fields.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No items added. Click "Add Item" to add lots from inventory.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
