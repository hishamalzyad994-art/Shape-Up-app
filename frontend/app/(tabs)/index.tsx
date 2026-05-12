import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ImageBackground, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, COLORS } from '../../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function Home() {
  const { user, api } = useAuth();
  const router = useRouter();
  const [today, setToday] = useState<any>(null);
  const [macros, setMacros] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await api<any>('/workouts/today');
      setToday(t);
    } catch (_) {}
    try {
      const m = await api<any>('/calories');
      setMacros(m);
    } catch (_) {}
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  };

  const day = today?.day || 1;
  const progress = Math.round(((today?.completed_days?.length || 0) / 30) * 100);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>HEY {user?.name?.toUpperCase()}</Text>
            <Text style={styles.title}>READY TO{'\n'}BURN?</Text>
          </View>
          <View style={styles.streakBox} testID="home-streak-counter">
            <Ionicons name="flame" size={20} color={COLORS.secondary} />
            <Text style={styles.streakNum}>{today?.streak || 0}</Text>
            <Text style={styles.streakLbl}>STREAK</Text>
          </View>
        </View>

        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1605296867724-fa87a8ef53fd?w=900' }}
          style={styles.hero}
        >
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.heroKicker}>DAY {day} / 30</Text>
            <Text style={styles.heroTitle}>{today?.title || 'TODAY\'S WORKOUT'}</Text>
            <View style={styles.progressBar} testID="home-progress-bar">
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.heroMeta}>{progress}% COMPLETE • {today?.estimated_minutes || 25} MIN</Text>
            <TouchableOpacity
              testID="home-start-workout-btn"
              style={styles.heroCta}
              onPress={() => router.push('/(tabs)/workout')}
              activeOpacity={0.85}
            >
              <Text style={styles.heroCtaText}>START WORKOUT</Text>
              <Ionicons name="arrow-forward" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        </ImageBackground>

        <View style={styles.grid}>
          <View style={styles.statCard}>
            <Ionicons name="restaurant" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{macros?.target_calories || '--'}</Text>
            <Text style={styles.statLabel}>KCAL TARGET</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="barbell" size={20} color={COLORS.secondary} />
            <Text style={styles.statValue}>{macros?.protein_g || '--'}g</Text>
            <Text style={styles.statLabel}>PROTEIN</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trophy" size={20} color={COLORS.secondary} />
            <Text style={styles.statValue}>{today?.completed_days?.length || 0}</Text>
            <Text style={styles.statLabel}>DAYS DONE</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="speedometer" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{macros?.tdee || '--'}</Text>
            <Text style={styles.statLabel}>TDEE</Text>
          </View>
        </View>

        <TouchableOpacity
          testID="home-chat-cta"
          style={styles.coachCard}
          onPress={() => router.push('/(tabs)/chat')}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.coachKicker}>AI COACH</Text>
            <Text style={styles.coachTitle}>Need a kick?</Text>
            <Text style={styles.coachSub}>Talk to Coach C anytime.</Text>
          </View>
          <Ionicons name="chatbubble-ellipses" size={32} color={COLORS.primary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.2, lineHeight: 42, marginTop: 4 },
  streakBox: { borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 70, backgroundColor: COLORS.surface },
  streakNum: { color: COLORS.secondary, fontSize: 22, fontWeight: '900' },
  streakLbl: { color: COLORS.textDim, fontSize: 9, letterSpacing: 2, fontWeight: '800' },
  hero: { marginTop: 24, minHeight: 240, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  heroContent: { padding: 20 },
  heroKicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '900' },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginTop: 6, lineHeight: 30 },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 18 },
  progressFill: { height: '100%', backgroundColor: COLORS.primary },
  heroMeta: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, marginTop: 10, fontWeight: '700' },
  heroCta: { flexDirection: 'row', backgroundColor: COLORS.secondary, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  heroCtaText: { color: '#000', fontWeight: '900', letterSpacing: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  statCard: { width: '48%', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 16 },
  statValue: { color: COLORS.text, fontSize: 24, fontWeight: '900', marginTop: 8 },
  statLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginTop: 2 },
  coachCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 18, marginTop: 16 },
  coachKicker: { color: COLORS.primary, fontSize: 10, letterSpacing: 3, fontWeight: '900' },
  coachTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900', marginTop: 2 },
  coachSub: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
});
