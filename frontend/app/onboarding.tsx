import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, COLORS } from '../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const GOALS = [
  { key: 'fat_loss', label: 'FAT LOSS', icon: 'flame' },
  { key: 'muscle_gain', label: 'MUSCLE GAIN', icon: 'barbell' },
  { key: 'healthy', label: 'GET HEALTHY', icon: 'leaf' },
];
const ACTIVITY = [
  { key: 'sedentary', label: 'Sedentary' },
  { key: 'light', label: 'Light (1-3 days/wk)' },
  { key: 'moderate', label: 'Moderate (3-5 days/wk)' },
  { key: 'active', label: 'Active (6-7 days/wk)' },
  { key: 'very_active', label: 'Very Active' },
];
const FOCUS = [
  { key: 'belly', label: 'Belly' },
  { key: 'chest', label: 'Chest' },
  { key: 'arms', label: 'Arms' },
  { key: 'legs', label: 'Legs' },
  { key: 'waist', label: 'Waist' },
  { key: 'full_body', label: 'Full Body' },
];

export default function Onboarding() {
  const { api, refreshUser } = useAuth();
  const router = useRouter();
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState('');
  const [activity, setActivity] = useState('moderate');
  const [focus, setFocus] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const toggleFocus = (k: string) =>
    setFocus(focus.includes(k) ? focus.filter(x => x !== k) : [...focus, k]);

  const submit = async () => {
    if (!gender || !age || !height || !weight || !goal) {
      setErr('Please fill all required fields'); return;
    }
    setLoading(true); setErr('');
    try {
      await api('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          gender,
          age: parseInt(age),
          height_cm: parseFloat(height),
          weight_kg: parseFloat(weight),
          target_weight_kg: target ? parseFloat(target) : null,
          goal,
          activity,
          body_focus: focus.length ? focus : ['full_body'],
        }),
      });
      await refreshUser();
      router.replace('/(tabs)');
    } catch (e: any) {
      setErr(e.message || 'Could not save profile');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>LET'S BUILD YOUR PLAN</Text>
          <Text style={styles.title}>ABOUT{'\n'}YOU</Text>
          <View style={styles.accentBar} />

          <Text style={styles.label}>GENDER</Text>
          <View style={styles.row}>
            {(['male', 'female'] as const).map(g => (
              <TouchableOpacity
                key={g}
                testID={`onb-gender-${g}`}
                style={[styles.chip, gender === g && styles.chipActive]}
                onPress={() => setGender(g)}
              >
                <Ionicons name={g === 'male' ? 'man' : 'woman'} size={18} color={gender === g ? '#000' : COLORS.text} />
                <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>{g.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.grid2}>
            <View style={styles.cell}>
              <Text style={styles.label}>AGE</Text>
              <TextInput testID="onb-age" style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="25" placeholderTextColor={COLORS.textDim} />
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>HEIGHT (cm)</Text>
              <TextInput testID="onb-height" style={styles.input} value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="175" placeholderTextColor={COLORS.textDim} />
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>WEIGHT (kg)</Text>
              <TextInput testID="onb-weight" style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="80" placeholderTextColor={COLORS.textDim} />
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>TARGET (kg)</Text>
              <TextInput testID="onb-target" style={styles.input} value={target} onChangeText={setTarget} keyboardType="numeric" placeholder="72" placeholderTextColor={COLORS.textDim} />
            </View>
          </View>

          <Text style={styles.label}>GOAL</Text>
          <View style={styles.row}>
            {GOALS.map(g => (
              <TouchableOpacity
                key={g.key}
                testID={`onb-goal-${g.key}`}
                style={[styles.goalCard, goal === g.key && styles.goalCardActive]}
                onPress={() => setGoal(g.key)}
              >
                <Ionicons name={g.icon as any} size={22} color={goal === g.key ? COLORS.primary : COLORS.text} />
                <Text style={[styles.goalText, goal === g.key && { color: COLORS.primary }]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>ACTIVITY LEVEL</Text>
          {ACTIVITY.map(a => (
            <TouchableOpacity
              key={a.key}
              testID={`onb-activity-${a.key}`}
              style={[styles.listRow, activity === a.key && styles.listRowActive]}
              onPress={() => setActivity(a.key)}
            >
              <Text style={[styles.listText, activity === a.key && { color: COLORS.secondary }]}>{a.label}</Text>
              {activity === a.key && <Ionicons name="checkmark" size={20} color={COLORS.secondary} />}
            </TouchableOpacity>
          ))}

          <Text style={styles.label}>FOCUS AREAS (optional)</Text>
          <View style={styles.focusGrid}>
            {FOCUS.map(f => (
              <TouchableOpacity
                key={f.key}
                testID={`onb-focus-${f.key}`}
                style={[styles.focusCell, focus.includes(f.key) && styles.focusCellActive]}
                onPress={() => toggleFocus(f.key)}
              >
                <Text style={[styles.focusText, focus.includes(f.key) && { color: '#fff' }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {err ? <Text style={styles.error}>{err}</Text> : null}

          <TouchableOpacity testID="onb-submit" style={styles.cta} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>START 30-DAY CHALLENGE</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 24, paddingBottom: 60 },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 48, fontWeight: '900', letterSpacing: -1.5, lineHeight: 48, marginTop: 6 },
  accentBar: { width: 50, height: 4, backgroundColor: COLORS.primary, marginTop: 14, marginBottom: 20 },
  label: { color: COLORS.text, fontSize: 12, letterSpacing: 2, fontWeight: '900', marginTop: 22, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: COLORS.surface, flex: 1, justifyContent: 'center',
  },
  chipActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  chipText: { color: COLORS.text, fontWeight: '800', letterSpacing: 1.5 },
  chipTextActive: { color: '#000' },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  cell: { width: '48%' },
  input: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    color: COLORS.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, fontWeight: '700',
  },
  goalCard: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    padding: 14, alignItems: 'center', gap: 8,
  },
  goalCardActive: { borderColor: COLORS.primary, borderWidth: 2 },
  goalText: { color: COLORS.text, fontWeight: '900', fontSize: 11, letterSpacing: 1, textAlign: 'center' },
  listRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
  },
  listRowActive: { borderColor: COLORS.secondary },
  listText: { color: COLORS.text, fontWeight: '600', letterSpacing: 1 },
  focusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  focusCell: {
    width: '31.5%', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    paddingVertical: 16, alignItems: 'center',
  },
  focusCellActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  focusText: { color: COLORS.text, fontWeight: '800', letterSpacing: 1 },
  cta: { backgroundColor: COLORS.secondary, paddingVertical: 18, alignItems: 'center', marginTop: 30 },
  ctaText: { color: '#000', fontWeight: '900', letterSpacing: 2, fontSize: 16 },
  error: { color: COLORS.error, marginTop: 16, letterSpacing: 1 },
});
