/**
 * Intelligent Commodity Mapping Utility
 * Handles fuzzy matching, alias resolution, and spell-check for inventory items.
 */

interface VisualAsset {
    type: 'img' | 'icon'
    src?: string
    icon?: any // Lucide icon component
    iconName?: string // Helper for dynamic mapping
}

const COMMODITY_LIBRARY: Record<string, { aliases: string[], asset: VisualAsset }> = {
    'apple': {
        aliases: ['seb', 'saib', 'aaple', 'apl', 'red apple', 'green apple'],
        asset: { type: 'img', src: '/assets/3d/apple.png' }
    },
    'orange': {
        aliases: ['kinnow', 'santru', 'mousambi', 'ornge', 'orange fruit', 'kino'],
        asset: { type: 'img', src: '/assets/3d/orange.png' }
    },
    'mango': {
        aliases: ['aam', 'mago', 'manggo', 'alphonso', 'chaunsa'],
        asset: { type: 'img', src: '/assets/3d/mango.png' }
    },
    'pomegranate': {
        aliases: ['anaar', 'pomegrante', 'pomgranate', 'anar', 'pomegranate fruit', 'pomegrnate'],
        asset: { type: 'img', src: '/assets/3d/pomegranate.png' }
    },
    'papaya': {
        aliases: ['papita', 'papeeta', 'papaya fruit', 'popaya'],
        asset: { type: 'img', src: '/assets/3d/papaya.png' }
    },
    'date': {
        aliases: ['khajoor', 'dates', 'khajur', 'date fruit'],
        asset: { type: 'img', src: '/assets/fruits/dates.png' }
    },
    'kiwi': {
        aliases: ['kiwi fruit', 'kivi', 'kiwii', 'imported kiwi', 'kiwi green', 'kiwi gold'],
        asset: { type: 'img', src: '/assets/3d/kiwi.png' }
    },
    'avocado': {
        aliases: ['butter fruit', 'imported avocado', 'avocados', 'avicadi', 'avacado'],
        asset: { type: 'img', src: '/assets/3d/avocado.png' }
    },
    'blueberries': {
        aliases: ['blueberry', 'imported blueberries', 'blue berry'],
        asset: { type: 'img', src: '/assets/3d/blueberries.png' }
    },
    'blackberry': {
        aliases: ['black berry', 'blackberries', 'imported blackberry'],
        asset: { type: 'img', src: '/assets/3d/blackberry.png' }
    },
    'cranberry': {
        aliases: ['cranberries', 'cran berry', 'imported cranberry'],
        asset: { type: 'img', src: '/assets/3d/cranberry.png' }
    },
    'raspberry': {
        aliases: ['raspberries', 'rasp berry', 'imported raspberry'],
        asset: { type: 'img', src: '/assets/3d/raspberry.png' }
    },
    'lychee': {
        aliases: ['litchi', 'leechi', 'lichee'],
        asset: { type: 'img', src: '/assets/3d/lychee.png' }
    },
    'pear': {
        aliases: ['nakh', 'babugosha', 'imported pear', 'pears'],
        asset: { type: 'icon', iconName: 'Apple' }
    },
    'plum': {
        aliases: ['aloo bukhara', 'plums', 'imported plum'],
        asset: { type: 'img', src: '/assets/fruits/plum.png' }
    },
    'sapota': {
        aliases: ['chikoo', 'chiku', 'chickoo', 'chiku fruit'],
        asset: { type: 'img', src: '/assets/3d/sapota.png' }
    },
    'custard_apple': {
        aliases: ['sitaphal', 'sharifa', 'sugar apple', 'custard apple'],
        asset: { type: 'img', src: '/assets/3d/custard_apple.png' }
    },
    'jackfruit': {
        aliases: ['kathal', 'jack fruit', 'katahal'],
        asset: { type: 'img', src: '/assets/3d/jackfruit.png' }
    },
    'amla': {
        aliases: ['indian gooseberry', 'amlah', 'awla'],
        asset: { type: 'img', src: '/assets/3d/amla.png' }
    },
    'jamun': {
        aliases: ['java plum', 'black plum', 'jambul', 'jamun berry'],
        asset: { type: 'img', src: '/assets/3d/jamun.png' }
    },
    'bael': {
        aliases: ['wood apple', 'bel', 'bili', 'bel fruit'],
        asset: { type: 'img', src: '/assets/3d/bael.png' }
    },
    'wood_apple': {
        aliases: ['kaitha', 'elephant apple', 'limonia'],
        asset: { type: 'img', src: '/assets/3d/wood_apple.png' }
    },
    'star_fruit': {
        aliases: ['carambola', 'kamrakh', 'starfruit'],
        asset: { type: 'img', src: '/assets/3d/star_fruit.png' }
    },
    'passion_fruit': {
        aliases: ['krishna phal', 'passionfruit', 'granadilla'],
        asset: { type: 'img', src: '/assets/3d/passion_fruit.png' }
    },
    'dragonfruit': {
        aliases: ['pitaya', 'dragon fruit', 'imported dragon fruit', 'pitahaya'],
        asset: { type: 'img', src: '/assets/3d/dragon_fruit.png' }
    },
    'peach': {
        aliases: ['aadoo', 'peaches', 'imported peach'],
        asset: { type: 'img', src: '/assets/fruits/peach.png' }
    },
    'apricot': {
        aliases: ['khubani', 'apricots', 'imported apricot'],
        asset: { type: 'img', src: '/assets/fruits/apricot.png' }
    },
    'cherry': {
        aliases: ['cherries', 'imported cherry', 'red cherry'],
        asset: { type: 'img', src: '/assets/fruits/cherry.png' }
    },
    'lemon': {
        aliases: ['nimbu', 'lime', 'lemon fruit', 'imported lemon'],
        asset: { type: 'img', src: '/assets/fruits/lemon.png' }
    },
    'strawberry': {
        aliases: ['berry', 'strawberries', 'strowberry', 'imported strawberry'],
        asset: { type: 'img', src: '/assets/fruits/strawberry.png' }
    },
    'pineapple': {
        aliases: ['ananas', 'pineaple', 'imported pineapple'],
        asset: { type: 'img', src: '/assets/3d/pineapple.png' }
    },
    'watermelon': {
        aliases: ['tarbooj', 'watermelons', 'tarbuz', 'imported watermelon'],
        asset: { type: 'img', src: '/assets/3d/watermelon.png' }
    },
    'muskmelon': {
        aliases: ['kharbooja', 'cantaloupe', 'kharbuja', 'melon'],
        asset: { type: 'img', src: '/assets/3d/muskmelon.png' }
    },
    'guava': {
        aliases: ['amrood', 'gava', 'guva', 'amrud', 'peru', 'gvava', 'gwava', 'gvva', 'amrut'],
        asset: { type: 'img', src: '/assets/3d/guava.png', iconName: 'Apple' }
    },
    'grapes': {
        aliases: ['angoor', 'angoer', 'grapes fruit', 'angoor red', 'angoor green', 'grape', 'grapess', 'graps', 'angur', 'angur red', 'angur green'],
        asset: { type: 'img', src: '/assets/3d/grapes.png', iconName: 'Grape' }
    },
    'banana': {
        aliases: ['kela', 'bnana', 'banana fruit'],
        asset: { type: 'img', src: '/assets/3d/banana.png' }
    },
    'carrot': {
        aliases: ['gajar', 'carot', 'carat', 'red carrot'],
        asset: { type: 'img', src: '/assets/3d/carrot.png' }
    },
    'potato': {
        aliases: ['aloo', 'patato', 'potatoe', 'alu'],
        asset: { type: 'img', src: '/assets/3d/potato.png' }
    },
    'onion': {
        aliases: ['pyaz', 'pyaj', 'onion red', 'onion white'],
        asset: { type: 'img', src: '/assets/3d/onion.png' }
    },
    'tomato': {
        aliases: ['tamatar', 'tomato fruit', 'tometo'],
        asset: { type: 'img', src: '/assets/3d/tomato.png' }
    },
    'sabzi': {
        aliases: ['leaf', 'palak', 'spinach', 'mentha', 'greens', 'vegatable', 'vegetables', 'mooli', 'gobhi', 'shalgam', 'matar', 'peas'],
        asset: { type: 'img', src: '/assets/vegetables/greens.png' }
    }
}

