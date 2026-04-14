import { useState, useEffect } from 'react';
import { getPlatformBranding, BrandingSettings } from '@/lib/services/branding-service';

export function usePlatformBranding() {
    const [branding, setBranding] = useState<BrandingSettings | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchSettings() {
            try {
                const settings = await getPlatformBranding();
                setBranding(settings);
            } catch (err) {
                console.error("Failed to load branding in hook:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchSettings();
    }, []);

    return { branding, loading };
}
