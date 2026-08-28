import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PenCircle } from '@/components/penmarks';
import { font, getColors, useThemeStore } from '@/theme/tokens';

/**
 * A word with a red pen circle drawn around it — the teacher's mark for
 * "this one". Measures itself so the ellipse fits any word.
 */
export function CircledWord({ word }: { word: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <View
      style={styles.wrap}
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }>
      <Text style={styles.word}>{word}</Text>
      {size ? <PenCircle width={size.w} height={size.h} /> : null}
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  word: {
    fontFamily: font.heading,
    fontSize: 17,
    lineHeight: 24,
    color: colors.coral,
  },
});
