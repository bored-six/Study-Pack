import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PenCircle } from '@/components/penmarks';
import { colors, font } from '@/theme/tokens';

/**
 * A word with a red pen circle drawn around it — the teacher's mark for
 * "this one". Measures itself so the ellipse fits any word.
 */
export function CircledWord({ word }: { word: string }) {
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

const styles = StyleSheet.create({
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
