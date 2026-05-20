import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, useAuth } from '../../src/AuthContext';
import { useLang } from '../../src/i18n';
import { Platform } from 'react-native';
import { useEffect } from 'react';

export default function TabsLayout() {
  const { subscription, refreshSubscription } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const s = await refreshSubscription();
      if (s && !s.active) router.replace('/subscribe');
    })();
  }, []);
  if (subscription && !subscription.active) {
    return null;
  }
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textDim,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
        tabBarIcon: ({ color, size }) => {
          const map: any = {
            index: 'home',
            workout: 'flame',
            diet: 'restaurant',
            chat: 'chatbubbles',
            profile: 'person',
          };
          return <Ionicons name={map[route.name] || 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: t('tab_home') }} />
      <Tabs.Screen name="workout" options={{ title: t('tab_workout') }} />
      <Tabs.Screen name="diet" options={{ title: t('tab_diet') }} />
      <Tabs.Screen name="chat" options={{ title: t('tab_coach') }} />
      <Tabs.Screen name="profile" options={{ title: t('tab_profile') }} />
    </Tabs>
  );
}
