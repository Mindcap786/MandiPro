/**
 * Auth Store — Zustand
 * --------------------
 * Global auth state mirroring web AuthProvider logic:
 *   - Session/profile hydration from Supabase + SecureStore
 *   - Login (email/password), Signup (email/password + metadata), Logout
 *   - Profile fetch with org join (core.profiles → core.organizations)
 *   - Auth state change listener (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT)
 *   - MMKV profile cache for instant cold-start UI
 *   - Session version enforcement (admin force-logout)
 */

import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';
import { core } from '@/api/db';
import { Profile, Organization } from '@/types/models';
import {
  saveTokens,
  clearAllSecureData,
  cacheSet,
  cacheGet,
  cacheClear,
  hydrateCache,
} from '@/services/secure-storage';

// ─── Types ──────────────────────────────────────────────────

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileNotFound: boolean;

  /** Hydrate session from SecureStore → fetch profile → ready */
  initialize: () => Promise<void>;

  /** Email + password sign-in */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;

  /** Email + password sign-up with user metadata */
  signUp: (params: {
    email: string;
    password: string;
    fullName: string;
    username: string;
    businessName: string;
  }) => Promise<{ error: string | null }>;

  /** Full sign-out: wipe tokens, cache, reset state */
  signOut: () => Promise<void>;

  /** Re-fetch profile (e.g. after org settings change) */
  refreshProfile: () => Promise<void>;
}

// ─── Profile Fetcher ────────────────────────────────────────

async function fetchProfileForUser(userId: string): Promise<{
  profile: Profile | null;
  notFound: boolean;
}> {
  try {
    const { data: prof, error: profError } = await core()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profError) {
      console.error('[AuthStore] Profile query error:', profError.message);
      return { profile: null, notFound: false };
    }

    if (!prof) {
      console.log('[AuthStore] No profile row — new user');
      return { profile: null, notFound: true };
    }

    // Fetch organization
    let orgData: Organization | null = null;
    if (prof.organization_id) {
      const { data, error: orgError } = await core()
        .from('organizations')
        .select('*')
        .eq('id', prof.organization_id)
        .maybeSingle();

      if (orgError) {
        console.warn('[AuthStore] Org fetch error (non-fatal):', orgError.message);
      } else {
        orgData = data as Organization;
      }
    }

    // If user belongs to an org but org fetch failed, don't return partial profile
    if (prof.organization_id && !orgData) {
      console.error('[AuthStore] Organization lookup failed for user', userId);
      return { profile: null, notFound: false };
    }

    const fullProfile: Profile = {
      ...prof,
      organization: orgData!,
    } as unknown as Profile;

    return { profile: fullProfile, notFound: false };
  } catch (err: any) {
    console.error('[AuthStore] Profile fetch failed:', err.message);
    return { profile: null, notFound: false };
  }
}

// ─── Store ──────────────────────────────────────────────────

const PROFILE_CACHE_KEY = 'mp_profile_cache';
const SESSION_VERSION_KEY = 'mp_session_v';

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileNotFound: false,

  initialize: async () => {
    set({ loading: true });

    // 0. Hydrate AsyncStorage into memory sync cache
    await hydrateCache();

    // 1. Instant UI from memory cache
    const cached = cacheGet<Profile>(PROFILE_CACHE_KEY);
    if (cached) {
      set({ profile: cached });
    }

    // 2. Hydrate session from SecureStore (Supabase handles this via its storage adapter)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    set({ session, user: session?.user ?? null });

    if (session?.user) {
      const { profile, notFound } = await fetchProfileForUser(session.user.id);
      if (profile) {
        set({ profile, profileNotFound: false });
        cacheSet(PROFILE_CACHE_KEY, profile);
      } else {
        set({ profileNotFound: notFound });
      }
    } else {
      set({ profile: null, profileNotFound: false });
    }

    set({ loading: false });

    // 3. Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[AuthStore] Event:', event);
      set({ session: newSession, user: newSession?.user ?? null });

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        if (newSession?.user) {
          // Skip refetch on TOKEN_REFRESHED if we already have a profile
          if (event === 'TOKEN_REFRESHED' && get().profile) {
            set({ loading: false });
            return;
          }

          if (event === 'SIGNED_IN') {
            // Touch session for force-logout tracking
            try {
              await supabase.rpc('touch_session', { p_user_id: newSession.user.id });
            } catch {}
          }

          const { profile, notFound } = await fetchProfileForUser(newSession.user.id);
          if (profile) {
            set({ profile, profileNotFound: false });
            cacheSet(PROFILE_CACHE_KEY, profile);

            // Session version enforcement
            if (profile.session_version) {
              const lastKnown = cacheGet<number>(SESSION_VERSION_KEY);
              if (lastKnown && lastKnown < profile.session_version) {
                console.warn('[AuthStore] Session version mismatch. Force sign-out.');
                get().signOut();
                return;
              }
              cacheSet(SESSION_VERSION_KEY, profile.session_version);
            }
          } else {
            set({ profileNotFound: notFound });
          }
        }
      } else if (event === 'SIGNED_OUT') {
        set({ profile: null, profileNotFound: false });
        cacheClear();
      }

      set({ loading: false });
    });
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false });
      return { error: error.message };
    }
    // Profile fetch happens via onAuthStateChange → SIGNED_IN
    return { error: null };
  },

  signUp: async ({ email, password, fullName, username, businessName }) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username,
          business_name: businessName,
        },
      },
    });
    if (error) {
      set({ loading: false });
      return { error: error.message };
    }
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await clearAllSecureData();
    cacheClear();
    set({
      session: null,
      user: null,
      profile: null,
      loading: false,
      profileNotFound: false,
    });
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;
    const { profile, notFound } = await fetchProfileForUser(userId);
    if (profile) {
      set({ profile, profileNotFound: false });
      cacheSet(PROFILE_CACHE_KEY, profile);
    } else {
      set({ profileNotFound: notFound });
    }
  },
}));
