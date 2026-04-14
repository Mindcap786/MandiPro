"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Calculator, Calendar, CreditCard, Settings, User, Smile, Command, LayoutDashboard, Truck, Package, ShoppingCart } from "lucide-react"

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
