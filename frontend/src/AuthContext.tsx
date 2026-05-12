import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

type AuthCtx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  api: <T = any>(path: string, opts?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('token');
      const u = await AsyncStorage.getItem('user');
      if (t) setToken(t);
      if (u) setUser(JSON.parse(u));
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
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signUp, signOut, refreshUser, api }}>
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
