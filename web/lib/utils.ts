import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Moves focus to the next focusable element in the DOM relative to the current element.
 * Perfect for Tally/Busy ERP style data entry flows.
 */
export function focusNext(currentElement: HTMLElement | null) {
    if (!currentElement) return;

    // Find all focusable elements in the document
    const focusableElements = Array.from(
        document.querySelectorAll(
            'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])[tabindex]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
        )
    ) as HTMLElement[];

    const currentIndex = focusableElements.indexOf(currentElement);
    if (currentIndex > -1 && currentIndex < focusableElements.length - 1) {
        const nextElement = focusableElements[currentIndex + 1];
        nextElement.focus();
        
        // If it's an input, select all text for quick overwrite
        if (nextElement instanceof HTMLInputElement) {
            setTimeout(() => nextElement.select(), 0);
        }
    }
}
