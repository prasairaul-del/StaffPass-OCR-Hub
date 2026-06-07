import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '@/state/app-context';

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#111827' },
          headerTintColor: '#f8fafc',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0f172a' }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="record/[id]" options={{ title: 'Record Detail' }} />
      </Stack>
    </AppProvider>
  );
}
