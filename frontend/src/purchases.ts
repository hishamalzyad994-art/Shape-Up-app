// RevenueCat wrapper — single source of truth for all native IAP calls.
// Short-circuits cleanly on web (which still uses Stripe checkout via /api/subscription/checkout).
//
// Public surface (cross-platform safe):
//   isRevenueCatAvailable()       → true only on iOS/Android with an API key
//   configureRC(jwtUserId|null)    → call once at app launch (idempotent)
//   logInRC(jwtUserId)             → switch identity (do not call configure again)
//   getEntitlementActive()         → boolean — has the user an active 'shapeup_pro' entitlement?
//   fetchOfferings()               → returns the default offering or null
//   presentPaywall()               → opens RevenueCat's hosted paywall
//   presentPaywallIfNeeded()       → only opens it when entitlement is missing
//   restorePurchases()             → re-link prior purchases on the same store account
//   presentCustomerCenter()        → RevenueCat's Customer Center (cancel / refund / restore)
//   addCustomerInfoListener(cb)    → subscribe to entitlement changes; returns unsubscribe fn

import { Platform } from 'react-native';

const ENTITLEMENT = process.env.EXPO_PUBLIC_RC_ENTITLEMENT || 'shapeup_pro';
const OFFERING    = process.env.EXPO_PUBLIC_RC_OFFERING    || 'default';

export type PaywallResultLite = 'PURCHASED' | 'RESTORED' | 'CANCELLED' | 'ERROR' | 'NOT_PRESENTED' | 'UNAVAILABLE';

let configured = false;
let cachedHasEntitlement: boolean | null = null;

function getApiKey(): string | null {
  if (Platform.OS === 'ios')     return process.env.EXPO_PUBLIC_RC_IOS_KEY    || null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_RC_ANDROID_KEY || null;
  return null;
}

export function isRevenueCatAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return !!getApiKey();
}

/** Lazy-load the SDK so the web bundle never tries to resolve native binaries. */
async function loadSDK() {
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('react-native-purchases');
    return mod.default || mod;
  } catch (e) {
    console.warn('[RC] react-native-purchases unavailable — likely running in Expo Go. Use a dev build.', e);
    return null;
  }
}

async function loadUI() {
  if (Platform.OS === 'web') return null;
  try {
    const mod: any = await import('react-native-purchases-ui');
    return mod.default || mod;
  } catch (e) {
    console.warn('[RC] react-native-purchases-ui unavailable — likely Expo Go.', e);
    return null;
  }
}

export async function configureRC(appUserId: string | null): Promise<void> {
  if (configured) return;
  if (!isRevenueCatAvailable()) return;
  const Purchases = await loadSDK();
  if (!Purchases) return;
  try {
    if (__DEV__) Purchases.setLogLevel?.('VERBOSE');
    await Purchases.configure({ apiKey: getApiKey()!, appUserID: appUserId || undefined });
    configured = true;
  } catch (e) {
    console.warn('[RC] configure failed', e);
  }
}

export async function logInRC(appUserId: string): Promise<void> {
  if (!isRevenueCatAvailable() || !configured) return;
  const Purchases = await loadSDK();
  if (!Purchases) return;
  try { await Purchases.logIn(appUserId); }
  catch (e) { console.warn('[RC] logIn failed', e); }
}

export async function logOutRC(): Promise<void> {
  if (!isRevenueCatAvailable() || !configured) return;
  const Purchases = await loadSDK();
  if (!Purchases) return;
  try { await Purchases.logOut(); cachedHasEntitlement = null; }
  catch (e) { console.warn('[RC] logOut failed', e); }
}

export async function getEntitlementActive(): Promise<boolean> {
  if (!isRevenueCatAvailable()) return false;
  const Purchases = await loadSDK();
  if (!Purchases) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    const active = !!info?.entitlements?.active?.[ENTITLEMENT];
    cachedHasEntitlement = active;
    return active;
  } catch (e) {
    console.warn('[RC] getCustomerInfo failed', e);
    return cachedHasEntitlement ?? false;
  }
}

export async function fetchOfferings() {
  if (!isRevenueCatAvailable()) return null;
  const Purchases = await loadSDK();
  if (!Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.all?.[OFFERING] || offerings?.current || null;
    if (!current || !current.availablePackages?.length) return null;
    return current;
  } catch (e) {
    console.warn('[RC] getOfferings failed', e);
    return null;
  }
}

export async function presentPaywall(): Promise<PaywallResultLite> {
  if (!isRevenueCatAvailable()) return 'UNAVAILABLE';
  const UI = await loadUI();
  if (!UI?.presentPaywall) return 'UNAVAILABLE';
  try {
    const offering = await fetchOfferings();
    const result = offering
      ? await UI.presentPaywall({ offering })
      : await UI.presentPaywall();
    return mapResult(result);
  } catch (e) {
    console.warn('[RC] presentPaywall failed', e);
    return 'ERROR';
  }
}

export async function presentPaywallIfNeeded(): Promise<PaywallResultLite> {
  if (!isRevenueCatAvailable()) return 'UNAVAILABLE';
  const UI = await loadUI();
  if (!UI?.presentPaywallIfNeeded) return 'UNAVAILABLE';
  try {
    const result = await UI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT,
    });
    return mapResult(result);
  } catch (e) {
    console.warn('[RC] presentPaywallIfNeeded failed', e);
    return 'ERROR';
  }
}

export async function restorePurchases(): Promise<{ ok: boolean; hasEntitlement: boolean }> {
  if (!isRevenueCatAvailable()) return { ok: false, hasEntitlement: false };
  const Purchases = await loadSDK();
  if (!Purchases) return { ok: false, hasEntitlement: false };
  try {
    const info = await Purchases.restorePurchases();
    const has = !!info?.entitlements?.active?.[ENTITLEMENT];
    cachedHasEntitlement = has;
    return { ok: true, hasEntitlement: has };
  } catch (e) {
    console.warn('[RC] restore failed', e);
    return { ok: false, hasEntitlement: false };
  }
}

export async function presentCustomerCenter(): Promise<boolean> {
  if (!isRevenueCatAvailable()) return false;
  const UI = await loadUI();
  if (!UI?.presentCustomerCenter) return false;
  try {
    await UI.presentCustomerCenter();
    return true;
  } catch (e) {
    console.warn('[RC] customer center failed', e);
    return false;
  }
}

export async function addCustomerInfoListener(cb: (hasEntitlement: boolean) => void): Promise<() => void> {
  if (!isRevenueCatAvailable()) return () => {};
  const Purchases = await loadSDK();
  if (!Purchases?.addCustomerInfoUpdateListener) return () => {};
  const listener = (info: any) => {
    const has = !!info?.entitlements?.active?.[ENTITLEMENT];
    cachedHasEntitlement = has;
    cb(has);
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    try { Purchases.removeCustomerInfoUpdateListener?.(listener); } catch {}
  };
}

function mapResult(r: any): PaywallResultLite {
  const v = typeof r === 'string' ? r : (r?.result || r);
  switch (v) {
    case 'PURCHASED':
    case 0:
    case 'purchased':
      return 'PURCHASED';
    case 'RESTORED':
    case 1:
    case 'restored':
      return 'RESTORED';
    case 'CANCELLED':
    case 2:
    case 'cancelled':
      return 'CANCELLED';
    case 'NOT_PRESENTED':
    case 3:
    case 'not_presented':
      return 'NOT_PRESENTED';
    case 'ERROR':
    case 'error':
    default:
      return 'ERROR';
  }
}

export { ENTITLEMENT, OFFERING };
