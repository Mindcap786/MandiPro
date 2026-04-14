#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MandiGrow Mobile Build Script
# Builds a static Next.js export for Capacitor (iOS + Android).
#
# Strategy: Temporarily moves /app/api to /app/_api_disabled during the
# static export build, then restores it. This prevents Next.js from trying
# to include server-only API routes in the static bundle.
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit on any error

# ── Ensure Node/npm/npx are on PATH (Homebrew on Apple Silicon) ───────────────
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
NPX="$(which npx)"
echo "   Using npx: $NPX"
BUILD_FAILED=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$WEB_DIR/app/api"
API_DISABLED_DIR="$WEB_DIR/app/_api_disabled"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   MandiGrow Mobile Build — Capacitor Static Export  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 0: Clear stale caches ────────────────────────────────────────────────
# Previous web builds leave /tmp/mandipro-next/types/app/api/... referencing
# routes we're about to move, which breaks typechecking. Nuke both caches.
echo "🧹 Clearing stale build caches..."
rm -rf /tmp/mandipro-next "$WEB_DIR/.next" "$WEB_DIR/out" "$WEB_DIR/tmp"
echo "   ✓ cleared /tmp/mandipro-next, .next, out, tmp"

# ── Step 1: Disable server-only / web-only route trees ──────────────────────
# Each entry is "src|dest". These trees cannot appear in a static export
# (they use API routes, service_role, or dynamic [id] segments that need a
# server). They're restored in Step 4 regardless of build outcome.
DISABLE_LIST=(
    "$WEB_DIR/app/api|$WEB_DIR/app/_api_disabled"
    "$WEB_DIR/app/admin|$WEB_DIR/app/_admin_disabled"
    "$WEB_DIR/app/blog|$WEB_DIR/app/_blog_disabled"
    "$WEB_DIR/app/public|$WEB_DIR/app/_public_disabled"
)
echo "📦 Temporarily disabling web-only / server-only trees..."
for pair in "${DISABLE_LIST[@]}"; do
    src="${pair%%|*}"
    dst="${pair##*|}"
    if [ -d "$src" ]; then
        mv "$src" "$dst"
        echo "   ✓ $(basename "$src") → $(basename "$dst")"
    fi
done

# Web-only files (depend on disabled trees — e.g. sitemap imports blog/posts)
DISABLE_FILES=(
    "$WEB_DIR/app/sitemap.ts|$WEB_DIR/app/_sitemap.ts.disabled"
    "$WEB_DIR/app/robots.ts|$WEB_DIR/app/_robots.ts.disabled"
)
for pair in "${DISABLE_FILES[@]}"; do
    src="${pair%%|*}"
    dst="${pair##*|}"
    if [ -f "$src" ]; then
        mv "$src" "$dst"
        echo "   ✓ $(basename "$src") → $(basename "$dst")"
    fi
done

# ── Step 2: Run the static export build ───────────────────────────────────────
echo ""
echo "🔨 Building Next.js static export..."
# Use .env.mobile if it exists
if [ -f "$WEB_DIR/.env.mobile" ]; then
    echo "   ✓ Loading and force-injecting environment from .env.mobile"
    # Export for current shell
    set -a; source "$WEB_DIR/.env.mobile"; set +a
    # Explicitly pass to next build command
    NEXT_PUBLIC_CAPACITOR=true env $(cat "$WEB_DIR/.env.mobile" | grep -v '^#' | xargs) "$NPX" next build || BUILD_FAILED=1
else
    echo "   ❌ ERROR: .env.mobile missing! Fallback to .env.local"
    if [ -f "$WEB_DIR/.env.local" ]; then
        NEXT_PUBLIC_CAPACITOR=true env $(cat "$WEB_DIR/.env.local" | grep -v '^#' | xargs) "$NPX" next build || BUILD_FAILED=1
    else
        BUILD_FAILED=1
    fi
fi

# ── Step 3: Verification ──────────────────────────────────────────────────────
if [ $BUILD_FAILED -eq 0 ]; then
    echo ""
    echo "🔍 Verifying static bundle environment..."
    if grep -r "supabase.co" out/_next/static/chunks/ > /dev/null; then
        echo "   ✓ Supabase URL confirmed in JS chunks."
    else
        echo "   ⚠️ WARNING: Supabase URL NOT FOUND in static assets! Auth may fail."
    fi
fi

# ── Step 4: Restore ALL disabled trees (ALWAYS, even if build fails) ─────────
echo ""
echo "♻️  Restoring disabled route trees..."
for pair in "${DISABLE_LIST[@]}"; do
    src="${pair%%|*}"
    dst="${pair##*|}"
    if [ -d "$dst" ]; then
        mv "$dst" "$src"
        echo "   ✓ $(basename "$dst") → $(basename "$src")"
    fi
done
for pair in "${DISABLE_FILES[@]}"; do
    src="${pair%%|*}"
    dst="${pair##*|}"
    if [ -f "$dst" ]; then
        mv "$dst" "$src"
        echo "   ✓ $(basename "$dst") → $(basename "$src")"
    fi
done

# ── Step 4: Exit if build failed ─────────────────────────────────────────────
if [ $BUILD_FAILED -eq 1 ]; then
    echo ""
    echo "❌ Build failed. API routes have been restored."
    exit 1
fi

# ── Step 5: Sync to native platforms ─────────────────────────────────────────
echo ""
echo "📱 Syncing to iOS and Android..."
"$NPX" cap sync

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✅ Mobile Build Complete!                          ║"
echo "║                                                      ║"
echo "║   Next steps:                                        ║"
echo "║   iOS:     npm run open:ios    → Xcode → ▶ Run      ║"
echo "║   Android: npm run open:android → Studio → ▶ Run    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
