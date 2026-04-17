'use client'

import { useState, useEffect } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { NAV_ITEMS, MenuItem } from '@/lib/rbac/menus'
import { useLanguage } from '@/components/i18n/language-provider'
import { usePermission } from '@/hooks/use-permission'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronDown, Shield, ShieldAlert, CheckCircle2 } from 'lucide-react'

interface PermissionMatrixProps {
    value: Record<string, boolean>;
    onChange: (newValue: Record<string, boolean>) => void;
    readOnly?: boolean;
    className?: string;
}

export function PermissionMatrix({ value, onChange, readOnly, className }: PermissionMatrixProps) {
    const { t } = useLanguage();
    const { can } = usePermission();
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Ensure all menus have a default state if not present (default to true/allowed if not specified?)
    // Actually, usually in RBAC, if not in matrix, it follows role default.
    // But for this UI, let's treat 'undefined' as 'allowed' (true).

    const toggleMenu = (key: string, checked: boolean) => {
        if (readOnly) return;
        const newValue = { ...value, [key]: checked };
        
        // If it's a parent, also toggle all children
        const item = findMenuItem(key);
        if (item?.items) {
            const traverse = (children: MenuItem[]) => {
                children.forEach(child => {
                    newValue[child.tKey] = checked;
                    if (child.items) traverse(child.items);
                });
            };
            traverse(item.items);
        }

        onChange(newValue);
    };

    const findMenuItem = (key: string): MenuItem | undefined => {
        let found: MenuItem | undefined;
        const traverse = (items: MenuItem[]) => {
            for (const item of items) {
                if (item.tKey === key) { found = item; break; }
                if (item.items) traverse(item.items);
                if (found) break;
            }
        };
        traverse(NAV_ITEMS);
        return found;
    };

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const isChecked = (key: string) => value[key] !== false; // Default to true if missing

    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">Menu Access Matrix</span>
                </div>
                {!readOnly && (
                    <div className="flex gap-4">
                        <button 
                            type="button"
                            onClick={() => {
                                const all: Record<string, boolean> = {};
                                const traverse = (items: MenuItem[]) => {
                                    items.forEach(i => {
                                        all[i.tKey] = true;
                                        if (i.items) traverse(i.items);
                                    });
                                };
                                traverse(NAV_ITEMS);
                                onChange(all);
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:underline uppercase tracking-tighter"
                        >
                            Allow All
                        </button>
                        <button 
                            type="button"
                            onClick={() => {
                                const none: Record<string, boolean> = {};
                                const traverse = (items: MenuItem[]) => {
                                    items.forEach(i => {
                                        none[i.tKey] = false;
                                        if (i.items) traverse(i.items);
                                    });
                                };
                                traverse(NAV_ITEMS);
                                onChange(none);
                            }}
                            className="text-[10px] font-bold text-red-600 hover:underline uppercase tracking-tighter"
                        >
                            Restrict All
                        </button>
                    </div>
                )}

            </div>

            <div className="grid grid-cols-1 gap-1 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                {NAV_ITEMS.filter(can).map((item) => (
                    <div key={item.tKey} className="border-b border-slate-100 last:border-0">
                        <div className={cn(
                            "flex items-center p-3 hover:bg-slate-50 transition-colors",
                            isChecked(item.tKey) ? "bg-white" : "bg-slate-50/50"
                        )}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Checkbox 
                                    id={`check-${item.tKey}`}
                                    checked={isChecked(item.tKey)}
                                    onCheckedChange={(checked) => toggleMenu(item.tKey, !!checked)}
                                    disabled={readOnly}
                                    className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                />
                                <div 
                                    className="flex items-center gap-2 cursor-pointer flex-1"
                                    onClick={() => item.items && toggleGroup(item.tKey)}
                                >
                                    <item.icon className={cn("w-4 h-4", isChecked(item.tKey) ? "text-slate-900" : "text-slate-300")} />
                                    <Label 
                                        htmlFor={`check-${item.tKey}`}
                                        className={cn(
                                            "text-sm font-bold uppercase tracking-tight cursor-pointer",
                                            isChecked(item.tKey) ? "text-slate-900" : "text-slate-400"
                                        )}
                                    >
                                        {t(item.tKey)}
                                    </Label>
                                    {item.items && (
                                        expandedGroups[item.tKey] 
                                            ? <ChevronDown className="w-3 h-3 text-slate-400" /> 
                                            : <ChevronRight className="w-3 h-3 text-slate-400" />
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isChecked(item.tKey) ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 opacity-50" />
                                ) : (
                                    <ShieldAlert className="w-3.5 h-3.5 text-red-400 opacity-50" />
                                )}
                            </div>
                        </div>

                        {item.items && expandedGroups[item.tKey] && (
                            <div className="bg-slate-50/50 pl-10 pr-4 py-2 space-y-2 border-t border-slate-50">
                                {item.items.filter(can).map((sub) => (
                                    <div key={sub.tKey} className="flex items-center gap-3">
                                        <Checkbox 
                                            id={`check-${sub.tKey}`}
                                            checked={isChecked(sub.tKey)}
                                            onCheckedChange={(checked) => toggleMenu(sub.tKey, !!checked)}
                                            disabled={readOnly}
                                            className="w-3.5 h-3.5 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                                        />
                                        <Label 
                                            htmlFor={`check-${sub.tKey}`}
                                            className={cn(
                                                "text-[11px] font-bold uppercase tracking-wide cursor-pointer",
                                                isChecked(sub.tKey) ? "text-slate-700" : "text-slate-400"
                                            )}
                                        >
                                            {t(sub.tKey)}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <p className="text-[10px] text-slate-400 font-medium px-2 italic">
                * Note: Restricting a parent menu automatically restricts all its sub-menus.
            </p>
        </div>
    );
}
