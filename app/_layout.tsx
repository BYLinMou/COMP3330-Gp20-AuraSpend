import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { CurrencyProvider } from '../src/providers/CurrencyProvider';
import { LanguageProvider } from '../src/providers/LanguageProvider';
import { ToastProvider } from '../src/providers/ToastProvider';
import '../src/i18n'; // Initialize i18n

function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Redirect to sign-in if not authenticated
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      // Redirect to tabs if authenticated
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <ToastProvider>
              <Gate />
            </ToastProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}