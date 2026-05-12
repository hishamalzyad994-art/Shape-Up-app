import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, COLORS } from '../../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function Diet() {
  const { api } = useAuth();
  const [macros, setMacros] = useState<any>(null);
  const [plans, setPlans] = useState<any>(null);
  const [recommended, setRecommended] = useState<string>('healthy');
  const [selected, setSelected] = useState<string>('healthy');

  const load = useCallback(async () => {
    try {
      const m = await api<any>('/calories');
      setMacros(m);
    } catch (_) {}
    const p = await api<any>('/meals/plans');
    setPlans(p.plans);
    setRecommended(p.recommended);
    setSelected(p.recommended);
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const setGoal = async (goal: string) => {
    setSelected(goal);
    try { await api('/profile', { method: 'PUT', body: JSON.stringify({ goal }) }); } catch (_) {}
    try { const m = await api<any>('/calories'); setMacros(m); } catch (_) {}
  };

  const plan = plans?.[selected];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>NUTRITION</Text>
        <Text style={styles.title}>FUEL{'\n'}RIGHT</Text>
        <View style={styles.accentBar} />

        <View style={styles.macroBox}>
          <Text style={styles.macroKicker}>YOUR DAILY TARGET</Text>
          <Text style={styles.macroBig} testID="diet-calorie-target">{macros?.target_calories ?? '—'}</Text>
          <Text style={styles.macroUnit}>KCAL / DAY</Text>
          <View style={styles.macroRow}>
            <View style={styles.macroItem}>
              <Text style={styles.macroVal}>{macros?.protein_g ?? '—'}g</Text>
              <Text style={styles.macroLbl}>PROTEIN</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroVal}>{macros?.carbs_g ?? '—'}g</Text>
              <Text style={styles.macroLbl}>CARBS</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroVal}>{macros?.fats_g ?? '—'}g</Text>
              <Text style={styles.macroLbl}>FATS</Text>
            </View>
          </View>
          <Text style={styles.macroBmr}>BMR {macros?.bmr ?? '—'} • TDEE {macros?.tdee ?? '—'}</Text>
        </View>

        {macros?.bmi && (
          <View style={styles.bmiCard} testID="diet-bmi-card">
            <View style={{ flex: 1 }}>
              <Text style={styles.macroKicker}>BMI</Text>
              <Text style={styles.bmiBig}>{macros.bmi}</Text>
              <Text style={[
                styles.bmiCat,
                macros.bmi_category === 'normal' && { color: COLORS.success },
                macros.bmi_category === 'over' && { color: '#F59E0B' },
                macros.bmi_category === 'obese' && { color: COLORS.error },
                macros.bmi_category === 'under' && { color: '#60A5FA' },
              ]}>
                {macros.bmi_category === 'under' && 'UNDERWEIGHT'}
                {macros.bmi_category === 'normal' && 'NORMAL'}
                {macros.bmi_category === 'over' && 'OVERWEIGHT'}
                {macros.bmi_category === 'obese' && 'OBESE'}
              </Text>
            </View>
            <View style={styles.bmiBar}>
              <View style={[styles.bmiSeg, { backgroundColor: '#60A5FA' }]} />
              <View style={[styles.bmiSeg, { backgroundColor: COLORS.success }]} />
              <View style={[styles.bmiSeg, { backgroundColor: '#F59E0B' }]} />
              <View style={[styles.bmiSeg, { backgroundColor: COLORS.error }]} />
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>CHOOSE PLAN</Text>
        <View style={styles.planTabs}>
          {['fat_loss', 'muscle_gain', 'healthy'].map(k => {
            const active = selected === k;
            return (
              <TouchableOpacity
                key={k}
                testID={`diet-plan-tab-${k}`}
                style={[styles.planTab, active && styles.planTabActive]}
                onPress={() => setGoal(k)}
              >
                <Text style={[styles.planTabText, active && { color: '#000' }]}>
                  {k.replace('_', ' ').toUpperCase()}
                </Text>
                {recommended === k && <View style={styles.recDot} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {plan && (
          <View testID="diet-plan-card" style={styles.planCard}>
            <Image source={{ uri: plan.image }} style={styles.planImg} />
            <View style={styles.planInfo}>
              <Text style={styles.planTitle}>{plan.title}</Text>
              <Text style={styles.planCal}>{plan.calories}</Text>
            </View>
            <View style={styles.mealList}>
              {plan.meals.map((m: any, i: number) => (
                <View key={i} style={styles.mealRow}>
                  <View style={styles.mealLeft}>
                    <Text style={styles.mealLabel}>{m.meal.toUpperCase()}</Text>
                    <Text style={styles.mealName}>{m.name}</Text>
                  </View>
                  <View style={styles.mealRight}>
                    <Text style={styles.mealKcal}>{m.kcal}</Text>
                    <Text style={styles.mealKcalUnit}>KCAL</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.tipBox}>
          <Ionicons name="water" size={22} color={COLORS.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>HYDRATION TIP</Text>
            <Text style={styles.tipText}>Drink 8 glasses (2L) of water daily. Add 500ml per hour of training.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 50 },
  kicker: { color: COLORS.secondary, fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.2, lineHeight: 42, marginTop: 4 },
  accentBar: { width: 50, height: 4, backgroundColor: COLORS.primary, marginTop: 12, marginBottom: 20 },
  macroBox: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 20, alignItems: 'center' },
  macroKicker: { color: COLORS.textDim, fontSize: 10, letterSpacing: 3, fontWeight: '800' },
  macroBig: { color: COLORS.primary, fontSize: 64, fontWeight: '900', letterSpacing: -2, marginTop: 4 },
  macroUnit: { color: COLORS.textDim, fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  macroItem: { alignItems: 'center' },
  macroVal: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  macroLbl: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginTop: 2, fontWeight: '700' },
  macroBmr: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginTop: 12, fontWeight: '700' },
  sectionTitle: { color: COLORS.text, fontSize: 14, fontWeight: '900', letterSpacing: 2, marginTop: 30, marginBottom: 12 },
  planTabs: { flexDirection: 'row', gap: 6 },
  planTab: { flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingVertical: 12, alignItems: 'center', position: 'relative' },
  planTabActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  planTabText: { color: COLORS.text, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  recDot: { position: 'absolute', top: 4, right: 6, width: 6, height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  planCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, marginTop: 16 },
  planImg: { width: '100%', height: 160 },
  planInfo: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  planTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  planCal: { color: COLORS.secondary, fontSize: 12, letterSpacing: 2, fontWeight: '800', marginTop: 4 },
  mealList: { paddingHorizontal: 16, paddingVertical: 8 },
  mealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mealLeft: { flex: 1 },
  mealLabel: { color: COLORS.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  mealName: { color: COLORS.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  mealRight: { alignItems: 'flex-end' },
  mealKcal: { color: COLORS.text, fontSize: 18, fontWeight: '900' },
  mealKcalUnit: { color: COLORS.textDim, fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  tipBox: { flexDirection: 'row', gap: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 16, marginTop: 24 },
  tipTitle: { color: COLORS.secondary, fontSize: 11, letterSpacing: 2, fontWeight: '900' },
  tipText: { color: COLORS.textDim, fontSize: 13, marginTop: 4, lineHeight: 18 },
  bmiCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 20, marginTop: 12 },
  bmiBig: { color: COLORS.secondary, fontSize: 44, fontWeight: '900', letterSpacing: -1.5, marginTop: 4 },
  bmiCat: { fontSize: 12, letterSpacing: 2, fontWeight: '900', marginTop: 4 },
  bmiBar: { flexDirection: 'column', gap: 4, flex: 1 },
  bmiSeg: { height: 18 },
});
