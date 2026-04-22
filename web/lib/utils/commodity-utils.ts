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

    const specs: string[] = [];
    let variety: string | null = null;
    let grade: string | null = null;
    const others: string[] = [];

    Object.entries(customAttributes).forEach(([key, value]) => {
        const strValue = String(value || "").trim();
        if (!strValue) return;

        const lowerKey = key.toLowerCase().trim();
        if (lowerKey === 'variety') {
            variety = strValue;
        } else if (lowerKey === 'grade') {
            grade = strValue;
        } else {
            // Include other custom specifications
            others.push(`${key}: ${strValue}`);
        }
    });

    // Special formatting for variety and grade if they exist
    if (variety && grade) {
        specs.push(`${variety}-${grade}`);
    } else if (variety) {
        specs.push(variety);
    } else if (grade) {
        specs.push(grade);
    }

    // Append other specifications
    if (others.length > 0) {
        specs.push(...others);
    }

    if (specs.length > 0) {
        return `${name}(${specs.join(", ")})`;
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
/**
 * Strips metadata from a commodity name.
 * Example: "Mango(Kesar, A Grade)" -> "Mango"
 * Also handles cases without parentheses.
 */
export function getMainItemName(fullName: string | null | undefined): string {
    if (!fullName) return "";
    return fullName.split('(')[0].trim();
}
/**
 * Extracts all unique specification keys and their associated values 
 * for a base commodity name from a list of items.
 * 
 * @param items List of commodities from the master list
 * @param baseName The base name of the item (e.g. "Mango")
 * @returns Map of attribute keys to arrays of unique sorted values
 */
export function getAvailableSpecifications(items: any[], baseName: string): Record<string, string[]> {
    const specs: Record<string, Set<string>> = {};
    
    items.forEach(item => {
        // Compare with base name
        if (getMainItemName(item.name) === baseName) {
            const attrs = item.custom_attributes || {};
            Object.entries(attrs).forEach(([key, value]) => {
                const strVal = String(value || "").trim();
                if (strVal) {
                    if (!specs[key]) specs[key] = new Set();
                    specs[key].add(strVal);
                }
            });
        }
    });

    // Convert Sets to sorted Arrays
    const result: Record<string, string[]> = {};
    Object.entries(specs).forEach(([key, valueSet]) => {
        result[key] = Array.from(valueSet).sort();
    });

    return result;
}
