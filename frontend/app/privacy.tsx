import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/AuthContext';

export default function Privacy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          <Text style={styles.backTxt}>BACK</Text>
        </TouchableOpacity>

        <Text style={styles.kicker}>SHAPEUP</Text>
        <Text style={styles.title}>PRIVACY{'\n'}POLICY</Text>
        <View style={styles.accentBar} />
        <Text style={styles.updated}>Effective date: 12 May 2026</Text>

        <Section title="1. WHO WE ARE">
          ShapeUp ("we", "us", "our") is the publisher of the ShapeUp mobile application
          ("App"), a personal fitness and weight-loss coaching service. This Privacy Policy
          explains how we collect, use, store and protect your personal information when
          you use the App.
        </Section>

        <Section title="2. INFORMATION WE COLLECT">
          • Account information: name, email address, hashed password.{'\n'}
          • Profile & fitness data: age, gender, height, weight, target weight, goal,
            activity level, body-focus preferences, difficulty level, target reason.{'\n'}
          • Workout & progress data: completed workouts, ratings, streak history, weight
            log entries, weekly progress estimates.{'\n'}
          • AI chat data: messages you send to our AI Coach and the responses generated.{'\n'}
          • Payment data: when you subscribe, payment is processed by Stripe. We never
            see or store your full card number; we only store a subscription record
            (plan, status, access expiry date).{'\n'}
          • Technical data: app version, device type, language, and minimal logs needed
            to operate and troubleshoot the App.
        </Section>

        <Section title="3. HOW WE USE YOUR DATA">
          • To deliver the core features of the App (personalised workouts, calorie
            calculations, meal plans, AI coaching, progress tracking).{'\n'}
          • To process subscriptions and provide paid access.{'\n'}
          • To improve the App, fix bugs, and develop new features.{'\n'}
          • To communicate with you about service changes, security alerts or support
            requests.{'\n'}
          • To comply with legal obligations.
        </Section>

        <Section title="4. LEGAL BASIS (UK / EU users)">
          We process your data on the following legal bases:{'\n'}
          • Performance of a contract (delivering the App and your subscription).{'\n'}
          • Your consent (where required, e.g. optional features).{'\n'}
          • Our legitimate interests (security, fraud prevention, service improvement).{'\n'}
          • Legal obligation (tax, accounting, regulatory requests).
        </Section>

        <Section title="5. AI COACH ('COACH C')">
          Messages you send to our AI Coach are forwarded to Anthropic's Claude model
          through a managed integration. They are used solely to generate your response
          and are stored in your chat history so you can refer back to them. Do not
          include sensitive personal data, medical history or third-party private
          information in your chat messages.
        </Section>

        <Section title="6. SHARING">
          We do not sell your personal data. We share limited data only with:{'\n'}
          • Stripe (payment processing) – stripe.com/privacy{'\n'}
          • Anthropic (AI inference for Coach C) – anthropic.com/legal/privacy{'\n'}
          • Cloud hosting providers used to run the App and database.{'\n'}
          • Authorities, where required by law.
        </Section>

        <Section title="7. DATA RETENTION">
          We retain your account and fitness data for as long as your account is active.
          When you delete your account, we delete or anonymise your personal data within
          30 days, except where retention is required for legal or accounting reasons
          (typically up to 7 years for transaction records).
        </Section>

        <Section title="8. YOUR RIGHTS">
          Depending on your location, you may have the right to: access, correct, delete,
          restrict or object to our processing of your data; receive a portable copy of
          your data; and lodge a complaint with a supervisory authority (e.g. the UK ICO
          at ico.org.uk). To exercise any right, email us at the address below.
        </Section>

        <Section title="9. CHILDREN">
          ShapeUp is not intended for users under the age of 13 (or 16 in some
          jurisdictions). We do not knowingly collect data from children. If you believe
          we have, contact us and we will delete it.
        </Section>

        <Section title="10. SECURITY">
          Passwords are hashed with bcrypt; data in transit is encrypted using HTTPS/TLS.
          No system is 100% secure, so we cannot guarantee absolute security, but we use
          industry-standard practices to protect your data.
        </Section>

        <Section title="11. CHANGES TO THIS POLICY">
          We may update this policy from time to time. Material changes will be notified
          in-app or by email at least 14 days before they take effect. The latest version
          will always be available at this URL.
        </Section>

        <Section title="12. CONTACT">
          Questions, requests or complaints?
          {'\n'}Email: <Text style={styles.link} onPress={() => Linking.openURL('mailto:privacy@shapeup.app')}>privacy@shapeup.app</Text>
        </Section>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: any }) {
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
  link: { color: COLORS.secondary, textDecorationLine: 'underline' },
});
