'use client';

import { useEffect, RefObject } from 'react';

/**
 * A hook that globally captures the "Enter" key press inside a specific form
 * and converts it to a "Tab" keypress behavior, moving focus to the next
 * focusable element. This perfectly mimics Tally/Busy ERP data-entry flows.
 * @param formRef React Ref pointing to the HTML <form> element
 */
export function useEnterToTab(formRef: RefObject<HTMLFormElement>) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                const target = e.target as HTMLElement;

                // Do not intercept Enter on textareas (native newlines) or submit buttons
                if (target.tagName === 'TEXTAREA' || (target.tagName === 'BUTTON' && target.getAttribute('type') === 'submit')) {
                    return;
                }

                // If the target is inside a Radix/Command dialog, let it handle its own Enter
                if (target.closest('[role="dialog"]') && target.closest('[cmdk-root]')) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();

                // Find all focusable elements within the form
                if (formRef.current) {
                    const focusableElements = formRef.current.querySelectorAll(
                        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])[tabindex]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
                    );

                    const elementsArray = Array.from(focusableElements) as HTMLElement[];
                    const currentIndex = elementsArray.indexOf(target);

                    if (currentIndex > -1 && currentIndex < elementsArray.length - 1) {
                        elementsArray[currentIndex + 1].focus();
                    } else if (currentIndex === elementsArray.length - 1) {
                        // If it's the last element, simulate a submit click if there is a submit button
                        const submitBtn = formRef.current.querySelector('button[type="submit"]') as HTMLButtonElement | null;
                        if (submitBtn) {
                            submitBtn.click();
                        }
                    }
                }
            }

            // 2F. SAVE / SUBMIT SHORTCUTS
            // Ctrl + S: Submit
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                e.stopPropagation();
                const submitBtn = formRef.current?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
                if (submitBtn) submitBtn.click();
            }

            // Ctrl + N: Reset form
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                e.stopPropagation();
                const resetBtn = formRef.current?.querySelector('button[type="reset"]') as HTMLButtonElement | null;
                if (resetBtn) resetBtn.click();
            }
        };

        const handleFocusIn = (e: FocusEvent) => {
            const target = e.target as HTMLInputElement;
            if (target && target.tagName === 'INPUT') {
                const type = target.getAttribute('type');
                const inputMode = target.getAttribute('inputmode');
                // Auto-select text if it's numeric/decimal on focus
                if (type === 'number' || inputMode === 'decimal' || inputMode === 'numeric') {
                    // Small delay to ensure browser focus completes
                    setTimeout(() => target.select(), 0);
                }
            }
        };

        const formElement = formRef.current;
        if (formElement) {
            formElement.addEventListener('keydown', handleKeyDown);
            formElement.addEventListener('focusin', handleFocusIn);
            return () => {
                formElement.removeEventListener('keydown', handleKeyDown);
                formElement.removeEventListener('focusin', handleFocusIn);
            };
        }
    }, [formRef]);
}
