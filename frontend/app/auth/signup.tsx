import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ImageBackground,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuth, COLORS } from '../../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function SignUp() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!name || !email || !password) { setErr('All fields required'); return; }
    if (password.length < 6) { setErr('Password must be 6+ chars'); return; }
    setLoading(true); setErr('');
    try {
      await signUp(email.trim(), password, name.trim());
      router.replace('/onboarding');
    } catch (e: any) {
      setErr(e.message || 'Sign up failed');
    } finally { setLoading(false); }
  };

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1605296867724-fa87a8ef53fd?w=900' }}
      style={styles.bg}
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.kicker}>JOIN THE CHALLENGE</Text>
            <Text style={styles.title}>START{'\n'}TODAY</Text>
            <View style={styles.accentBar} />
            <Text style={styles.sub}>Reshape your body. Reshape your life.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={20} color={COLORS.textDim} />
              <TextInput
                testID="signup-name-input"
                placeholder="Full name"
                placeholderTextColor={COLORS.textDim}
                value={name} onChangeText={setName} style={styles.input}
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={COLORS.textDim} />
              <TextInput
                testID="signup-email-input"
                placeholder="Email"
                placeholderTextColor={COLORS.textDim}
                value={email} onChangeText={setEmail} style={styles.input}
                autoCapitalize="none" keyboardType="email-address"
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.textDim} />
              <TextInput
                testID="signup-password-input"
                placeholder="Password (6+ chars)"
                placeholderTextColor={COLORS.textDim}
                value={password} onChangeText={setPassword} style={styles.input} secureTextEntry
              />
            </View>

            {err ? <Text testID="signup-error" style={styles.error}>{err}</Text> : null}

            <TouchableOpacity
              testID="signup-submit-button"
              style={styles.cta}
              onPress={onSubmit}
              disabled={loading} activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>CREATE ACCOUNT</Text>}
            </TouchableOpacity>

            <Link href="/auth/login" asChild>
              <TouchableOpacity testID="go-login-link" style={styles.linkRow}>
                <Text style={styles.linkText}>Already a member? </Text>
                <Text style={[styles.linkText, { color: COLORS.secondary, fontWeight: '900' }]}>LOG IN</Text>
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
  brand: { marginTop: 60 },
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
  cta: { backgroundColor: COLORS.primary, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#fff', fontWeight: '900', letterSpacing: 2, fontSize: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText: { color: COLORS.textDim, letterSpacing: 1, fontSize: 13 },
  error: { color: COLORS.error, marginBottom: 8, letterSpacing: 1, fontSize: 13 },
});
