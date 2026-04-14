import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // ── MandiGrow Native Brand Tokens ──────────────────────────
                "n-primary":   "#1A6B3C",   // deep green — brand
                "n-primary-dk":"#156033",   // pressed state
                "n-secondary": "#F97316",   // orange — FAB + alerts
                "n-app-bg":    "#EFEFEF",   // page background
                "n-card-bg":   "#FFFFFF",   // card surface
                "n-txt-main":  "#1A1A2E",   // high contrast body text
                "n-txt-muted": "#6B7280",   // secondary labels
                "n-divider":   "#E5E7EB",   // borders, separators
                "n-success":   "#16A34A",
                "n-warning":   "#D97706",
                "n-error":     "#DC2626",
                // ── Legacy neon tokens (web mode) ──────────────────────────
                "neon-green":   "#39FF14",
                "neon-blue":    "#00F0FF",
                "neon-pink":    "#FF0099",
                "neon-purple":  "#BC13FE",
                "glass-black":  "rgba(0, 0, 0, 0.7)",
                "glass-border": "rgba(255, 255, 255, 0.1)",
            },
            height: {
                dvh: "100dvh",
            },
            minHeight: {
                dvh: "100dvh",
            },
            screens: {
                xs: "375px",
            },
            fontFamily: {
                sans: ["Inter", "var(--font-inter)", "system-ui", "sans-serif"],
                mono: ["var(--font-roboto-mono)"],
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "grid-pattern": "linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)",
            },
            boxShadow: {
                "card":   "0 2px 8px rgba(0,0,0,0.08)",
                "modal":  "0 -8px 32px rgba(0,0,0,0.18)",
                "fab":    "0 4px 16px rgba(249,115,22,0.45)",
                "botnav": "0 -1px 0 rgba(0,0,0,0.08)",
            },
        },
    },
    plugins: [
        require("tailwindcss-animate"),
        // tailwind-scrollbar-hide — provides .scrollbar-none utility
        // npm install tailwind-scrollbar-hide --save-dev
        ...(() => {
            try { return [require("tailwind-scrollbar-hide")]; } catch { return []; }
        })(),
    ],
};
export default config;
