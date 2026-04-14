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
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive' | 'warning';
}

export function ConfirmationDialog({
    open,
    onOpenChange,
    title,
    description,
    onConfirm,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
}: ConfirmationDialogProps) {
    const [loading, setLoading] = React.useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
            onOpenChange(false);
        } finally {
            setLoading(false);
        }
    };

    const variantStyles = {
        default: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        destructive: 'bg-red-600 hover:bg-red-700 text-white',
        warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] bg-white border-slate-200 text-slate-900 shadow-2xl rounded-2xl overflow-hidden p-0">
                <div className="p-6">
                    <DialogHeader className="space-y-3">
                        <div className="flex items-center gap-3">
                            {variant === 'destructive' || variant === 'warning' ? (
                                <div className={`p-2 rounded-lg ${variant === 'destructive' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                            ) : null}
                            <DialogTitle className="text-xl font-black tracking-tight">{title}</DialogTitle>
                        </div>
                        <DialogDescription className="text-slate-500 font-medium leading-relaxed">
                            {description}
                        </DialogDescription>
                    </DialogHeader>
                </div>
                <DialogFooter className="bg-slate-50 p-6 pt-4 flex flex-row items-center justify-end gap-3 border-t border-slate-100">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                        className="font-bold text-slate-500 hover:bg-white flex-1 sm:flex-none"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={loading}
                        className={`${variantStyles[variant]} font-black rounded-xl h-11 px-8 flex-1 sm:flex-none shadow-lg transition-all active:scale-95`}
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
