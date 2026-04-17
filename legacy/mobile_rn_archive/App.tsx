// URL polyfill MUST be first — Supabase uses URL internally and RN's
// built-in URL has read-only properties that cause "cannot assign to protocol"
import 'react-native-url-polyfill/auto';

/**
 * MandiPro Mobile — App Entry Point
 * ───────────────────────────────────
 * Provider tree (outermost → innermost):
 *   SafeAreaProvider         — insets for notch/home bar
 *   QueryClientProvider      — React Query cache
 *   GestureHandlerRootView   — react-native-gesture-handler
 *   AppToastProvider         — Global toast overlay
 *   AuthGate                 — initializes Zustand auth store
 *   RootNavigator            — routes based on session state
 */

import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { RootNavigator } from '@/navigation/RootNavigator';
import { Toast } from '@/components/feedback';

// ─── React Query Client ─────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // 30s stale-while-revalidate
      retry: 2,
      retryDelay: (attempt) => Math.min(200 * 2 ** attempt, 3000),
      refetchOnWindowFocus: false,  // Mobile: don't refetch on app focus by default
    },
    mutations: {
      retry: 0,                    // Mutations fail fast
    },
  },
});

// ─── Auth Gate — initializes Supabase session on boot ───────

function AuthGate({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return <>{children}</>;
}

// ─── Toast Provider — global overlay ────────────────────────

function AppToastProvider({ children }: { children: React.ReactNode }) {
  const { visible, message, type, dismiss } = useToastStore();

  return (
    <>
      {children}
      <Toast visible={visible} message={message} type={type} onDismiss={dismiss} />
    </>
  );
}

// ─── Root App Component ──────────────────────────────────────

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppToastProvider>
            <AuthGate>
              <RootNavigator />
            </AuthGate>
          </AppToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
