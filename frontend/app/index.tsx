import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, COLORS } from '../src/AuthContext';

export default function Index() {
  const { user, loading, refreshSubscription } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!user) {
        router.replace('/auth/login');
        return;
      }
      if (!user.profile?.age || !user.profile?.gender) {
        router.replace('/onboarding');
        return;
      }
      // Profile complete → check subscription
      setChecking(true);
      const sub = await refreshSubscription();
      setChecking(false);
      if (sub?.active) {
        router.replace('/(tabs)');
      } else {
        router.replace('/subscribe');
      }
    })();
  }, [user, loading]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
