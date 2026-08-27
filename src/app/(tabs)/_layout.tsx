import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';

import { Icon } from '@/components/Icon';
import { font, getColors, useThemeStore, outline, shadow } from '@/theme/tokens';
import { BouncyPressable } from '@/components/BouncyPressable';

/** Binder-divider tabs growing from the bottom edge; the active one rises and names itself. */
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);

  const getIconName = (routeName: string) => {
    if (routeName === 'index') return 'decksTab';
    if (routeName === 'planner') return 'plannerTab';
    if (routeName === 'progress') return 'progressTab';
    return 'decksTab';
  };

  const bottomPad = Math.max(insets.bottom, 10);
  // The opaque paper shelf the tabs stand on. Sized to the resting tab
  // (paddingTop 9 + icon 26 + bottomPad) minus a hair, so the tab
  // borders stay visible — without it, screen content shows through the
  // gaps between tabs and the bar looks like it overlaps every screen.
  const shelfHeight = 33 + bottomPad;

  return (
    <View style={styles.tabBar} pointerEvents="box-none">
      <View
        pointerEvents="none"
        style={[
          styles.shelf,
          { height: shelfHeight, backgroundColor: colors.bg, borderTopColor: colors.edge },
        ]}
      />
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const label = (options.title ?? route.name).toUpperCase();

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <BouncyPressable
            key={route.key}
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title}
            testID={options.tabBarTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[
              styles.tab,
              { backgroundColor: colors.surface, paddingBottom: bottomPad },
              isFocused && [styles.tabActive, { backgroundColor: colors.accentWash }],
            ]}
          >
            <Icon
              name={getIconName(route.name)}
              size={26}
              color={isFocused ? (isDark ? colors.accentDeep : colors.ink) : colors.textFaint}
            />
            {isFocused ? (
              <Text style={[styles.tabLabel, { color: colors.accentDeep }]}>{label}</Text>
            ) : null}
          </BouncyPressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);

  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Decks' }} />
      <Tabs.Screen name="planner" options={{ title: 'Planner' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 10,
  },
  shelf: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1.5,
  },
  tab: {
    width: 92,
    paddingTop: 9,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    ...outline,
    borderBottomWidth: 0,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 16,
    ...shadow.card,
  },
  tabActive: {
    paddingTop: 15,
    transform: [{ rotate: '-1deg' }],
    ...shadow.pop,
  },
  tabLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 9.5,
    letterSpacing: 1,
  },
});
