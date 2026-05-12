import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, COLORS } from '../../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const FOCUS_OPTIONS = [
  { key: 'belly', label: 'BELLY', icon: 'fitness' },
  { key: 'chest', label: 'CHEST', icon: 'body' },
  { key: 'arms', label: 'ARMS', icon: 'barbell' },
  { key: 'legs', label: 'LEGS', icon: 'walk' },
  { key: 'waist', label: 'WAIST', icon: 'resize' },
  { key: 'full_body', label: 'FULL BODY', icon: 'flame' },
];

export default function Workout() {
  const { api, user, refreshUser } = useAuth();
  const [data, setData] = useState<any>(null);
  const [doneIdx, setDoneIdx] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const t = await api<any>('/workouts/today');
    setData(t);
    setDoneIdx([]);
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const changeFocus = async (focus: string) => {
    await api('/profile', { method: 'PUT', body: JSON.stringify({ body_focus: [focus] }) });
    await refreshUser();
    await load();
  };

  const toggleExercise = (i: number) => {
    setDoneIdx(doneIdx.includes(i) ? doneIdx.filter(x => x !== i) : [...doneIdx, i]);
  };

  const complete = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await api<any>('/workouts/complete', {
        method: 'POST',
        body: JSON.stringify({ day: data.day }),
      });
      Alert.alert(
        res.already ? "Already counted" : "🔥 CRUSHED IT!",
        res.already ? "You already completed today." : `Streak: ${res.streak} days. Keep going.`
      );
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSubmitting(false); }
  };

  const currentFocus = data?.focus || 'full_body';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>DAY {data?.day || 1} OF 30</Text>
        <Text style={styles.title}>TARGET{'\n'}ZONE</Text>
        <View style={styles.accentBar} />

        <View style={styles.focusGrid}>
          {FOCUS_OPTIONS.map(f => {
            const active = currentFocus === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`body-picker-${f.key}`}
                style={[styles.focusCell, active && styles.focusCellActive]}
                onPress={() => changeFocus(f.key)}
              >
                <Ionicons name={f.icon as any} size={22} color={active ? '#fff' : COLORS.text} />
                <Text style={[styles.focusLabel, active && { color: '#fff' }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{data?.title || 'TODAY\'S MOVES'}</Text>
        <Text style={styles.sectionMeta}>{data?.estimated_minutes || 25} MIN • {data?.exercises?.length || 0} EXERCISES</Text>

        <View style={{ marginTop: 16 }}>
          {(data?.exercises || []).map((ex: any, i: number) => {
            const done = doneIdx.includes(i);
            return (
              <TouchableOpacity
                key={i}
                testID={`workout-exercise-item-${i}`}
                style={[styles.exItem, done && styles.exItemDone]}
                onPress={() => toggleExercise(i)}
              >
                <View style={[styles.exIcon, done && { backgroundColor: COLORS.secondary }]}>
                  <Ionicons name={done ? 'checkmark' : (ex.icon || 'flash-outline')} size={22} color={done ? '#000' : COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exName, done && { textDecorationLine: 'line-through', color: COLORS.textDim }]}>{ex.name}</Text>
                  <Text style={styles.exMeta}>{ex.sets} SETS × {ex.reps}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          testID="workout-complete-btn"
          style={[styles.cta, submitting && { opacity: 0.6 }]}
          onPress={complete}
          disabled={submitting}
        >
          <Text style={styles.ctaText}>COMPLETE DAY {data?.day}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 60 },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.2, lineHeight: 42, marginTop: 4 },
  accentBar: { width: 50, height: 4, backgroundColor: COLORS.primary, marginTop: 12, marginBottom: 20 },
  focusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  focusCell: { width: '31.5%', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingVertical: 18, alignItems: 'center', gap: 6 },
  focusCellActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  focusLabel: { color: COLORS.text, fontSize: 11, letterSpacing: 1.5, fontWeight: '800' },
  sectionTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginTop: 30, letterSpacing: -0.5 },
  sectionMeta: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: 4 },
  exItem: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 14, marginBottom: 10 },
  exItemDone: { backgroundColor: COLORS.surfaceElevated, borderColor: COLORS.secondary },
  exIcon: { width: 44, height: 44, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  exName: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  exMeta: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, marginTop: 2, fontWeight: '700' },
  cta: { backgroundColor: COLORS.secondary, paddingVertical: 18, alignItems: 'center', marginTop: 24 },
  ctaText: { color: '#000', fontWeight: '900', letterSpacing: 2, fontSize: 15 },
});
