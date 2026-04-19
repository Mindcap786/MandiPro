"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Calculator, Calendar, CreditCard, Settings, User, Smile, Command, LayoutDashboard, Truck, Package, ShoppingCart, Landmark, Tag } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { useCachedParties, useCachedItems } from "@/hooks/use-cached-lists"

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command"

import { useLanguage } from '../i18n/language-provider'

export function CommandPalette() {
    const [open, setOpen] = React.useState(false)
    const router = useRouter()
    const { t } = useLanguage()
    
    const { profile } = useAuth()
    const { data: parties } = useCachedParties(profile?.organization_id)
    const { data: items } = useCachedItems(profile?.organization_id)

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false)
        command()
    }, [])

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder={t('common.command_placeholder')} />
            <CommandList>
                <CommandEmpty>{t('common.no_data')}</CommandEmpty>
                <CommandGroup heading={t('common.suggestions')}>
                    <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>{t('nav.dashboard')}</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push("/sales/new"))}>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        <span>{t('common.new_sale')}</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push("/arrivals/new"))}>
                        <Truck className="mr-2 h-4 w-4" />
                        <span>{t('common.new_arrival')}</span>
                    </CommandItem>
                </CommandGroup>
                
                {parties?.length > 0 && (
                    <>
                        <CommandSeparator />
                        <CommandGroup heading="Parties & Ledgers">
                            {parties.slice(0, 20).map(party => (
                                <CommandItem key={party.id} onSelect={() => runCommand(() => router.push(`/finance/${party.id}`))}>
                                    <Landmark className="mr-2 h-4 w-4" />
                                    <span>{party.name}</span>
                                    {party.city && <span className="ml-2 text-xs text-slate-400">({party.city})</span>}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )}

                {items?.length > 0 && (
                    <>
                        <CommandSeparator />
                        <CommandGroup heading="Items & Stock">
                            {items.slice(0, 20).map(item => (
                                <CommandItem key={item.id} onSelect={() => runCommand(() => router.push(`/stock/inventory?item=${item.id}`))}>
                                    <Tag className="mr-2 h-4 w-4" />
                                    <span>{item.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )}

                <CommandSeparator />
                <CommandGroup heading={t('nav.settings')}>
                    <CommandItem onSelect={() => runCommand(() => router.push("/settings/general"))}>
                        <User className="mr-2 h-4 w-4" />
                        <span>{t('common.profile')}</span>
                        <CommandShortcut>⌘P</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push("/settings/billing"))}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        <span>{t('common.billing')}</span>
                        <CommandShortcut>⌘B</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>{t('nav.settings')}</span>
                        <CommandShortcut>⌘S</CommandShortcut>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}
