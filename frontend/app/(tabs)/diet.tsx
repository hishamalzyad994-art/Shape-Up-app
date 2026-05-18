import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, COLORS } from '../../src/AuthContext';
import FoodScanModal from '../../src/FoodScanModal';
import { Ionicons } from '@expo/vector-icons';

export default function Diet() {
  const { api } = useAuth();
  const [macros, setMacros] = useState<any>(null);
  const [plans, setPlans] = useState<any>(null);
  const [recommended, setRecommended] = useState<string>('healthy');
  const [selected, setSelected] = useState<string>('healthy');
  const [scanOpen, setScanOpen] = useState(false);
  const [today, setToday] = useState<{ items: any[]; totals: any } | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await api<any>('/calories');
      setMacros(m);
    } catch (_) {}
    const p = await api<any>('/meals/plans');
    setPlans(p.plans);
    setRecommended(p.recommended);
    setSelected(p.recommended);
    try {
      const t = await api<any>('/food/today');
      setToday({ items: t.items || [], totals: t.totals || {} });
    } catch (_) {}
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const removeEntry = (id: string) => {
    Alert.alert('Remove meal?', 'This will subtract it from today\'s total.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          const t = await api<any>(`/food/log/${id}`, { method: 'DELETE' });
          setToday({ items: t.items || [], totals: t.totals || {} });
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

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

        {/* AI FOOD SCAN */}
        <TouchableOpacity testID="open-food-scan" style={styles.scanCta} onPress={() => setScanOpen(true)} activeOpacity={0.85}>
          <View style={styles.scanIconBox}>
            <Ionicons name="scan" size={26} color="#000" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanCtaTitle}>📸 SCAN YOUR FOOD</Text>
            <Text style={styles.scanCtaSub}>Snap a photo • AI estimates calories & macros</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#000" />
        </TouchableOpacity>

        {/* TODAY'S FOOD LOG */}
        {today && today.items.length > 0 && (
          <View style={styles.todayBox} testID="today-food-list">
            <View style={styles.todayHead}>
              <Text style={styles.sectionTitle}>TODAY'S MEALS</Text>
              <View style={styles.todayTotals}>
                <Text style={styles.todayTotalCal}>{today.totals.calories}</Text>
                <Text style={styles.todayTotalLbl}>KCAL EATEN</Text>
              </View>
            </View>
            {macros?.target_calories ? (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (today.totals.calories / macros.target_calories) * 100)}%` }]} />
              </View>
            ) : null}
            <Text style={styles.todayHint}>
              {macros?.target_calories
                ? `${Math.max(0, macros.target_calories - today.totals.calories)} kcal left today • P ${today.totals.protein_g}g • C ${today.totals.carbs_g}g • F ${today.totals.fats_g}g`
                : `Protein ${today.totals.protein_g}g • Carbs ${today.totals.carbs_g}g • Fats ${today.totals.fats_g}g`}
            </Text>
            {today.items.map((it: any) => (
              <View key={it.id} style={styles.foodRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.foodName}>{it.name}</Text>
                  <Text style={styles.foodMacros}>
                    {it.calories} kcal • P {it.protein_g}g • C {it.carbs_g}g • F {it.fats_g}g
                  </Text>
                </View>
                <TouchableOpacity testID={`food-remove-${it.id}`} onPress={() => removeEntry(it.id)} style={styles.foodDel}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

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

      <FoodScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        api={api}
        onLogged={async () => {
          try { const t = await api<any>('/food/today'); setToday({ items: t.items || [], totals: t.totals || {} }); } catch (_) {}
        }}
      />
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
  scanCta: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.secondary, padding: 16, marginTop: 14 },
  scanIconBox: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  scanCtaTitle: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  scanCtaSub: { color: '#000', fontSize: 11, marginTop: 2, opacity: 0.75 },
  todayBox: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 16, marginTop: 16 },
  todayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  todayTotals: { alignItems: 'flex-end' },
  todayTotalCal: { color: COLORS.primary, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  todayTotalLbl: { color: COLORS.textDim, fontSize: 9, letterSpacing: 2, fontWeight: '800' },
  progressBar: { height: 6, backgroundColor: COLORS.border, marginTop: 10 },
  progressFill: { height: 6, backgroundColor: COLORS.secondary },
  todayHint: { color: COLORS.textDim, fontSize: 11, marginTop: 6, fontWeight: '600' },
  foodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4 },
  foodName: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  foodMacros: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },
  foodDel: { padding: 8 },
});
