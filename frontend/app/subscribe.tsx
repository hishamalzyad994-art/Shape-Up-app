import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, COLORS } from '../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function Subscribe() {
  const { api, refreshUser, user } = useAuth();
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const [plans, setPlans] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [selected, setSelected] = useState<string>('monthly');
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const p = await api<any>('/subscription/plans');
      setPlans(p.plans || []);
      const s = await api<any>('/subscription/status');
      setStatus(s);
    } catch (_) {}
  }, [api]);

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
          Alert.alert('🎉 SUCCESS', `Access granted!\nValid until ${new Date(r.access_expires_at).toLocaleDateString()}\n\nDaily workout reminders are now ON.`,
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
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await api<any>('/subscription/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan, origin_url: origin }),
      });
      if (Platform.OS === 'web') {
        window.location.href = res.url;
      } else {
        await Linking.openURL(res.url);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const expiresStr = status?.access_expires_at
    ? new Date(status.access_expires_at).toLocaleDateString()
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={28} color={COLORS.text} />
        </TouchableOpacity>

        <Text style={styles.kicker}>SHAPEUP PRO</Text>
        <Text style={styles.title}>UNLOCK{'\n'}EVERYTHING</Text>
        <View style={styles.accentBar} />

        {status?.active ? (
          <View style={styles.activeCard} testID="sub-active-card">
            <Ionicons name="checkmark-circle" size={48} color={COLORS.secondary} />
            <Text style={styles.activeTitle}>YOU'RE PRO ✨</Text>
            <Text style={styles.activeText}>
              Plan: <Text style={{ color: COLORS.secondary, fontWeight: '900' }}>{status.plan?.toUpperCase()}</Text>
              {'\n'}{status.auto_renew && !status.cancel_at_period_end
                ? <>Renews on <Text style={{ color: COLORS.text, fontWeight: '900' }}>{expiresStr}</Text></>
                : <>Access until <Text style={{ color: COLORS.text, fontWeight: '900' }}>{expiresStr}</Text></>}
              {status.cancel_at_period_end && (
                <>{'\n'}<Text style={{ color: '#F59E0B' }}>Cancellation scheduled — no further charges.</Text></>
              )}
            </Text>
            <TouchableOpacity style={styles.continueBtn} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.continueBtnText}>BACK TO APP</Text>
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
                <Text style={styles.cancelBtnText}>CANCEL SUBSCRIPTION</Text>
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
          <Benefit icon="flame" text="Daily ongoing workouts" />
          <Benefit icon="restaurant" text="Personalized meal plans" />
          <Benefit icon="chatbubbles" text="24/7 AI Coach C chat" />
          <Benefit icon="trending-up" text="Weekly progress reports" />
          <Benefit icon="trophy" text="Streaks, achievements & badges" />
        </View>

        <Text style={styles.sectionLbl}>CHOOSE YOUR PLAN</Text>
        {plans.map(p => {
          const isYearly = p.key === 'yearly';
          const isMonthly = p.key === 'monthly';
          const highlight = isYearly;
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
                  <Text style={styles.bestText}>BEST VALUE</Text>
                </View>
              )}
              {isMonthly && (
                <View style={[styles.bestBadge, { backgroundColor: COLORS.secondary }]}>
                  <Text style={[styles.bestText, { color: '#000' }]}>AUTO-RENEW</Text>
                </View>
              )}
              <View style={styles.planLeft}>
                <Text style={styles.planLabel}>{p.label.toUpperCase()}</Text>
                <Text style={styles.planPrice}>{p.display}</Text>
                <Text style={styles.planPeriod}>{p.period}</Text>
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
              {status?.active ? 'ALREADY ACTIVE' : 'SUBSCRIBE NOW'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.legal}>
          Monthly plan auto-renews until you cancel • 6-month & yearly are one-off payments
        </Text>
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
});
