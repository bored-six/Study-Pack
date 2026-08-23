import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * Notebook furniture: faint ruled paper, washi tape strips, and squiggly
 * pen underlines. All decoration — everything here is pointerEvents:none
 * and deliberately faint so the page feels like paper, not a pattern.
 */

const RULE_SPACING = 30;
const RULE_COUNT = 40;

/** Faint blue ruling + red margin line. Put first inside a screen View. */
export function RuledPaper() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: RULE_COUNT }, (_, i) => (
        <View key={i} style={[styles.rule, { top: 74 + i * RULE_SPACING }]} />
      ))}
      <View style={styles.margin} />
    </View>
  );
}

interface TapeProps {
  rotate?: string;
  style?: StyleProp<ViewStyle>;
}

/** A translucent washi-tape strip. Position it over a card's top edge. */
export function Tape({ rotate = '-4deg', style }: TapeProps) {
  return (
    <View
      pointerEvents="none"
      style={[styles.tape, { transform: [{ rotate }] }, style]}
    />
  );
}

interface SquiggleProps {
  width?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** A hand-drawn wavy underline, like a pen stroke under a heading. */
export function Squiggle({ width = 108, color = colors.accent, style }: SquiggleProps) {
  return (
    <Svg width={width} height={10} viewBox="0 0 108 10" style={style}>
      <Path
        d="M3 6 Q 11 1 19 6 T 35 6 T 51 6 T 67 6 T 83 6 T 99 6 L 105 5"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  rule: {
    position: 'absolute',
    left: -16,
    right: -16,
    height: 1,
    backgroundColor: 'rgba(46, 111, 163, 0.09)',
  },
  margin: {
    position: 'absolute',
    left: 8,
    top: -16,
    bottom: -16,
    width: 1.5,
    backgroundColor: 'rgba(194, 78, 56, 0.13)',
  },
  tape: {
    position: 'absolute',
    top: -9,
    alignSelf: 'center',
    width: 58,
    height: 20,
    borderRadius: 3,
    backgroundColor: 'rgba(252, 235, 192, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(39, 54, 43, 0.08)',
  },
});
