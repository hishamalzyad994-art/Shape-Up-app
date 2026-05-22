import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureRC, logInRC, logOutRC, isRevenueCatAvailable, getEntitlementActive } from './purchases';

const API_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

type User = {
  id: string;
  email: string;
  name: string;
  profile?: any;
  challenge_start?: string | null;
  streak?: number;
  completed_days?: number[];
};

type SubscriptionStatus = {
  active: boolean;
  plan?: string | null;
  amount?: number | null;
  purchased_at?: string | null;
  access_expires_at?: string | null;
  last_payment_status?: string | null;
};

type AuthCtx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  subscription: SubscriptionStatus | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshSubscription: () => Promise<SubscriptionStatus | null>;
  markSubscriptionActive: (plan?: string) => void;
  api: <T = any>(path: string, opts?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

  const api = useCallback(async <T,>(path: string, opts: RequestInit = {}): Promise<T> => {
    const stored = token || (await AsyncStorage.getItem('token'));
    const headers: any = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (stored) headers['Authorization'] = `Bearer ${stored}`;
    const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(data.detail || `Request failed (${res.status})`);
    }
    return data as T;
  }, [token]);

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await api<User>('/auth/me');
      setUser(fresh);
      await AsyncStorage.setItem('user', JSON.stringify(fresh));
    } catch (e) {
      // token invalid
      await AsyncStorage.multiRemove(['token', 'user']);
      setToken(null);
      setUser(null);
    }
  }, [api]);

  const refreshSubscription = useCallback(async (): Promise<SubscriptionStatus | null> => {
    let backend: SubscriptionStatus | null = null;
    try {
      backend = await api<SubscriptionStatus>('/subscription/status');
    } catch (_) { backend = null; }

    // If the backend reports inactive, double-check with the on-device
    // RevenueCat entitlement — this happens when the backend can't reach
    // RevenueCat (no REVENUECAT_SECRET_KEY) but the user has actually
    // purchased on-device. Trust the SDK as a fallback so the user
    // doesn't get trapped in an infinite paywall redirect loop.
    if ((!backend || !backend.active) && isRevenueCatAvailable()) {
      try {
        const rcActive = await getEntitlementActive();
        if (rcActive) {
          backend = {
            ...(backend || {}),
            active: true,
            plan: backend?.plan || 'yearly',
            access_expires_at: backend?.access_expires_at || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          };
          // Best-effort: ping the server so it can mirror this state when
          // REVENUECAT_SECRET_KEY is eventually configured. Failures here
          // are silent — the user is already through.
          api('/purchases/sync', { method: 'POST' }).catch(() => {});
        }
      } catch (_) {}
    }

    setSubscription(backend);
    try { await AsyncStorage.setItem('subscription', backend ? JSON.stringify(backend) : ''); } catch (_) {}
    return backend;
  }, [api]);

  /** Optimistically flip the local subscription to active. Called right after
   *  RevenueCat reports PURCHASED or RESTORED so the user can enter the app
   *  immediately without waiting on the (best-effort) backend sync. */
  const markSubscriptionActive = useCallback((plan?: string) => {
    const next: SubscriptionStatus = {
      active: true,
      plan: plan || 'yearly',
      access_expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    };
    setSubscription(next);
    AsyncStorage.setItem('subscription', JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('token');
      const u = await AsyncStorage.getItem('user');
      if (t) setToken(t);
      if (u) {
        const parsed = JSON.parse(u);
        setUser(parsed);
        // Bootstrap RevenueCat with the persisted user id on native
        if (isRevenueCatAvailable()) configureRC(parsed?.id || null).catch(() => {});
      } else {
        if (isRevenueCatAvailable()) configureRC(null).catch(() => {});
      }
      setLoading(false);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Login failed');
    await AsyncStorage.setItem('token', data.token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    // Link RevenueCat identity to this user
    if (isRevenueCatAvailable()) logInRC(data.user.id).catch(() => {});
    // Fire-and-forget subscription refresh so index.tsx routing has fresh data
    setTimeout(() => { refreshSubscription().catch(() => {}); }, 0);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Sign up failed');
    await AsyncStorage.setItem('token', data.token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    if (isRevenueCatAvailable()) logInRC(data.user.id).catch(() => {});
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove(['token', 'user', 'subscription']);
    setToken(null);
    setUser(null);
    setSubscription(null);
    if (isRevenueCatAvailable()) logOutRC().catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, subscription, signIn, signUp, signOut, refreshUser, refreshSubscription, api }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export const COLORS = {
  bg: '#050505',
  surface: '#111111',
  surfaceElevated: '#1A1A1A',
  primary: '#FF3B30',
  primaryDark: '#E6352B',
  secondary: '#CCFF00',
  text: '#FFFFFF',
  textDim: '#A1A1AA',
  border: '#27272A',
  success: '#22C55E',
  error: '#EF4444',
};
