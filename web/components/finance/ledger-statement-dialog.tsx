"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import StatementViewer from "./statement-viewer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface LedgerStatementProps {
    contactId: string;
    contactName: string;
    contactType?: string;
    organizationId: string;
    isOpen: boolean;
    onClose: () => void;
}

export function LedgerStatementDialog({ contactId, contactName, contactType, isOpen, onClose }: LedgerStatementProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="!block max-w-none w-screen h-screen m-0 p-0 border-none bg-slate-50 overflow-hidden print:overflow-visible print:h-auto text-black"
                onInteractOutside={(e) => e.preventDefault()}>
                <VisuallyHidden><DialogTitle>Statement Viewer</DialogTitle></VisuallyHidden>
                {isOpen && contactId && (
                    <StatementViewer
                        contactId={contactId}
                        contactName={contactName}
                        contactType={contactType}
                        onClose={onClose}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
