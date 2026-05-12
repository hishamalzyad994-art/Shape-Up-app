import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, COLORS } from '../../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';

type Msg = { role: 'user' | 'assistant'; text: string };

const SUGGESTIONS = [
  "How do I lose belly fat fast?",
  "What should I eat post-workout?",
  "I'm feeling unmotivated today",
  "Suggest a quick HIIT routine",
];

export default function Chat() {
  const { api } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHist, setLoadingHist] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      try {
        const h = await api<any>('/chat/history');
        setMsgs((h.messages || []).map((m: any) => ({ role: m.role, text: m.text })));
      } catch (_) {}
      setLoadingHist(false);
    })();
  }, [api]);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', text: message }]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await api<any>('/chat', { method: 'POST', body: JSON.stringify({ message }) });
      setMsgs(prev => [...prev, { role: 'assistant', text: res.reply }]);
    } catch (e: any) {
      setMsgs(prev => [...prev, { role: 'assistant', text: `⚠️ ${e.message || 'Coach is offline'}` }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>AI PERSONAL TRAINER</Text>
          <Text style={styles.title}>COACH C</Text>
        </View>
        <View style={styles.statusDot} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.chatBody}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {loadingHist ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : msgs.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.coachAvatar}>
                <Ionicons name="flame" size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>YO, I'M COACH C.</Text>
              <Text style={styles.emptyText}>
                Your 24/7 AI fitness coach. Ask me about workouts, nutrition, motivation — anything.
              </Text>
              <View style={styles.suggestWrap}>
                {SUGGESTIONS.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    testID={`chat-suggestion-${i}`}
                    style={styles.suggestChip}
                    onPress={() => send(s)}
                  >
                    <Text style={styles.suggestText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            msgs.map((m, i) => (
              <View
                key={i}
                testID={`chat-msg-${m.role}-${i}`}
                style={[styles.msg, m.role === 'user' ? styles.msgUser : styles.msgAi]}
              >
                {m.role === 'assistant' && (
                  <Text style={styles.msgFrom}>COACH C</Text>
                )}
                <Text style={styles.msgText}>{m.text}</Text>
              </View>
            ))
          )}
          {sending && (
            <View style={[styles.msg, styles.msgAi]}>
              <Text style={styles.msgFrom}>COACH C</Text>
              <ActivityIndicator color={COLORS.primary} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            testID="ai-chat-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask Coach C…"
            placeholderTextColor={COLORS.textDim}
            style={styles.inputField}
            onSubmitEditing={() => send()}
            editable={!sending}
            multiline
          />
          <TouchableOpacity
            testID="ai-chat-send-btn"
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
            onPress={() => send()}
            disabled={!input.trim() || sending}
          >
            <Ionicons name="arrow-up" size={22} color="#000" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  kicker: { color: COLORS.secondary, fontSize: 10, letterSpacing: 2.5, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success },
  chatBody: { padding: 16, paddingBottom: 20 },
  empty: { alignItems: 'center', marginTop: 40 },
  coachAvatar: { width: 72, height: 72, borderWidth: 2, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  emptyTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 18 },
  emptyText: { color: COLORS.textDim, fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 20, lineHeight: 20 },
  suggestWrap: { marginTop: 24, width: '100%', gap: 10 },
  suggestChip: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 14 },
  suggestText: { color: COLORS.text, fontSize: 13 },
  msg: { marginBottom: 12, padding: 14, maxWidth: '85%' },
  msgUser: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  msgAi: { alignSelf: 'flex-start', backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border },
  msgFrom: { color: COLORS.primary, fontSize: 9, letterSpacing: 2, fontWeight: '900', marginBottom: 4 },
  msgText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  inputField: { flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, color: COLORS.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, maxHeight: 120 },
  sendBtn: { width: 46, height: 46, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
});