/**
 * Simple Levenshtein distance helper for fuzzy matching.
 */
const getLevenshteinDistance = (s1: string, s2: string): number => {
    const len1 = s1.length, len2 = s2.length;
    const matrix: number[][] = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[len1][len2];
}

/**
 * Finds the best matching commodity visual based on input string.
 * Uses exact match first, alias check, keyword inclusion, and finally fuzzy matching.
 */
export const getIntelligentVisual = (itemName: string, icons: any): VisualAsset => {
    const input = itemName.toLowerCase().trim()

    // 1. Direct match or alias match
    for (const [key, data] of Object.entries(COMMODITY_LIBRARY)) {
        if (input === key || data.aliases.includes(input)) {
            const asset = { ...data.asset } as VisualAsset
            // Always map icon if iconName exists, regardless of type (for fallbacks)
            if (asset.iconName) {
                asset.icon = icons[asset.iconName]
            }
            return asset
        }
    }

    // 2. Keyword inclusion (partial match) - Sort by length descending to catch 'pineapple' before 'apple'
    const sortedKeys = Object.keys(COMMODITY_LIBRARY).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        const data = COMMODITY_LIBRARY[key];
        if (input.includes(key) || data.aliases.some(alias => input.includes(alias))) {
            const asset = { ...data.asset } as VisualAsset
            if (asset.type === 'icon' && asset.iconName) {
                asset.icon = icons[asset.iconName]
            }
            return asset
        }
    }

    // 3. Fuzzy matching (Typo handling)
    let bestMatchKey: string | null = null;
    let minDistance = 3; // Max tolerance for typos

    for (const [key, data] of Object.entries(COMMODITY_LIBRARY)) {
        const distance = Math.min(
            getLevenshteinDistance(input, key),
            ...data.aliases.map(alias => getLevenshteinDistance(input, alias))
        );

        if (distance < minDistance) {
            minDistance = distance;
            bestMatchKey = key;
        }
    }

    if (bestMatchKey) {
        const asset = { ...COMMODITY_LIBRARY[bestMatchKey].asset } as VisualAsset
        if (asset.type === 'icon' && asset.iconName) {
            asset.icon = icons[asset.iconName]
        }
        return asset
    }

    // 4. Default Fallback
    return { type: 'icon', icon: icons.Package }
}
