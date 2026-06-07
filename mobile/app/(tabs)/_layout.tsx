import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={String(color)} size={size} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#111827' },
        headerTintColor: '#f8fafc',
        tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#1f2937' },
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#94a3b8'
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Capture',
          tabBarIcon: tabIcon('camera-outline')
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarIcon: tabIcon('clipboard-outline')
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: 'Records',
          tabBarIcon: tabIcon('folder-open-outline')
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: tabIcon('settings-outline')
        }}
      />
    </Tabs>
  );
}
