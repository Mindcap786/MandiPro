/**
 * Commodity Utility Functions
 */

/**
 * Standardizes the display name of a commodity by appending Variety and Grade if available.
 * Format: Name(Variety-Grade) or Name(Variety) or Name(Grade)
 * 
 * @param name The base name of the commodity
 * @param customAttributes JSONB object containing commodity specifications
 * @returns Formatted string: "Commodity(Variety-Grade)"
 */
export function formatCommodityName(name: string | null | undefined, customAttributes?: any): string {
    if (!name) return "";
    if (!customAttributes || typeof customAttributes !== 'object') return name;

    // Normalize keys to find Variety and Grade (case-insensitive)
    let variety: string | null = null;
    let grade: string | null = null;

    Object.entries(customAttributes).forEach(([key, value]) => {
        const lowerKey = key.toLowerCase();
        const strValue = String(value || "").trim();
        
        if (!strValue) return;

        if (lowerKey === 'variety') {
            variety = strValue;
        } else if (lowerKey === 'grade') {
            grade = strValue;
        }
    });

    if (variety && grade) {
        return `${name}(${variety}-${grade})`;
    } else if (variety) {
        return `${name}(${variety})`;
    } else if (grade) {
        return `${name}(${grade})`;
    }

    return name;
}

/**
 * Generates a normalized identity string for a commodity to detect duplicates.
 * Normalizes name and all custom attributes (case-insensitive, trimmed).
 */
export function getCommodityIdentity(name: string | null | undefined, customAttributes?: any): string {
    if (!name) return "";
    const cleanName = name.trim().toLowerCase();
    
    if (!customAttributes || typeof customAttributes !== 'object') {
        return cleanName;
    }

    // Sort keys to ensure consistent identity regardless of insertion order
    const sortedSpecs = Object.entries(customAttributes)
        .filter(([_, v]) => String(v || "").trim() !== "")
        .map(([k, v]) => `${k.toLowerCase().trim()}:${String(v).toLowerCase().trim()}`)
        .sort();

    return `${cleanName}|${sortedSpecs.join("|")}`;
}
