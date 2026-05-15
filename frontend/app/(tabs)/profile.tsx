import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Switch, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, COLORS } from '../../src/AuthContext';
import { LANGUAGES, useLang } from '../../src/i18n';
import { COUNTRY_OPTIONS, currencyForCountry } from '../../src/regions';
import { isReminderEnabled, setReminderEnabled } from '../../src/notifications';
import { Ionicons } from '@expo/vector-icons';

export default function Profile() {
  const { user, api, signOut, refreshUser } = useAuth();
  const router = useRouter();
  const { lang, setLang, country, setCountry, t } = useLang();
  const [newWeight, setNewWeight] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [remindersOn, setRemindersOn] = useState(true);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);

  useEffect(() => { (async () => setRemindersOn(await isReminderEnabled()))(); }, []);

  const toggleReminders = async (val: boolean) => {
    setRemindersOn(val);
    await setReminderEnabled(val);
    Alert.alert(val ? '🔔 Reminders ON' : 'Reminders OFF',
      val ? "We'll nudge you daily at 9:00 AM." : "You won't get daily nudges.");
  };

  const load = useCallback(async () => {
    try {
      const r = await api<any>('/progress/weight');
      setLogs(r.logs || []);
    } catch (_) {}
    try {
      const w = await api<any>('/progress/weekly');
      setWeeks(w.weeks || []);
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

  const setLanguage = async (newLang: string) => {
    await setLang(newLang);
    // best-effort sync to profile when logged in
    try { await api('/profile', { method: 'PUT', body: JSON.stringify({ language: newLang }) }); await refreshUser(); } catch (_) {}
  };
  const changeCountry = async (cc: string) => {
    await setCountry(cc);
    try { await api('/profile', { method: 'PUT', body: JSON.stringify({ country: cc }) }); await refreshUser(); } catch (_) {}
  };
  const toggleWhistle = async (val: boolean) => {
    await api('/profile', { method: 'PUT', body: JSON.stringify({ whistle_enabled: val }) });
    await refreshUser();
  };

  const profile = user?.profile || {};
  const startWeight = logs.length ? logs[0].weight_kg : profile.weight_kg;
  const currentWeight = profile.weight_kg;
  const targetWeight = profile.target_weight_kg;
  const lost = startWeight && currentWeight ? (startWeight - currentWeight).toFixed(1) : '0.0';
  const whistleOn = profile.whistle_enabled !== false;
  const currentLang = lang;
  const currentCountry = country || 'US';
  const currentCountryOpt = COUNTRY_OPTIONS.find(c => c.code === currentCountry) || COUNTRY_OPTIONS[0];
  const currentLangOpt = LANGUAGES.find(l => l.key === currentLang) || LANGUAGES[0];
  const genderEmoji = profile.gender === 'female' ? '👩' : '👨';

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
            <Text style={styles.avatarEmoji}>{genderEmoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {profile.target_reason ? (
              <Text style={styles.userReason}>💭 {profile.target_reason}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBig}>
            <Text style={styles.statKicker}>STREAK</Text>
            <Text style={styles.statBigNum}>{user?.streak || 0}</Text>
            <Text style={styles.statBigUnit}>DAYS</Text>
          </View>
          <View style={styles.statBig}>
            <Text style={styles.statKicker}>WORKOUTS</Text>
            <Text style={[styles.statBigNum, { color: COLORS.primary }]}>{user?.completed_days?.length || 0}</Text>
            <Text style={styles.statBigUnit}>DONE</Text>
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

        <Text style={styles.sectionTitle}>WEEKLY PROGRESS 📊</Text>
        {weeks.length === 0 ? (
          <Text style={styles.empty}>Log your weight weekly to see fat-loss trends.</Text>
        ) : (
          <View style={styles.tableCard} testID="weekly-table">
            <View style={styles.tableHead}>
              <Text style={[styles.thCell, { flex: 1 }]}>WK</Text>
              <Text style={[styles.thCell, { flex: 2 }]}>AVG</Text>
              <Text style={[styles.thCell, { flex: 2 }]}>Δ</Text>
              <Text style={[styles.thCell, { flex: 2 }]}>FAT</Text>
            </View>
            {weeks.map((w, i) => (
              <View key={w.week} style={[styles.tableRow, i === weeks.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[styles.tdCell, { flex: 1, color: COLORS.secondary }]}>W{w.week}</Text>
                <Text style={[styles.tdCell, { flex: 2 }]}>{w.avg_weight} kg</Text>
                <Text style={[styles.tdCell, { flex: 2, color: w.delta < 0 ? COLORS.success : w.delta > 0 ? COLORS.error : COLORS.textDim }]}>
                  {w.delta > 0 ? '+' : ''}{w.delta} kg
                </Text>
                <Text style={[styles.tdCell, { flex: 2, color: COLORS.primary }]}>-{w.fat_loss_est} kg</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>SETTINGS ⚙️</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>DAILY WORKOUT REMINDER</Text>
              <Text style={styles.settingDesc}>Notification at 9:00 AM every day</Text>
            </View>
            <Switch
              testID="setting-reminders"
              value={remindersOn}
              onValueChange={toggleReminders}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={remindersOn ? COLORS.secondary : '#888'}
            />
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>WHISTLE SOUND</Text>
              <Text style={styles.settingDesc}>Plays at workout start & end</Text>
            </View>
            <Switch
              testID="setting-whistle"
              value={whistleOn}
              onValueChange={toggleWhistle}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={whistleOn ? COLORS.secondary : '#888'}
            />
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('language')}</Text>
              <Text style={styles.settingDesc}>{t('select_language')}</Text>
            </View>
            <TouchableOpacity
              testID="open-lang-picker"
              style={styles.pickerBtn}
              onPress={() => setLangPickerOpen(true)}
            >
              <Text style={styles.pickerBtnText}>{currentLangOpt.native}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>
          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('region')} / {t('currency')}</Text>
              <Text style={styles.settingDesc}>{t('select_region')}</Text>
            </View>
            <TouchableOpacity
              testID="open-region-picker"
              style={styles.pickerBtn}
              onPress={() => setRegionPickerOpen(true)}
            >
              <Text style={styles.pickerBtnText}>{currentCountryOpt.flag} {currentCountryOpt.currency}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>YOUR PROFILE</Text>
        <View style={styles.infoCard}>
          <InfoRow label="GENDER" value={profile.gender ? `${genderEmoji} ${profile.gender}` : null} />
          <InfoRow label="AGE" value={profile.age ? `${profile.age}` : null} />
          <InfoRow label="HEIGHT" value={profile.height_cm ? `${profile.height_cm} cm` : null} />
          <InfoRow label="GOAL" value={profile.goal?.replace('_', ' ')} />
          <InfoRow label="DIFFICULTY" value={profile.difficulty} />
          <InfoRow label="ACTIVITY" value={profile.activity?.replace('_', ' ')} />
          <InfoRow label="FOCUS" value={(profile.body_focus || []).join(', ')} />
        </View>

        <TouchableOpacity testID="profile-edit-btn" style={styles.editBtn} onPress={() => router.push('/onboarding')}>
          <Text style={styles.editText}>EDIT PROFILE</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Language picker */}
      <Modal visible={langPickerOpen} animationType="slide" transparent onRequestClose={() => setLangPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('select_language')}</Text>
              <TouchableOpacity onPress={() => setLangPickerOpen(false)}>
                <Ionicons name="close" size={26} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              {LANGUAGES.map(l => {
                const active = currentLang === l.key;
                return (
                  <TouchableOpacity
                    key={l.key}
                    testID={`lang-opt-${l.key}`}
                    style={[styles.optRow, active && styles.optRowActive]}
                    onPress={async () => { await setLanguage(l.key); setLangPickerOpen(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optName}>{l.native}</Text>
                      <Text style={styles.optSub}>{l.label}{l.rtl ? ' • RTL' : ''}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color={COLORS.secondary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Region / currency picker */}
      <Modal visible={regionPickerOpen} animationType="slide" transparent onRequestClose={() => setRegionPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('select_region')}</Text>
              <TouchableOpacity onPress={() => setRegionPickerOpen(false)}>
                <Ionicons name="close" size={26} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              {COUNTRY_OPTIONS.map(c => {
                const active = currentCountry === c.code;
                return (
                  <TouchableOpacity
                    key={c.code}
                    testID={`region-opt-${c.code}`}
                    style={[styles.optRow, active && styles.optRowActive]}
                    onPress={async () => { await changeCountry(c.code); setRegionPickerOpen(false); }}
                  >
                    <Text style={{ fontSize: 22, marginRight: 12 }}>{c.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optName}>{c.name}</Text>
                      <Text style={styles.optSub}>{c.currency} ({c.symbol})</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color={COLORS.secondary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  avatar: { width: 60, height: 60, backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.primary },
  avatarEmoji: { fontSize: 32 },
  userName: { color: COLORS.text, fontSize: 18, fontWeight: '900' },
  userEmail: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  userReason: { color: COLORS.secondary, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
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
  tableCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 12, paddingHorizontal: 14 },
  thCell: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '900' },
  tableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  tdCell: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  empty: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', padding: 20 },
  settingsCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  settingTitle: { color: COLORS.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  settingDesc: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },
  langChip: { borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8 },
  langChipActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  langText: { color: COLORS.text, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surfaceElevated },
  pickerBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.bg, borderTopWidth: 2, borderTopColor: COLORS.primary, padding: 16, paddingBottom: 30 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 8 },
  sheetTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  optRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  optRowActive: { backgroundColor: COLORS.surface },
  optName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  optSub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  infoCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  infoValue: { color: COLORS.text, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  editBtn: { borderWidth: 1, borderColor: COLORS.border, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  editText: { color: COLORS.text, fontWeight: '900', letterSpacing: 2.5 },
});
