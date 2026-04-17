import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSwitcher } from './language-switcher';
import { useLanguage } from './language-provider';

// Mock useLanguage hook
vi.mock('./language-provider', () => ({
    useLanguage: vi.fn(),
}));

describe('LanguageSwitcher Component', () => {
    it('should render the current language', () => {
        // Mocking English as active
        (useLanguage as any).mockReturnValue({
            language: 'en',
            setLanguage: vi.fn(),
            t: (s: string) => s,
        });

        render(<LanguageSwitcher />);

        // Check if Globe icon / Language button exists
        const button = screen.getByRole('button');
        expect(button).toBeDefined();

        // Check if "English" (native name) is shown
        expect(screen.getByText('English')).toBeDefined();
    });

    it('should show other languages when clicked', async () => {
        const setLanguageMock = vi.fn();
        (useLanguage as any).mockReturnValue({
            language: 'en',
            setLanguage: setLanguageMock,
            t: (s: string) => s,
        });

        render(<LanguageSwitcher />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        // Check if Hindi, Telugu etc appear in dropdown (Radix UI uses Portals)
        expect(document.body.textContent).toContain('హిन्दी');
        expect(document.body.textContent).toContain('తెలుగు');
        expect(document.body.textContent).toContain('தமிழ்');
        expect(document.body.textContent).toContain('ಕನ್ನಡ');
    });

    it('should call setLanguage when a new language is selected', () => {
        const setLanguageMock = vi.fn();
        (useLanguage as any).mockReturnValue({
            language: 'en',
            setLanguage: setLanguageMock,
            t: (s: string) => s,
        });

        render(<LanguageSwitcher />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        const teluguItem = screen.getByText('తెలుగు');
        fireEvent.click(teluguItem);

        expect(setLanguageMock).toHaveBeenCalledWith('te');
    });
});
