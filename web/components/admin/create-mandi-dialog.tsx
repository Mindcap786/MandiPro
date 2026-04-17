"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Building2 } from "lucide-react"

const mandiSchema = z.object({
    name: z.string().min(2, "Mandi Name is required"),
    city: z.string().min(2, "City/Region is required"),
    tier: z.enum(["enterprise", "standard", "trial"]),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
})

type MandiFormValues = z.infer<typeof mandiSchema>

interface CreateMandiDialogProps {
    children: React.ReactNode
    onSuccess?: () => void
}

export function CreateMandiDialog({ children, onSuccess }: CreateMandiDialogProps) {
    const [open, setOpen] = useState(false)
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    const form = useForm<MandiFormValues>({
        resolver: zodResolver(mandiSchema),
        defaultValues: {
            name: "",
            city: "",
            tier: "enterprise",
            email: "",
            password: ""
        }
    })

    const onSubmit = async (data: MandiFormValues) => {
        setIsLoading(true)
        try {
            const response = await fetch('/api/admin/create-mandi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create Mandi')
            }

            toast({ title: "Success", description: `Mandi "${data.name}" created successfully!` })
            setOpen(false)
            form.reset()
            if (onSuccess) onSuccess()

        } catch (error: any) {
            toast({
                title: "Creation Failed",
                description: error.message,
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-[#050510]/95 backdrop-blur-2xl border-white/10 text-white rounded-[32px] overflow-hidden shadow-[0_0_50px_rgba(57,255,20,0.1)] p-0">
                <div className="bg-gradient-to-r from-neon-blue/10 to-transparent p-8 pb-4">
                    <DialogHeader>
                        <DialogTitle className="text-3xl font-black italic tracking-tighter flex items-center gap-2">
                            <Building2 className="w-8 h-8 text-neon-blue" />
                            NEW <span className="text-neon-blue">MANDI</span>
                        </DialogTitle>
                        <DialogDescription className="text-gray-500 font-medium">
                            Provision a new Organization and Admin account.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 pt-4 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Mandi Name</Label>
                            <Input
                                placeholder="e.g. Apex Market Yard"
                                className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl focus:border-neon-blue transition-all"
                                {...form.register("name")}
                            />
                            {form.formState.errors.name && <p className="text-red-500 text-xs">{form.formState.errors.name.message}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Region / City</Label>
                                <Input
                                    placeholder="e.g. Mumbai"
                                    className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl focus:border-neon-blue transition-all"
                                    {...form.register("city")}
                                />
                                {form.formState.errors.city && <p className="text-red-500 text-xs">{form.formState.errors.city.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Tier</Label>
                                <Select
                                    onValueChange={(val: any) => form.setValue("tier", val)}
                                    defaultValue="enterprise"
                                >
                                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:ring-neon-blue">
                                        <SelectValue placeholder="Select tier" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-white/10 text-white rounded-xl">
                                        <SelectItem value="enterprise">Enterprise</SelectItem>
                                        <SelectItem value="standard">Standard</SelectItem>
                                        <SelectItem value="trial">Trial</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-neon-green">Super Admin Email</Label>
                                <Input
                                    type="email"
                                    placeholder="admin@newmandi.com"
                                    className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl focus:border-neon-green transition-all"
                                    {...form.register("email")}
                                />
                                {form.formState.errors.email && <p className="text-red-500 text-xs">{form.formState.errors.email.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-neon-green">Password</Label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl focus:border-neon-green transition-all"
                                    {...form.register("password")}
                                />
                                {form.formState.errors.password && <p className="text-red-500 text-xs">{form.formState.errors.password.message}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <Button type="submit" disabled={isLoading} className="w-full h-14 bg-neon-blue text-black hover:bg-neon-blue/90 font-black text-lg tracking-tight rounded-2xl shadow-[0_10px_30px_rgba(0,240,255,0.2)]">
                            {isLoading ? (
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span className="uppercase text-sm tracking-widest">PROVISIONING...</span>
                                </div>
                            ) : (
                                "CREATE MANDI ENVIRONMENT"
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
