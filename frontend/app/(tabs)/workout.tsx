import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, Alert, Platform,
} from 'react-native';
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

// Plays a quick whistle beep using Web Audio (works on Expo Web preview).
function playWhistle(times = 1) {
  if (Platform.OS !== 'web') return; // native sound would need expo-av
  try {
    // @ts-ignore
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2200, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.5);
      t += 0.55;
    }
  } catch (_) {}
}

export default function Workout() {
  const { api, user, refreshUser } = useAuth();
  const [data, setData] = useState<any>(null);
  const [doneIdx, setDoneIdx] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Timer state
  const [timerOn, setTimerOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<any>(null);

  // Rate modal
  const [rateOpen, setRateOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [selfScore, setSelfScore] = useState(0);
  const [rateNote, setRateNote] = useState('');

  const whistleEnabled = user?.profile?.whistle_enabled !== false;

  const load = useCallback(async () => {
    const t = await api<any>('/workouts/today');
    setData(t);
    setDoneIdx([]);
  }, [api]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (timerOn) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => intervalRef.current && clearInterval(intervalRef.current);
  }, [timerOn]);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60); const r = s % 60;
    return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    if (whistleEnabled) playWhistle(1);
    setTimerOn(true);
  };
  const stopTimer = () => {
    if (whistleEnabled) playWhistle(2);
    setTimerOn(false);
  };
  const resetTimer = () => { setTimerOn(false); setElapsed(0); };

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
      stopTimer();
      setRateOpen(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSubmitting(false); }
  };

  const submitRating = async () => {
    if (rating === 0) { Alert.alert('Tap a star first'); return; }
    try {
      await api('/workouts/rate', {
        method: 'POST',
        body: JSON.stringify({ day: data.day, rating, self_score: selfScore || null, note: rateNote || null }),
      });
      setRateOpen(false); setRating(0); setSelfScore(0); setRateNote('');
      await load();
      Alert.alert('🔥 CRUSHED IT!', `Workout logged. Time: ${fmtTime(elapsed)}`);
      resetTimer();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const currentFocus = data?.focus || 'full_body';
  const allDone = data && doneIdx.length === data.exercises.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>DAY {data?.day || 1} • {(data?.difficulty || 'medium').toUpperCase()}</Text>
            <Text style={styles.title}>TARGET{'\n'}ZONE</Text>
          </View>
          <View style={styles.timerBox} testID="workout-timer">
            <Text style={styles.timerTxt}>{fmtTime(elapsed)}</Text>
            <View style={styles.timerCtrls}>
              {!timerOn ? (
                <TouchableOpacity testID="timer-start" onPress={startTimer} style={styles.timerBtn}>
                  <Ionicons name="play" size={14} color={COLORS.secondary} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity testID="timer-stop" onPress={stopTimer} style={styles.timerBtn}>
                  <Ionicons name="pause" size={14} color={COLORS.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity testID="timer-reset" onPress={resetTimer} style={styles.timerBtn}>
                <Ionicons name="refresh" size={14} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
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

        <Text style={styles.sectionTitle}>{data?.title}</Text>
        <Text style={styles.sectionMeta}>~{data?.estimated_minutes || 25} MIN • {data?.exercises?.length || 0} EXERCISES</Text>

        <View style={{ marginTop: 16 }}>
          {(data?.exercises || []).map((ex: any, i: number) => {
            const done = doneIdx.includes(i);
            return (
              <TouchableOpacity
                key={i}
                testID={`workout-exercise-item-${i}`}
                style={[styles.exCard, done && styles.exCardDone]}
                onPress={() => toggleExercise(i)}
                activeOpacity={0.85}
              >
                {ex.gif ? (
                  <Image source={{ uri: ex.gif }} style={styles.exGif} />
                ) : (
                  <View style={[styles.exGif, { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceElevated }]}>
                    <Ionicons name={ex.icon || 'flash-outline'} size={32} color={COLORS.primary} />
                  </View>
                )}
                <View style={styles.exInfo}>
                  <Text style={[styles.exName, done && { textDecorationLine: 'line-through', color: COLORS.textDim }]}>{ex.name}</Text>
                  <Text style={styles.exMeta}>{ex.sets} SETS × {ex.reps} {ex.unit?.toUpperCase()}</Text>
                </View>
                <View style={[styles.exCheck, done && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary }]}>
                  {done && <Ionicons name="checkmark" size={20} color="#000" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          testID="workout-complete-btn"
          style={[styles.cta, submitting && { opacity: 0.6 }, !allDone && { backgroundColor: COLORS.surface }]}
          onPress={complete}
          disabled={submitting}
        >
          <Text style={[styles.ctaText, !allDone && { color: COLORS.textDim }]}>
            {allDone ? '🔥 COMPLETE WORKOUT' : `${doneIdx.length}/${data?.exercises?.length || 0} DONE — KEEP GOING`}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rate modal */}
      <Modal visible={rateOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalKicker}>RATE YOUR WORKOUT</Text>
            <Text style={styles.modalTitle}>How was it?</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map(s => (
                <TouchableOpacity key={s} testID={`rate-star-${s}`} onPress={() => setRating(s)}>
                  <Ionicons name={rating >= s ? 'star' : 'star-outline'} size={38} color={COLORS.secondary} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalSub}>How did YOU do?</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map(s => (
                <TouchableOpacity key={s} testID={`self-star-${s}`} onPress={() => setSelfScore(s)}>
                  <Ionicons name={selfScore >= s ? 'flame' : 'flame-outline'} size={32} color={COLORS.primary} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              testID="rate-note"
              style={styles.modalInput}
              placeholder="Optional note…"
              placeholderTextColor={COLORS.textDim}
              value={rateNote}
              onChangeText={setRateNote}
            />
            <TouchableOpacity testID="rate-submit" style={styles.modalCta} onPress={submitRating}>
              <Text style={styles.modalCtaText}>SUBMIT</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRateOpen(false); resetTimer(); }}>
              <Text style={styles.modalSkip}>SKIP</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.2, lineHeight: 42, marginTop: 4 },
  accentBar: { width: 50, height: 4, backgroundColor: COLORS.primary, marginTop: 12, marginBottom: 20 },
  timerBox: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 10, alignItems: 'center', minWidth: 100 },
  timerTxt: { color: COLORS.secondary, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  timerCtrls: { flexDirection: 'row', gap: 6, marginTop: 6 },
  timerBtn: { borderWidth: 1, borderColor: COLORS.border, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  focusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  focusCell: { width: '31.5%', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingVertical: 18, alignItems: 'center', gap: 6 },
  focusCellActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  focusLabel: { color: COLORS.text, fontSize: 11, letterSpacing: 1.5, fontWeight: '800' },
  sectionTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginTop: 30, letterSpacing: -0.5 },
  sectionMeta: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: 4 },
  exCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 10, marginBottom: 10 },
  exCardDone: { backgroundColor: COLORS.surfaceElevated, borderColor: COLORS.secondary },
  exGif: { width: 70, height: 70, backgroundColor: '#000' },
  exInfo: { flex: 1 },
  exName: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  exMeta: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, marginTop: 4, fontWeight: '700' },
  exCheck: { width: 32, height: 32, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  cta: { backgroundColor: COLORS.secondary, paddingVertical: 18, alignItems: 'center', marginTop: 24 },
  ctaText: { color: '#000', fontWeight: '900', letterSpacing: 2, fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 22 },
  modalKicker: { color: COLORS.primary, fontSize: 11, letterSpacing: 3, fontWeight: '900' },
  modalTitle: { color: COLORS.text, fontSize: 24, fontWeight: '900', marginTop: 6, letterSpacing: -0.5 },
  modalSub: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '800', marginTop: 16 },
  starRow: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'center' },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: 12, paddingVertical: 12, marginTop: 16, fontSize: 14 },
  modalCta: { backgroundColor: COLORS.secondary, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  modalCtaText: { color: '#000', fontWeight: '900', letterSpacing: 2 },
  modalSkip: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '800', textAlign: 'center', marginTop: 14 },
});
