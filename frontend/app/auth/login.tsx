import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ImageBackground,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuth, COLORS } from '../../src/AuthContext';
import { isRevenueCatAvailable, restorePurchases } from '../../src/purchases';
import { Ionicons } from '@expo/vector-icons';

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) { setErr('Email and password required'); return; }
    setLoading(true); setErr('');
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const onRestore = async () => {
    setRestoring(true);
    try {
      if (!isRevenueCatAvailable()) {
        Alert.alert(
          'Restore on iOS / Android',
          'Restore Purchases works inside the native ShapeUp app from the App Store. On the web preview, please sign in to manage your Stripe subscription.',
        );
        return;
      }
      const r = await restorePurchases();
      if (r.hasEntitlement) {
        Alert.alert(
          'Subscription Restored ✨',
          'Your purchase has been linked to this device. Please sign in below to access your account.',
        );
        return;
      }
      // Friendly, bucketed messages — never let a raw SDK error reach the user.
      if (r.error === 'network') {
        Alert.alert('No internet', 'Please connect to Wi-Fi or cellular and try again.');
      } else if (r.error === 'no_products' || r.error === 'unavailable' || r.error === 'sdk_unavailable') {
        Alert.alert(
          'Nothing to restore',
          "We didn't find an active subscription on this Apple ID. If you just subscribed on another device, please wait a moment and try again, or sign in to your account.",
        );
      } else {
        Alert.alert(
          'No purchase found',
          "We didn't find an active subscription on this Apple ID. If you previously paid with a different account, switch to it in Settings → [your name] → Media & Purchases and try again.",
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Restore failed',
        'Something went wrong. Please check your connection and try again.',
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1543300722-222718fd8509?w=900' }}
      style={styles.bg}
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.kicker}>SHAPE YOUR LIFE</Text>
            <Text style={styles.title}>SHAPE{'\n'}UP</Text>
            <View style={styles.accentBar} />
            <Text style={styles.sub}>Welcome back. Time to grind.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={COLORS.textDim} />
              <TextInput
                testID="login-email-input"
                placeholder="Email"
                placeholderTextColor={COLORS.textDim}
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.textDim} />
              <TextInput
                testID="login-password-input"
                placeholder="Password"
                placeholderTextColor={COLORS.textDim}
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
              />
            </View>

            {err ? <Text testID="login-error" style={styles.error}>{err}</Text> : null}

            <TouchableOpacity
              testID="login-submit-button"
              style={styles.cta}
              onPress={onSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.ctaText}>LOG IN</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              testID="login-restore-btn"
              style={styles.restoreLoginBtn}
              onPress={onRestore}
              disabled={restoring}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={14} color={COLORS.textDim} />
              <Text style={styles.restoreLoginText}>
                {restoring ? 'RESTORING…' : 'RESTORE SUBSCRIPTION'}
              </Text>
            </TouchableOpacity>

            <Link href="/auth/signup" asChild>
              <TouchableOpacity testID="go-signup-link" style={styles.linkRow}>
                <Text style={styles.linkText}>New here? </Text>
                <Text style={[styles.linkText, { color: COLORS.secondary, fontWeight: '900' }]}>CREATE ACCOUNT</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.78)' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'space-between', minHeight: '100%' },
  brand: { marginTop: 80 },
  kicker: { color: COLORS.secondary, fontSize: 12, letterSpacing: 3, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 56, fontWeight: '900', letterSpacing: -2, lineHeight: 56, marginTop: 8 },
  accentBar: { width: 60, height: 4, backgroundColor: COLORS.primary, marginTop: 16 },
  sub: { color: COLORS.textDim, marginTop: 16, fontSize: 14, letterSpacing: 1 },
  form: { marginBottom: 40 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'rgba(17,17,17,0.7)', paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12, gap: 10,
  },
  input: { flex: 1, color: COLORS.text, fontSize: 15 },
  cta: {
    backgroundColor: COLORS.secondary, paddingVertical: 18, alignItems: 'center', marginTop: 8,
  },
  ctaText: { color: '#000', fontWeight: '900', letterSpacing: 2, fontSize: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText: { color: COLORS.textDim, letterSpacing: 1, fontSize: 13 },
  error: { color: COLORS.error, marginBottom: 8, letterSpacing: 1, fontSize: 13 },
  restoreLoginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'rgba(17,17,17,0.5)',
  },
  restoreLoginText: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
});
