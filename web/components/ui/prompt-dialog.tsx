'use client';

import * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';

interface PromptDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    requiredText: string;
    onConfirm: () => Promise<void> | void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
}

export function PromptDialog({
    open,
    onOpenChange,
    title,
    description,
    requiredText,
    onConfirm,
    confirmText = 'Confirm Action',
    cancelText = 'Cancel',
    variant = 'default',
}: PromptDialogProps) {
    const [inputValue, setInputValue] = React.useState('');
    const [loading, setLoading] = React.useState(false);

    const isMatch = inputValue.trim().toUpperCase() === requiredText.trim().toUpperCase();

    const handleConfirm = async () => {
        if (!isMatch) return;
        setLoading(true);
        try {
            await onConfirm();
            onOpenChange(false);
            setInputValue('');
        } finally {
            setLoading(false);
        }
    };

    const variantStyles = {
        default: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        destructive: 'bg-red-600 hover:bg-red-700 text-white',
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px] bg-white border-slate-200 text-slate-900 shadow-2xl rounded-2xl overflow-hidden p-0">
                <div className="bg-slate-50 p-6 border-b border-slate-100 flex items-start gap-4">
                    <div className={`p-3 rounded-2xl ${variant === 'destructive' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {variant === 'destructive' ? <ShieldAlert className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                    </div>
                    <div className="space-y-1">
                        <DialogTitle className="text-xl font-black tracking-tight">{title}</DialogTitle>
                        <DialogDescription className="text-slate-500 font-medium leading-relaxed">
                            {description}
                        </DialogDescription>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="confirmation-text" className="text-xs font-black uppercase tracking-widest text-slate-500">
                            Type <span className="text-red-500 select-all font-mono font-black">&quot;{requiredText}&quot;</span> to confirm
                        </Label>
                        <Input
                            id="confirmation-text"
                            placeholder={requiredText}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="bg-white border-slate-200 h-12 rounded-xl text-lg font-black tracking-wider focus:ring-2 focus:ring-indigo-500/20 transition-all uppercase placeholder:opacity-30"
                            autoComplete="off"
                            autoFocus
                        />
                    </div>
                </div>

                <DialogFooter className="bg-slate-50 p-6 pt-4 flex flex-row items-center justify-end gap-3 border-t border-slate-100">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                        className="font-bold text-slate-500 hover:bg-white flex-1 sm:flex-none h-11"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={loading || !isMatch}
                        className={`${variantStyles[variant]} font-black rounded-xl h-11 px-8 flex-1 sm:flex-none shadow-lg transition-all active:scale-95 disabled:opacity-30`}
                    >
                        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
