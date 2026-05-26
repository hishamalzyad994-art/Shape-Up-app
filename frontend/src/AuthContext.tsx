import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureRC, logInRC, logOutRC, isRevenueCatAvailable, getEntitlementActive } from './purchases';

const BACKEND_BASE = 'https://slim-challenge-5.preview.emergentagent.com';
const API_URL = `${BACKEND_BASE}/api`;

function friendlyFetchError(e: any): Error {
  const msg = String(e?.message || e || '').toLowerCase();
  if (
    msg.includes('did not match the expected pattern') ||
    msg.includes('invalid url') ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed')
  ) {
    return new Error("Can't reach the server. Please check your internet connection and try again.");
  }
  return e instanceof Error ? e : new Error(String(e || 'Request failed'));
}

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
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, { ...opts, headers });
    } catch (e) {
      throw friendlyFetchError(e);
    }
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
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
          api('/purchases/sync', { method: 'POST' }).catch(() => {});
        }
      } catch (_) {}
    }

    setSubscription(backend);
    try { await AsyncStorage.setItem('subscription', backend ? JSON.stringify(backend) : ''); } catch (_) {}
    return backend;
  }, [api]);

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
        if (isRevenueCatAvailable()) configureRC(parsed?.id || null).catch(() => {});
      } else {
        if (isRevenueCatAvailable()) configureRC(null).catch(() => {});
      }
      setLoading(false);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    // --- بوابة المراجعة ---
    if (email === "reviewshapeup@gmail.com" && password === "Test1234_Apple") {
      const demoUser = { id: "demo-user-123", email, name: "Apple Reviewer" };
      await AsyncStorage.setItem('token', "demo-token");
      await AsyncStorage.setItem('user', JSON.stringify(demoUser));
      setToken("demo-token");
      setUser(demoUser);
      return;
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (e) {
      throw friendlyFetchError(e);
    }
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
    if (!res.ok) throw new Error(data.detail || 'Invalid email or password');
    await AsyncStorage.setItem('token', data.token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    if (isRevenueCatAvailable()) logInRC(data.user.id).catch(() => {});
    setTimeout(() => { refreshSubscription().catch(() => {}); }, 0);
  };

  const signUp = async (email: string, password: string, name: string) => {
    // --- السماح للمراجع بتخطي الـ Sign up أيضاً ---
    if (email === "reviewshapeup@gmail.com") {
      await signIn(email, password);
      return;
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
    } catch (e) {
      throw friendlyFetchError(e);
    }
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
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
    <AuthContext.Provider value={{ user, token, loading, subscription, signIn, signUp, signOut, refreshUser, refreshSubscription, markSubscriptionActive, api }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
