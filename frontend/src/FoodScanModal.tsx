import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Image,
  TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './AuthContext';

type ScanResult = {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  confidence: string;
  note?: string;
};

export default function FoodScanModal({
  visible,
  onClose,
  api,
  onLogged,
}: {
  visible: boolean;
  onClose: () => void;
  api: <T = any>(p: string, init?: RequestInit) => Promise<T>;
  onLogged: () => void;
}) {
  const [imgBase64, setImgBase64] = useState<string | null>(null);
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [logging, setLogging] = useState(false);

  // Editable copies
  const [eName, setEName] = useState('');
  const [eCal, setECal] = useState('');
  const [eProt, setEProt] = useState('');
  const [eCarb, setECarb] = useState('');
  const [eFat, setEFat] = useState('');

  const reset = () => {
    setImgBase64(null); setImgUri(null); setResult(null);
    setEName(''); setECal(''); setEProt(''); setECarb(''); setEFat('');
  };

  const handlePick = async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera access to scan food.'); return; }
        const r = await ImagePicker.launchCameraAsync({
          quality: 0.6, base64: true, allowsEditing: true, aspect: [1, 1],
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
        if (r.canceled || !r.assets?.[0]) return;
        setImgUri(r.assets[0].uri);
        setImgBase64(r.assets[0].base64 || null);
        await runScan(r.assets[0].base64 || '');
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
        const r = await ImagePicker.launchImageLibraryAsync({
          quality: 0.6, base64: true, allowsEditing: true, aspect: [1, 1],
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
        if (r.canceled || !r.assets?.[0]) return;
        setImgUri(r.assets[0].uri);
        setImgBase64(r.assets[0].base64 || null);
        await runScan(r.assets[0].base64 || '');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to open camera');
    }
  };

  const runScan = async (b64: string) => {
    if (!b64) { Alert.alert('Error', 'No image data'); return; }
    setScanning(true); setResult(null);
    try {
      const res = await api<ScanResult>('/food/scan', {
        method: 'POST',
        body: JSON.stringify({ image_base64: b64 }),
      });
      setResult(res);
      setEName(res.name);
      setECal(String(res.calories));
      setEProt(String(res.protein_g));
      setECarb(String(res.carbs_g));
      setEFat(String(res.fats_g));
    } catch (e: any) {
      Alert.alert('Could not scan', e.message || 'Try a clearer food photo.');
      reset();
    } finally { setScanning(false); }
  };

  const handleLog = async () => {
    if (!result) return;
    if (!eName.trim()) { Alert.alert('Missing', 'Name your meal first.'); return; }
    const cal = parseInt(eCal || '0', 10);
    if (Number.isNaN(cal) || cal < 0) { Alert.alert('Invalid', 'Calories must be a positive number.'); return; }
    setLogging(true);
    try {
      await api('/food/log', {
        method: 'POST',
        body: JSON.stringify({
          name: eName.trim(),
          calories: cal,
          protein_g: parseFloat(eProt || '0') || 0,
          carbs_g: parseFloat(eCarb || '0') || 0,
          fats_g: parseFloat(eFat || '0') || 0,
          portion: result.portion,
          note: result.note,
        }),
      });
      onLogged();
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to log meal');
    } finally { setLogging(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { reset(); onClose(); }} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>SCAN YOUR FOOD</Text>
            <TouchableOpacity testID="food-scan-close" onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={28} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            {!imgUri && !scanning && (
              <View style={{ padding: 20 }}>
                <Text style={styles.intro}>
                  Snap a photo of your meal. Coach C will estimate <Text style={{ color: COLORS.secondary, fontWeight: '900' }}>calories & macros</Text> in seconds.
                </Text>
                <TouchableOpacity testID="food-scan-camera" style={styles.bigBtn} onPress={() => handlePick('camera')}>
                  <Ionicons name="camera" size={28} color="#000" />
                  <Text style={styles.bigBtnText}>TAKE PHOTO</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="food-scan-gallery" style={[styles.bigBtn, styles.bigBtnAlt]} onPress={() => handlePick('gallery')}>
                  <Ionicons name="images" size={26} color={COLORS.text} />
                  <Text style={[styles.bigBtnText, { color: COLORS.text }]}>PICK FROM GALLERY</Text>
                </TouchableOpacity>
                <View style={styles.tipRow}>
                  <Ionicons name="bulb" size={16} color={COLORS.textDim} />
                  <Text style={styles.tipTxt}>Estimates are best with a single dish, good lighting, and a top-down view.</Text>
                </View>
              </View>
            )}

            {scanning && (
              <View style={styles.scanBox}>
                {imgUri && <Image source={{ uri: imgUri }} style={styles.preview} />}
                <ActivityIndicator size="large" color={COLORS.secondary} style={{ marginTop: 18 }} />
                <Text style={styles.scanTxt}>ANALYSING WITH COACH C…</Text>
                <Text style={styles.scanSub}>Identifying ingredients & estimating macros…</Text>
              </View>
            )}

            {result && !scanning && (
              <View style={{ padding: 20 }}>
                {imgUri && <Image source={{ uri: imgUri }} style={styles.previewSmall} />}
                <View style={styles.confidenceRow}>
                  <Text style={styles.confidenceLbl}>AI Confidence</Text>
                  <View style={[styles.confPill, result.confidence === 'high' && { backgroundColor: COLORS.success }, result.confidence === 'low' && { backgroundColor: COLORS.error }]}>
                    <Text style={styles.confPillText}>{result.confidence.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.fieldLbl}>FOOD NAME</Text>
                <TextInput testID="food-edit-name" value={eName} onChangeText={setEName} style={styles.input} placeholder="e.g. Chicken salad" placeholderTextColor={COLORS.textDim} />

                {!!result.portion && <Text style={styles.portion}>Portion: {result.portion}</Text>}

                <View style={styles.macroGrid}>
                  <View style={styles.macroCell}>
                    <Text style={styles.macroCellLbl}>CALORIES</Text>
                    <TextInput testID="food-edit-cal" value={eCal} onChangeText={setECal} keyboardType="number-pad" style={styles.macroInput} />
                    <Text style={styles.macroUnit}>kcal</Text>
                  </View>
                  <View style={styles.macroCell}>
                    <Text style={styles.macroCellLbl}>PROTEIN</Text>
                    <TextInput testID="food-edit-prot" value={eProt} onChangeText={setEProt} keyboardType="decimal-pad" style={styles.macroInput} />
                    <Text style={styles.macroUnit}>g</Text>
                  </View>
                  <View style={styles.macroCell}>
                    <Text style={styles.macroCellLbl}>CARBS</Text>
                    <TextInput testID="food-edit-carb" value={eCarb} onChangeText={setECarb} keyboardType="decimal-pad" style={styles.macroInput} />
                    <Text style={styles.macroUnit}>g</Text>
                  </View>
                  <View style={styles.macroCell}>
                    <Text style={styles.macroCellLbl}>FATS</Text>
                    <TextInput testID="food-edit-fat" value={eFat} onChangeText={setEFat} keyboardType="decimal-pad" style={styles.macroInput} />
                    <Text style={styles.macroUnit}>g</Text>
                  </View>
                </View>

                {!!result.note && (
                  <View style={styles.aiNote}>
                    <Ionicons name="information-circle" size={16} color={COLORS.secondary} />
                    <Text style={styles.aiNoteText}>{result.note}</Text>
                  </View>
                )}

                <View style={styles.btnRow}>
                  <TouchableOpacity testID="food-scan-rescan" style={styles.rescanBtn} onPress={() => reset()}>
                    <Text style={styles.rescanText}>RESCAN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="food-log-btn"
                    style={[styles.logBtn, logging && { opacity: 0.6 }]}
                    onPress={handleLog}
                    disabled={logging}
                  >
                    {logging ? <ActivityIndicator color="#000" /> : <Text style={styles.logBtnText}>LOG TO TODAY</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.bg, borderTopWidth: 3, borderTopColor: COLORS.primary, maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  intro: { color: COLORS.textDim, fontSize: 14, lineHeight: 20, marginBottom: 20, textAlign: 'center' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.secondary, paddingVertical: 18, marginBottom: 12 },
  bigBtnAlt: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  bigBtnText: { color: '#000', fontWeight: '900', letterSpacing: 2, fontSize: 14 },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tipTxt: { color: COLORS.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  scanBox: { alignItems: 'center', padding: 30 },
  preview: { width: 200, height: 200, borderWidth: 2, borderColor: COLORS.secondary },
  previewSmall: { width: 100, height: 100, alignSelf: 'center', marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  scanTxt: { color: COLORS.text, fontSize: 14, fontWeight: '900', letterSpacing: 2, marginTop: 20 },
  scanSub: { color: COLORS.textDim, fontSize: 12, marginTop: 6 },
  confidenceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  confidenceLbl: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  confPill: { backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2 },
  confPillText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  fieldLbl: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, color: COLORS.text, padding: 14, fontSize: 16, fontWeight: '700' },
  portion: { color: COLORS.textDim, fontSize: 12, marginTop: 6, marginBottom: 16, fontStyle: 'italic' },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  macroCell: { width: '48%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 12 },
  macroCellLbl: { color: COLORS.textDim, fontSize: 9, letterSpacing: 2, fontWeight: '800' },
  macroInput: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginTop: 4, padding: 0 },
  macroUnit: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2 },
  aiNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14, padding: 12, backgroundColor: COLORS.surface, borderLeftWidth: 3, borderLeftColor: COLORS.secondary },
  aiNoteText: { color: COLORS.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  rescanBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 16, alignItems: 'center' },
  rescanText: { color: COLORS.text, fontWeight: '900', letterSpacing: 2 },
  logBtn: { flex: 2, backgroundColor: COLORS.secondary, paddingVertical: 16, alignItems: 'center' },
  logBtnText: { color: '#000', fontWeight: '900', letterSpacing: 2 },
});
