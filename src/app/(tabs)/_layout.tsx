import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { colors, font, outline, shadow } from '@/theme/tokens';

/**
 * Floating pill tab bar — an ink-outlined sticker hovering over the paper
 * ground. Screens pad their bottom content by tokens.tabClearance.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.accentDeep,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 12),
          height: 64,
          borderRadius: 22,
          backgroundColor: colors.surface,
          ...outline,
          ...shadow.card,
          paddingTop: 6,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontFamily: font.bodyHeavy, fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Decks',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon
              name={focused ? 'cardsFilled' : 'cards'}
              color={color}
              fill={focused ? undefined : colors.surface2}
              size={size}
            />
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
              fill={focused ? undefined : colors.surface2}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
