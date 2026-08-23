import { Tabs } from 'expo-router';

import { Icon } from '@/components/Icon';
import { colors, font } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.accentDeep,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1.5,
          borderTopColor: colors.lineSoft,
        },
        tabBarLabelStyle: { fontFamily: font.bodyHeavy, fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Decks',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name={focused ? 'cardsFilled' : 'cards'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon
              name={focused ? 'chartFilled' : 'chart'}
              color={color}
              size={size}
              strokeWidth={2.5}
            />
          ),
        }}
      />
    </Tabs>
  );
}
