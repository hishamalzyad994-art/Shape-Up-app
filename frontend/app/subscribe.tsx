import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, COLORS } from '../src/AuthContext';
import { useLang } from '../src/i18n';
import { isRevenueCatAvailable, presentPaywall, restorePurchases, getEntitlementActive } from '../src/purchases';
import { Ionicons } from '@expo/vector-icons';

export default function Subscribe() {
  const { api, refreshUser, user, markSubscriptionActive, refreshSubscription } = useAuth();
  const router = useRouter();
  const { t, country: ctxCountry } = useLang();
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const [plans, setPlans] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [selected, setSelected] = useState<string>('monthly');
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(3);
  const [trialEligible, setTrialEligible] = useState<boolean>(true);
  const pollRef = useRef<any>(null);

  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  // Cleanup any polling interval on unmount
  useEffect(() => () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const load = useCallback(async () => {
    try {
      const qs = ctxCountry ? `?country=${encodeURIComponent(ctxCountry)}` : '';
      const p = await api<any>(`/subscription/plans${qs}`);
      setPlans(p.plans || []);
      setTrialDays(p.trial_days ?? 3);
      setTrialEligible(p.trial_eligible !== false);
      setCurrencyCode(p.currency || 'USD');
      const s = await api<any>('/subscription/status');
      setStatus(s);
    } catch (_) {}
  }, [api, ctxCountry]);

  useEffect(() => { load(); }, [load]);

  // If we returned from Stripe with a session_id, poll for status
  useEffect(() => {
    if (!session_id) return;
    setPolling(true);
    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const r = await api<any>(`/subscription/poll/${session_id}`);
        if (r.payment_status === 'paid') {
          await refreshUser();
          await load();
          // Schedule daily workout reminder once user has paid
          try {
            const { scheduleDailyReminder } = await import('../src/notifications');
            await scheduleDailyReminder(9, 0);
          } catch (_) {}
          setPolling(false);
          Alert.alert('🎉 SUCCESS', `${trialEligible ? `Your ${trialDays}-day free trial has started!\n` : ''}Access granted!\nValid until ${new Date(r.access_expires_at).toLocaleDateString()}\n\nDaily workout reminders are now ON.`,
            [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }]);
          return;
        }
        if (r.checkout_status === 'expired' || attempts >= 30) {
          setPolling(false);
          if (r.checkout_status === 'expired') {
            Alert.alert('Checkout expired', 'Please try again.');
          }
          return;
        }
        pollRef.current = setTimeout(tick, 2000);
      } catch (e: any) {
        attempts++;
        if (attempts >= 30) {
          setPolling(false);
          Alert.alert('Payment confirmation timed out', 'Please refresh or contact support if you were charged.');
          return;
        }
        // network blip — keep polling
        pollRef.current = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [session_id]);

  const subscribe = async (plan: string) => {
    setLoading(true); setSelected(plan);
    try {
      // Native iOS/Android → MUST use RevenueCat (Apple Guideline 3.1.1 / Google Play Billing).
      // We do NOT fall back to Stripe on native — Apple rejects external payment links.
      if (isRevenueCatAvailable()) {
        const result = await presentPaywall();
        if (result === 'PURCHASED' || result === 'RESTORED') {
          // 1) Optimistically unlock the app IMMEDIATELY using the local
          //    RevenueCat entitlement. This is what Apple's 2.1(a) rejection
          //    was about — never trap the user on the paywall after a
          //    successful purchase, even if our backend sync is slow/down.
          markSubscriptionActive(plan);
          // 2) Best-effort backend sync (will be a no-op if REVENUECAT_SECRET_KEY
          //    isn't set on the server yet — that's fine, the SDK is authoritative).
          api('/purchases/sync', { method: 'POST' }).catch(() => {});
          // 3) Schedule the daily reminder so we deliver on the value prop.
          try {
            const { scheduleDailyReminder } = await import('../src/notifications');
            scheduleDailyReminder(9, 0).catch(() => {});
          } catch (_) {}
          // 4) Refresh subscription state in the background, then navigate
          //    the user into the app. We use replace() so the back button
          //    can't bring them back to the paywall.
          refreshSubscription().catch(() => {});
          refreshUser().catch(() => {});
          setLoading(false);
          Alert.alert(
            result === 'RESTORED' ? 'Restored ✨' : '🎉 SUCCESS',
            result === 'RESTORED'
              ? 'Your subscription is active.'
              : 'Your subscription is active!',
            [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }],
          );
          return;
        }
        if (result === 'CANCELLED' || result === 'NOT_PRESENTED') {
          setLoading(false);
          return; // user closed the sheet — no error needed
        }
        // UNAVAILABLE / ERROR on native = RC not yet fully configured, no
        // offerings live, or App Store sandbox issue. We CANNOT fall back to
        // Stripe on native (Apple/Google rejection). Show a clear retry msg.
        setLoading(false);
        Alert.alert(
          'Subscription temporarily unavailable',
          'The App Store is not responding right now. Please check your internet connection, make sure you\'re signed in to the App Store, and try again in a moment.\n\nIf the problem persists, email support@shapeupapp.com.',
        );
        return;
      }
      // Web preview ONLY → Stripe Checkout. Native builds NEVER reach here
      // because isRevenueCatAvailable() is true on iOS/Android with API keys.
      if (Platform.OS === 'web') {
        await stripeCheckout(plan);
        return;
      }
      // Native build without RC API keys = misconfigured build. Don't fall
      // back to Stripe — fail loudly so we catch it in QA before submission.
      setLoading(false);
      Alert.alert(
        'Subscription unavailable',
        'In-app purchases are not configured for this build. Please reinstall the app from the App Store or Google Play.',
      );
    } catch (e: any) {
      setLoading(false);
      Alert.alert(
        'Subscription unavailable',
        'We could not start the subscription. Please check your internet connection and try again. If the problem persists, contact support@shapeupapp.com.',
      );
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      if (!isRevenueCatAvailable()) {
        setLoading(false);
        Alert.alert(
          'Restore on iOS/Android',
          'Purchase restore works inside the native iPhone or Android app. On the web you can manage your subscription from the Profile tab.',
        );
        return;
      }
      const r = await restorePurchases();
      setLoading(false);
      if (r.hasEntitlement) {
        // Unlock immediately + navigate so the user can never get trapped.
        markSubscriptionActive('yearly');
        api('/purchases/sync', { method: 'POST' }).catch(() => {});
        refreshSubscription().catch(() => {});
        refreshUser().catch(() => {});
        Alert.alert(
          'Restored ✨',
          'Your subscription is active.',
          [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }],
        );
        return;
      }
      // Friendly bucketed messages — never let a raw SDK error reach the user
      if (r.error === 'network') {
        Alert.alert(
          'No internet',
          'Please connect to Wi-Fi or cellular and try again.',
        );
      } else if (r.error === 'no_products' || r.error === 'unavailable' || r.error === 'sdk_unavailable') {
        Alert.alert(
          'No subscriptions found',
          "We didn't find a purchase on this Apple ID. If you just subscribed, please wait a few seconds and try again, or contact support@shapeupapp.com.",
        );
      } else {
        Alert.alert(
          'No purchases to restore',
          "We didn't find an active subscription tied to this Apple ID. If you previously paid with a different Apple ID, switch to it in Settings → [your name] → Media & Purchases and try again.",
        );
      }
    } catch (e: any) {
      setLoading(false);
      Alert.alert(
        'Restore failed',
        'Something went wrong while restoring. Please check your connection and try again.',
      );
    }
  };

  const stripeCheckout = async (plan: string) => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await api<any>('/subscription/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan, origin_url: origin, country: ctxCountry || undefined }),
      });
      if (Platform.OS === 'web') {
        // The Emergent preview wraps the app in an iframe; Stripe Checkout
        // sets X-Frame-Options: DENY which renders as a blank white page when
        // we redirect the iframe. Open in a new tab instead and start polling
        // for the session to flip to 'paid' on our backend.
        const sid = res.session_id as string | undefined;
        const url = res.url as string;
        let opened: Window | null = null;
        try { opened = window.open(url, '_blank', 'noopener'); } catch (_) { opened = null; }
        if (!opened) {
          // Popup blocked → break out of the iframe to the top frame, or
          // last-resort: replace the iframe (legacy behaviour).
          try {
            if (window.top && window.top !== window) {
              (window.top as Window).location.href = url;
            } else {
              window.location.href = url;
            }
          } catch (_) {
            window.location.href = url;
          }
          return;
        }
        // Show waiting overlay and start polling
        if (sid) {
          setPendingSessionId(sid);
          setPolling(true);
          startWebPolling(sid);
        }
      } else {
        await Linking.openURL(res.url);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  // Web-only polling for when the user pays in a new tab. We hit
  // /subscription/poll/{session_id} every 4s for up to 6 minutes.
  const startWebPolling = useCallback((sid: string) => {
    if (pollRef.current) { clearInterval(pollRef.current); }
    let attempts = 0;
    const max = 90; // 6 minutes @ 4s
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const r = await api<any>(`/subscription/poll/${sid}`);
        if (r?.payment_status === 'paid' || r?.status === 'paid' || r?.active === true) {
          clearInterval(pollRef.current); pollRef.current = null;
          setPolling(false); setPendingSessionId(null);
          await refreshUser(); await load();
          Alert.alert('🎉 SUCCESS', `${trialEligible ? `Your ${trialDays}-day free trial has started!\n` : ''}You're Pro.`);
          return;
        }
      } catch (_) {}
      if (attempts >= max) {
        clearInterval(pollRef.current); pollRef.current = null;
        setPolling(false);
      }
    }, 4000);
  }, [api, refreshUser, load, trialEligible, trialDays]);

  const expiresStr = status?.access_expires_at
    ? new Date(status.access_expires_at).toLocaleDateString()
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={28} color={COLORS.text} />
        </TouchableOpacity>

        <Text style={styles.kicker}>{t('shapeup_pro')}</Text>
        <Text style={styles.title}>{t('unlock_everything')}</Text>
        <View style={styles.accentBar} />

        {!status?.active && trialEligible && (
          <View style={styles.trialBanner} testID="trial-banner">
            <View style={styles.trialBadge}>
              <Ionicons name="gift" size={18} color="#000" />
              <Text style={styles.trialBadgeText}>{t('three_days_free_trial')}</Text>
            </View>
            <Text style={styles.trialTitle}>{t('try_pro_free')}</Text>
            <Text style={styles.trialSubtitle}>
              {t('card_required')}{'\n'}
              <Text style={{ fontWeight: '900', color: COLORS.text }}>
                {t('cancel_anytime')}
              </Text>
            </Text>
          </View>
        )}

        {status?.active ? (
          <View style={styles.activeCard} testID="sub-active-card">
            <Ionicons name="checkmark-circle" size={48} color={COLORS.secondary} />
            <Text style={styles.activeTitle}>{t('you_are_pro')}</Text>
            <Text style={styles.activeText}>
              {t('choose_plan').toUpperCase()}: <Text style={{ color: COLORS.secondary, fontWeight: '900' }}>{status.plan?.toUpperCase()}</Text>
              {'\n'}{status.auto_renew && !status.cancel_at_period_end
                ? <>Renews on <Text style={{ color: COLORS.text, fontWeight: '900' }}>{expiresStr}</Text></>
                : <>Access until <Text style={{ color: COLORS.text, fontWeight: '900' }}>{expiresStr}</Text></>}
              {status.cancel_at_period_end && (
                <>{'\n'}<Text style={{ color: '#F59E0B' }}>Cancellation scheduled — no further charges.</Text></>
              )}
            </Text>
            <TouchableOpacity style={styles.continueBtn} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.continueBtnText}>{t('back_to_app')}</Text>
            </TouchableOpacity>
            {status.auto_renew && !status.cancel_at_period_end && (
              <TouchableOpacity
                testID="cancel-subscription-btn"
                style={styles.cancelBtn}
                onPress={() => {
                  Alert.alert(
                    'Cancel subscription?',
                    `You'll keep access until ${expiresStr}. No further charges.`,
                    [
                      { text: 'Keep it', style: 'cancel' },
                      { text: 'Cancel', style: 'destructive', onPress: async () => {
                        try {
                          await api('/subscription/cancel', { method: 'POST' });
                          await load();
                          Alert.alert('Subscription cancelled', `No further charges. Access stays until ${expiresStr}.`);
                        } catch (e: any) {
                          Alert.alert('Error', e.message || 'Cancel failed');
                        }
                      }},
                    ]
                  );
                }}
              >
                <Text style={styles.cancelBtnText}>{t('cancel_subscription')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {polling && (
          <View style={styles.pollingBox}>
            <ActivityIndicator color={COLORS.secondary} />
            <Text style={styles.pollingText}>Confirming your payment...</Text>
          </View>
        )}

        <View style={styles.benefits}>
          <Benefit icon="flame" text={t('benefit_workouts')} />
          <Benefit icon="restaurant" text={t('benefit_meals')} />
          <Benefit icon="chatbubbles" text={t('benefit_chat')} />
          <Benefit icon="trending-up" text={t('benefit_reports')} />
          <Benefit icon="trophy" text={t('benefit_streaks')} />
        </View>

        <Text style={styles.sectionLbl}>{t('choose_plan')}</Text>
        {plans.map(p => {
          const isYearly = p.key === 'yearly';
          const isMonthly = p.key === 'monthly';
          const highlight = isYearly;
          const planLabel = p.key === 'monthly' ? t('monthly') : p.key === 'sixmonths' ? t('six_months') : t('yearly');
          const planPeriod = p.key === 'monthly' ? t('per_month') : p.key === 'sixmonths' ? t('every_6_months') : t('per_year');
          return (
            <TouchableOpacity
              key={p.key}
              testID={`plan-${p.key}`}
              style={[styles.planCard, selected === p.key && styles.planCardSelected, highlight && styles.planCardHighlight]}
              onPress={() => setSelected(p.key)}
              activeOpacity={0.85}
            >
              {highlight && (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestText}>{t('best_value')}</Text>
                </View>
              )}
              {isMonthly && (
                <View style={[styles.bestBadge, { backgroundColor: COLORS.secondary }]}>
                  <Text style={[styles.bestText, { color: '#000' }]}>{t('auto_renew_badge')}</Text>
                </View>
              )}
              <View style={styles.planLeft}>
                <Text style={styles.planLabel}>{planLabel.toUpperCase()}</Text>
                {trialEligible ? (
                  <>
                    <Text style={styles.planPrice}>{t('free_for_3_days').toUpperCase()}</Text>
                    <Text style={styles.planPeriod}>
                      <Text style={{ color: COLORS.text, fontWeight: '900' }}>{t('then_price')} {p.display}</Text> {planPeriod}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.planPrice}>{p.display}</Text>
                    <Text style={styles.planPeriod}>{planPeriod}</Text>
                  </>
                )}
              </View>
              <View style={styles.planRight}>
                {p.savings && <Text style={styles.savings}>{p.savings}</Text>}
                <View style={[styles.radio, selected === p.key && styles.radioSelected]}>
                  {selected === p.key && <View style={styles.radioDot} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          testID="subscribe-btn"
          style={[styles.cta, (loading || polling) && { opacity: 0.6 }]}
          onPress={() => subscribe(selected)}
          disabled={loading || polling || !!status?.active}
        >
          {loading ? <ActivityIndicator color="#000" /> : (
            <Text style={styles.ctaText}>
              {status?.active
                ? t('already_active')
                : trialEligible
                  ? t('start_free_trial')
                  : t('subscribe_now')}
            </Text>
          )}
        </TouchableOpacity>

        {!status?.active && trialEligible && (
          <Text style={styles.disclaimer} testID="trial-disclaimer">
            {t('cancel_anytime')}
          </Text>
        )}

        {isRevenueCatAvailable() && !status?.active && (
          <TouchableOpacity testID="restore-btn" style={styles.restoreBtn} onPress={handleRestore}>
            <Ionicons name="refresh" size={14} color={COLORS.textDim} />
            <Text style={styles.restoreText}>RESTORE PURCHASES</Text>
          </TouchableOpacity>
        )}

        {/* Web-only: waiting-for-Stripe overlay when checkout was opened in a new tab */}
        {polling && pendingSessionId && (
          <View style={styles.waitingBox} testID="payment-waiting">
            <ActivityIndicator size="large" color={COLORS.secondary} />
            <Text style={styles.waitingTitle}>WAITING FOR PAYMENT…</Text>
            <Text style={styles.waitingBody}>
              We opened Stripe Checkout in a new tab. Once you finish there, this page will update automatically.
            </Text>
            <TouchableOpacity
              testID="payment-recheck"
              style={styles.waitingBtn}
              onPress={async () => {
                try {
                  const r = await api<any>(`/subscription/poll/${pendingSessionId}`);
                  if (r.payment_status === 'paid' || r.active) {
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    setPolling(false); setPendingSessionId(null);
                    await refreshUser(); await load();
                    Alert.alert('🎉 SUCCESS', `${trialEligible ? `Your ${trialDays}-day free trial has started!\n` : ''}You're Pro.`);
                  } else {
                    Alert.alert('Still pending', 'Payment is not yet confirmed. If you completed checkout, please wait a few seconds.');
                  }
                } catch (e: any) { Alert.alert('Error', e.message || 'Check failed'); }
              }}
            >
              <Text style={styles.waitingBtnText}>I'VE PAID — CHECK NOW</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                setPolling(false); setPendingSessionId(null);
              }}
            >
              <Text style={styles.waitingCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.legal}>
          {currencyCode ? `(${currencyCode}) ` : ''}{trialEligible && !status?.active
            ? `${trialDays}-day free trial then auto-renews at the selected plan price until cancelled.`
            : 'Auto-renews until cancelled.'}
        </Text>

        {/* Apple-required legal links + web app link */}
        <View style={styles.legalLinksRow} testID="subscribe-legal-links">
          <TouchableOpacity
            testID="legal-link-website"
            onPress={() => Linking.openURL('https://shapeupapp.base44.app/')}
          >
            <Text style={styles.legalLink}>OPEN WEB APP</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>•</Text>
          <TouchableOpacity
            testID="legal-link-eula"
            onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
          >
            <Text style={styles.legalLink}>EULA (TERMS OF USE)</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>•</Text>
          <TouchableOpacity
            testID="legal-link-privacy"
            onPress={() => router.push('/privacy')}
          >
            <Text style={styles.legalLink}>PRIVACY</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Benefit({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitIcon}>
        <Ionicons name={icon} size={18} color={COLORS.secondary} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 60 },
  backBtn: { alignSelf: 'flex-end', padding: 6 },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800', marginTop: 8 },
  title: { color: COLORS.text, fontSize: 44, fontWeight: '900', letterSpacing: -1.5, lineHeight: 44, marginTop: 6 },
  accentBar: { width: 50, height: 4, backgroundColor: COLORS.primary, marginTop: 12, marginBottom: 24 },
  trialBanner: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.secondary, padding: 18, marginBottom: 20 },
  trialBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: COLORS.secondary, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  trialBadgeText: { color: '#000', fontWeight: '900', letterSpacing: 1.5, fontSize: 12 },
  trialTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.3, marginBottom: 8 },
  trialSubtitle: { color: COLORS.textDim, fontSize: 13, lineHeight: 19 },
  disclaimer: { color: COLORS.text, fontSize: 12, textAlign: 'center', marginTop: 10, fontWeight: '700' },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 8 },
  restoreText: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  waitingBox: { marginTop: 20, padding: 22, backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.secondary, alignItems: 'center' },
  waitingTitle: { color: COLORS.text, fontSize: 14, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  waitingBody: { color: COLORS.textDim, fontSize: 12, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  waitingBtn: { marginTop: 16, backgroundColor: COLORS.secondary, paddingVertical: 14, paddingHorizontal: 20, alignSelf: 'stretch', alignItems: 'center' },
  waitingBtnText: { color: '#000', fontWeight: '900', letterSpacing: 1.5, fontSize: 13 },
  waitingCancel: { color: COLORS.textDim, fontSize: 12, marginTop: 10, fontWeight: '700' },
  activeCard: { borderWidth: 1, borderColor: COLORS.secondary, backgroundColor: COLORS.surface, padding: 22, alignItems: 'center', marginBottom: 24 },
  activeTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: 1, marginTop: 10 },
  activeText: { color: COLORS.textDim, fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  continueBtn: { backgroundColor: COLORS.secondary, paddingVertical: 12, paddingHorizontal: 30, marginTop: 16 },
  continueBtnText: { color: '#000', fontWeight: '900', letterSpacing: 2 },
  cancelBtn: { borderWidth: 1, borderColor: COLORS.error, paddingVertical: 10, paddingHorizontal: 24, marginTop: 12 },
  cancelBtnText: { color: COLORS.error, fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  pollingBox: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.secondary, padding: 14, marginBottom: 16 },
  pollingText: { color: COLORS.text, fontWeight: '800' },
  benefits: { marginBottom: 24 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  benefitIcon: { width: 32, height: 32, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  benefitText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  sectionLbl: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2.5, fontWeight: '900', marginBottom: 12 },
  planCard: { flexDirection: 'row', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 16, marginBottom: 10, alignItems: 'center', position: 'relative' },
  planCardSelected: { borderColor: COLORS.secondary, borderWidth: 2 },
  planCardHighlight: { backgroundColor: COLORS.surfaceElevated },
  bestBadge: { position: 'absolute', top: -10, right: 12, backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 3 },
  bestText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  planLeft: { flex: 1 },
  planLabel: { color: COLORS.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  planPrice: { color: COLORS.text, fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  planPeriod: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  planRight: { alignItems: 'flex-end', gap: 10 },
  savings: { color: COLORS.secondary, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: COLORS.secondary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.secondary },
  cta: { backgroundColor: COLORS.secondary, paddingVertical: 18, alignItems: 'center', marginTop: 24 },
  ctaText: { color: '#000', fontWeight: '900', letterSpacing: 2, fontSize: 16 },
  legal: { color: COLORS.textDim, fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 16 },
  legalLinksRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 10, paddingBottom: 30 },
  legalLink: { color: COLORS.secondary, fontSize: 11, fontWeight: '800', letterSpacing: 1, textDecorationLine: 'underline' },
  legalDot: { color: COLORS.textDim, fontSize: 11, marginHorizontal: 2 },
});
