import { supabase } from "@/lib/supabaseClient";

export interface BrandingSettings {
    id: string;
    document_footer_powered_by_text: string;
    document_footer_presented_by_text: string;
    document_footer_developed_by_text: string;
    watermark_text: string;
    is_watermark_enabled: boolean;
    support_phone?: string;
}

let cachedSettings: BrandingSettings | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 300000; // 5 minutes

export async function getPlatformBranding(): Promise<BrandingSettings | null> {
    const now = Date.now();
    if (cachedSettings && (now - lastFetchTime < CACHE_TTL)) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
            .schema('core')
            .from('platform_branding_settings')
            .select('*')
            .maybeSingle();

        if (error) {
            console.error("Error fetching platform branding:", error);
            return null;
        }

        if (data) {
            cachedSettings = data as BrandingSettings;
            lastFetchTime = now;
            return cachedSettings;
        }
    } catch (err) {
        console.error("Failed to load branding:", err);
    }

    return null;
}
