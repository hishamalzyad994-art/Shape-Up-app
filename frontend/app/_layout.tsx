import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider } from '../src/AuthContext';
import { LanguageProvider } from '../src/i18n';
import { configureRC, isRevenueCatAvailable } from '../src/purchases';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  // Pre-initialise RevenueCat on app boot so the very first tap on the
  // Restore / Subscribe button never hits an uninitialised SDK. This is
  // critical for App Store review — Apple's iPad reviewer was tapping the
  // button on a fresh install before any login had configured the SDK.
  useEffect(() => {
    if (isRevenueCatAvailable()) {
      configureRC(null).catch(() => {});
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#050505' },
                animation: 'fade',
              }}
            />
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
