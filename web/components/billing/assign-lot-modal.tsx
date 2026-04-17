"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface Lot {
    id: string;
    lot_code: string;
    farmer: { name: string } | null;
    item_type: string;
    current_quantity: number;
    unit_type: string;
}

export function AssignLotModal({ children, onLotSelected }: { children: React.ReactNode, onLotSelected: (lot: any) => void }) {
    const [open, setOpen] = useState(false);
    const [lots, setLots] = useState<Lot[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            fetchLots();
        }
    }, [open]);

    const fetchLots = async () => {
        setLoading(true);
        // Fetch lots with quantity > 0
        const { data, error } = await supabase
            .from("lots")
            .select(`
                id,
                lot_code,
                item_type,
                current_quantity,
                unit_type,
                farmer:farmers(name)
            `)
            .gt("current_quantity", 0)
            .order("created_at", { ascending: false });

        if (data) {
            // Transform data to match Lot interface safely
            const formattedLots = data.map((item: any) => ({
                ...item,
                farmer: Array.isArray(item.farmer) ? item.farmer[0] : item.farmer
            }));
            setLots(formattedLots);
        }
        setLoading(false);
    };

    const filteredLots = lots.filter(lot =>
        lot.lot_code.toLowerCase().includes(search.toLowerCase()) ||
        lot.farmer?.name.toLowerCase().includes(search.toLowerCase()) ||
        lot.item_type.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Select Lot to Sell</DialogTitle>
                </DialogHeader>
                <div className="flex items-center space-x-2 py-4">
                    <Search className="w-4 h-4 opacity-50" />
                    <Input
                        placeholder="Search by Lot No, Farmer, or Item..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1"
                    />
                </div>
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Lot No</TableHead>
                                <TableHead>Farmer</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Available Qty</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                                </TableRow>
                            ) : filteredLots.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">No available lots found.</TableCell>
                                </TableRow>
                            ) : (
                                filteredLots.map((lot) => (
                                    <TableRow key={lot.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                                        onLotSelected(lot);
                                        setOpen(false);
                                    }}>
                                        <TableCell className="font-medium">{lot.lot_code}</TableCell>
                                        <TableCell>{lot.farmer?.name || "Unknown"}</TableCell>
                                        <TableCell>{lot.item_type}</TableCell>
                                        <TableCell className="text-right">{lot.current_quantity} {lot.unit_type}</TableCell>
                                        <TableCell className="text-right"><Button size="sm" variant="secondary">Select</Button></TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
}
