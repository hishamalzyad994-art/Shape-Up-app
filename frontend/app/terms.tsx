import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/AuthContext';

export default function Terms() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          <Text style={styles.backTxt}>BACK</Text>
        </TouchableOpacity>

        <Text style={styles.kicker}>SHAPEUP</Text>
        <Text style={styles.title}>TERMS OF{'\n'}SERVICE</Text>
        <View style={styles.accentBar} />
        <Text style={styles.updated}>Effective date: 12 May 2026</Text>

        <S title="1. ACCEPTANCE">By creating an account or using ShapeUp, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the App.</S>

        <S title="2. MEDICAL DISCLAIMER">
          ShapeUp provides general fitness and nutrition information for educational
          purposes only. It is NOT medical advice. Consult a qualified healthcare
          professional before starting any exercise or diet programme, especially if
          you have a medical condition, are pregnant, or are taking medication.
          You use the App at your own risk.
        </S>

        <S title="3. ACCOUNTS">
          You must be at least 13 (or 16 in some regions) to use the App. You are
          responsible for keeping your password confidential and for all activity on
          your account.
        </S>

        <S title="4. SUBSCRIPTIONS & PAYMENTS">
          ShapeUp offers paid plans: £3.99 for 30 days, £19.99 for 180 days, £34.99 for
          365 days. Payments are one-time per period (not auto-renewing) and processed
          by Stripe. Access begins immediately on successful payment and ends on the
          listed expiry date. To continue access after expiry, you must purchase another
          period.
        </S>

        <S title="5. REFUNDS">
          Once digital access has been granted, payments are generally non-refundable
          unless required by law. For statutory rights in your jurisdiction, contact
          support@shapeup.app.
        </S>

        <S title="6. ACCEPTABLE USE">
          You agree not to: misuse the App; reverse engineer or scrape it; use it for
          illegal purposes; harass others; or submit content that infringes intellectual
          property rights.
        </S>

        <S title="7. AI COACH">
          The AI Coach generates suggestions automatically. Output may be inaccurate or
          inappropriate. Do not rely on it for medical, legal, or financial decisions.
        </S>

        <S title="8. INTELLECTUAL PROPERTY">
          All content, branding and code in the App are owned by ShapeUp or our
          licensors. You receive a limited, non-transferable licence to use the App for
          personal, non-commercial purposes only.
        </S>

        <S title="9. TERMINATION">
          We may suspend or terminate your account if you breach these Terms. You may
          delete your account at any time from the Profile screen.
        </S>

        <S title="10. LIMITATION OF LIABILITY">
          To the maximum extent allowed by law, ShapeUp's liability for any claim arising
          from your use of the App is limited to the amount you paid us in the 12 months
          before the claim. We are not liable for indirect, consequential, or incidental
          damages.
        </S>

        <S title="11. CHANGES">
          We may update these Terms from time to time. Material changes will be notified
          in-app or by email at least 14 days before they take effect.
        </S>

        <S title="12. GOVERNING LAW">
          These Terms are governed by the laws of England and Wales. Disputes will be
          subject to the exclusive jurisdiction of the courts of England and Wales,
          except where local consumer protection law grants you the right to a different
          forum.
        </S>

        <S title="13. CONTACT">support@shapeup.app</S>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function S({ title, children }: { title: string; children: any }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 60 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  backTxt: { color: COLORS.text, fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800', marginTop: 14 },
  title: { color: COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.2, lineHeight: 42, marginTop: 6 },
  accentBar: { width: 50, height: 4, backgroundColor: COLORS.primary, marginTop: 12 },
  updated: { color: COLORS.textDim, fontSize: 12, letterSpacing: 1.5, marginTop: 12, marginBottom: 18 },
  section: { marginTop: 18 },
  sectionTitle: { color: COLORS.secondary, fontSize: 13, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  body: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
});
