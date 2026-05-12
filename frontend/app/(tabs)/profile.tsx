import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, COLORS } from '../../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function Profile() {
  const { user, api, signOut, refreshUser } = useAuth();
  const router = useRouter();
  const [newWeight, setNewWeight] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<any>('/progress/weight');
      setLogs(r.logs || []);
    } catch (_) {}
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const logWeight = async () => {
    if (!newWeight) return;
    setSaving(true);
    try {
      await api('/progress/weight', { method: 'POST', body: JSON.stringify({ weight_kg: parseFloat(newWeight) }) });
      setNewWeight('');
      await load();
      await refreshUser();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const onSignOut = async () => {
    await signOut();
    router.replace('/auth/login');
  };

  const profile = user?.profile || {};
  const startWeight = logs.length ? logs[0].weight_kg : profile.weight_kg;
  const currentWeight = profile.weight_kg;
  const targetWeight = profile.target_weight_kg;
  const lost = startWeight && currentWeight ? (startWeight - currentWeight).toFixed(1) : '0.0';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>PROFILE</Text>
            <Text style={styles.title}>YOUR{'\n'}STATS</Text>
          </View>
          <TouchableOpacity testID="profile-signout" onPress={onSignOut} style={styles.signOutBtn}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBig}>
            <Text style={styles.statKicker}>STREAK</Text>
            <Text style={styles.statBigNum}>{user?.streak || 0}</Text>
            <Text style={styles.statBigUnit}>DAYS</Text>
          </View>
          <View style={styles.statBig}>
            <Text style={styles.statKicker}>DONE</Text>
            <Text style={[styles.statBigNum, { color: COLORS.primary }]}>{user?.completed_days?.length || 0}/30</Text>
            <Text style={styles.statBigUnit}>WORKOUTS</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>WEIGHT JOURNEY</Text>
        <View style={styles.weightCard}>
          <View style={styles.weightRow}>
            <View style={styles.weightCell}>
              <Text style={styles.weightLbl}>START</Text>
              <Text style={styles.weightVal}>{startWeight || '—'} kg</Text>
            </View>
            <View style={styles.weightCell}>
              <Text style={styles.weightLbl}>NOW</Text>
              <Text style={[styles.weightVal, { color: COLORS.secondary }]}>{currentWeight || '—'} kg</Text>
            </View>
            <View style={styles.weightCell}>
              <Text style={styles.weightLbl}>TARGET</Text>
              <Text style={styles.weightVal}>{targetWeight || '—'} kg</Text>
            </View>
          </View>
          <View style={styles.lostBox}>
            <Text style={styles.lostLbl}>LOST</Text>
            <Text style={styles.lostVal}>{lost} KG</Text>
          </View>

          <View style={styles.logRow}>
            <TextInput
              testID="profile-weight-input"
              style={styles.weightInput}
              placeholder="New weight kg"
              placeholderTextColor={COLORS.textDim}
              value={newWeight}
              onChangeText={setNewWeight}
              keyboardType="numeric"
            />
            <TouchableOpacity
              testID="profile-log-weight-btn"
              style={[styles.logBtn, saving && { opacity: 0.6 }]}
              onPress={logWeight}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.logBtnText}>LOG</Text>}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>HISTORY</Text>
        {logs.length === 0 ? (
          <Text style={styles.empty}>Log your first weight to track progress.</Text>
        ) : (
          logs.slice().reverse().slice(0, 10).map((l, i) => (
            <View key={l.id} style={styles.histRow}>
              <Text style={styles.histDate}>{new Date(l.logged_at).toLocaleDateString()}</Text>
              <Text style={styles.histWeight}>{l.weight_kg} kg</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>YOUR PROFILE</Text>
        <View style={styles.infoCard}>
          <InfoRow label="GENDER" value={profile.gender} />
          <InfoRow label="AGE" value={profile.age ? `${profile.age}` : null} />
          <InfoRow label="HEIGHT" value={profile.height_cm ? `${profile.height_cm} cm` : null} />
          <InfoRow label="GOAL" value={profile.goal?.replace('_', ' ')} />
          <InfoRow label="ACTIVITY" value={profile.activity?.replace('_', ' ')} />
          <InfoRow label="FOCUS" value={(profile.body_focus || []).join(', ')} />
        </View>

        <TouchableOpacity
          testID="profile-edit-btn"
          style={styles.editBtn}
          onPress={() => router.push('/onboarding')}
        >
          <Text style={styles.editText}>EDIT PROFILE</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.2, lineHeight: 42, marginTop: 4 },
  signOutBtn: { borderWidth: 1, borderColor: COLORS.border, padding: 12, backgroundColor: COLORS.surface },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 16, marginTop: 24 },
  avatar: { width: 56, height: 56, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  userName: { color: COLORS.text, fontSize: 18, fontWeight: '900' },
  userEmail: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statBig: { flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 18, alignItems: 'center' },
  statKicker: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '800' },
  statBigNum: { color: COLORS.secondary, fontSize: 40, fontWeight: '900', letterSpacing: -1.5, marginTop: 4 },
  statBigUnit: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '800' },
  sectionTitle: { color: COLORS.text, fontSize: 13, fontWeight: '900', letterSpacing: 2.5, marginTop: 30, marginBottom: 12 },
  weightCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 16 },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weightCell: { flex: 1, alignItems: 'center' },
  weightLbl: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  weightVal: { color: COLORS.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  lostBox: { backgroundColor: COLORS.primary, paddingVertical: 14, alignItems: 'center', marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  lostLbl: { color: '#fff', fontSize: 11, letterSpacing: 3, fontWeight: '900' },
  lostVal: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  logRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  weightInput: { flex: 1, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  logBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: 22, justifyContent: 'center' },
  logBtnText: { color: '#000', fontWeight: '900', letterSpacing: 2 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  histDate: { color: COLORS.textDim, fontSize: 13 },
  histWeight: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  empty: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', padding: 20 },
  infoCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  infoValue: { color: COLORS.text, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  editBtn: { borderWidth: 1, borderColor: COLORS.border, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  editText: { color: COLORS.text, fontWeight: '900', letterSpacing: 2.5 },
});
