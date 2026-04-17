import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    // ── Core Identity ──────────────────────────────────────────────────
    appId: 'com.mandigrow.app',
    appName: 'MandiGrow',
    // ── Web Source ─────────────────────────────────────────────────────
    // Points to the Next.js static export output directory
    webDir: 'out',

    // ── Server ─────────────────────────────────────────────────────────
    // Use a consistent origin to avoid CORS/SSL blocks in WebView
    server: {
        hostname: 'localhost',
        androidScheme: 'https',
        iosScheme: 'https',
        cleartext: false,
    },

    // ── iOS Configuration ──────────────────────────────────────────────
    ios: {
        allowsLinkPreview: false,
        backgroundColor: '#F5F5F7',
        contentInset: 'automatic',
        scrollEnabled: true, // true = inner scroll works; WebView bounce killed by CSS overscroll-behavior
    },

    // ── Android Configuration ──────────────────────────────────────────
    android: {
        backgroundColor: '#F5F5F7',
        allowMixedContent: false,
    },

    // ── Plugins ────────────────────────────────────────────────────────
    plugins: {
        // StatusBar: match app's dark header theme
        StatusBar: {
            style: 'Dark',
            backgroundColor: '#050510',
            overlaysWebView: false,
        },
        // Keyboard: scroll content up when keyboard appears
        // 'native' = WebView viewport shrinks when keyboard opens.
        // 'body' caused white gap + min-h-screen fighting the keyboard.
        Keyboard: {
            resize: 'native' as any,
            style: 'dark' as any,
            resizeOnFullScreen: true,
        },
        // SplashScreen config (add @capacitor/splash-screen when needed)
        SplashScreen: {
            launchShowDuration: 1500,
            backgroundColor: '#050510',
            showSpinner: false,
        },
        // Deep Link URL scheme: mandigrow://
        // Register this scheme in:
        //   iOS    → ios/App/App/Info.plist (CFBundleURLSchemes)
        //   Android → android/app/src/main/AndroidManifest.xml (intent-filter)
        App: {
            // We handle back button ourselves in CapacitorProvider
            disableBackButtonHandler: false,
        },
    },
};

export default config;
