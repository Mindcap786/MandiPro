"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

    className?: string
    error?: boolean
    onSelected?: (value: string) => void
}

export const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(({
    options,
    value,
    onChange,
    placeholder = "Select...",
    searchPlaceholder = "Search...",
    emptyMessage = "No results found.",
    disabled = false,
    className,
    error = false,
    onSelected,
}, ref) => {
    const [open, setOpen] = React.useState(false)

    // Find the label for the current value
    const selectedLabel = React.useMemo(() => {
        return options.find((option) => option.value === value)?.label
    }, [options, value])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    ref={ref}
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between bg-white border-slate-200 text-black font-black hover:bg-slate-50 transition-all shadow-sm overflow-hidden",
                        !value && "text-slate-400",
                        error && "border-red-500 ring-2 ring-red-500/20",
                        className
                    )}
                    disabled={disabled}
                >
                    <span className="truncate flex-1 text-left">
                        {selectedLabel || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[max(var(--radix-popover-trigger-width),350px)] p-0 bg-white border border-slate-200 text-black shadow-xl rounded-xl overflow-hidden z-[100]">
                <Command className="bg-transparent border-none text-black">
                    <div className="flex items-center border-b border-slate-100 px-3 py-2" cmdk-input-wrapper="">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-slate-500" />
                        <CommandInput
                            placeholder={searchPlaceholder}
                            className="bg-transparent border-none text-black font-black placeholder:text-slate-400 focus:ring-0 text-sm h-10 w-full"
                        />
                    </div>
                    <CommandList className="max-h-[200px] overflow-y-auto p-1">
                        <CommandEmpty className="py-6 text-center text-xs font-bold text-slate-500">{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={`${option.label}__${option.value}`}
                                    onSelect={() => {
                                        onChange(option.value)
                                        setOpen(false)
                                        onSelected?.(option.value)
                                    }}
                                    onClick={() => {
                                        onChange(option.value)
                                        setOpen(false)
                                        onSelected?.(option.value)
                                    }}
                                    className="!pointer-events-auto flex items-center gap-2 px-2 py-2 rounded-md font-black text-sm text-black hover:bg-slate-100 cursor-pointer aria-selected:bg-slate-100 data-[selected='true']:bg-blue-50 data-[selected='true']:text-blue-700 transition-colors"
                                >
                                    <Check
                                        className={cn(
                                            "h-4 w-4 text-blue-600",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
