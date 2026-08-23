import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ExamFormat } from '@/lib/exam';
import { colors, outline, radius, shadow } from '@/theme/tokens';

interface Props {
  format: ExamFormat;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const RULE = 'rgba(46, 111, 163, 0.09)';
const MARGIN = 'rgba(194, 78, 56, 0.14)';
const GRID = 'rgba(46, 111, 163, 0.07)';

/** Which paper each format is written on. The page IS the format. */
type Paper = 'ruled' | 'index' | 'graph' | 'checklist';

const PAPER: Record<ExamFormat, Paper> = {
  multiple_choice: 'ruled',
  true_false: 'index',
  modified_true_false: 'index',
  identification: 'index',
  fill_blank: 'ruled',
  matching: 'graph',
  enumeration: 'checklist',
};

function Ruled() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 24 }, (_, i) => (
        <View key={i} style={[styles.hLine, { top: 40 + i * 28, backgroundColor: RULE }]} />
      ))}
      <View style={[styles.vLine, { left: 26, backgroundColor: MARGIN, width: 1.5 }]} />
    </View>
  );
}

function IndexCard() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.hLine, { top: 40, height: 2, backgroundColor: MARGIN }]} />
      {Array.from({ length: 22 }, (_, i) => (
        <View key={i} style={[styles.hLine, { top: 72 + i * 28, backgroundColor: RULE }]} />
      ))}
    </View>
  );
}

function Graph() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 30 }, (_, i) => (
        <View key={`h${i}`} style={[styles.hLine, { top: i * 24, backgroundColor: GRID }]} />
      ))}
      {Array.from({ length: 20 }, (_, i) => (
        <View key={`v${i}`} style={[styles.vLine, { left: i * 24, backgroundColor: GRID }]} />
      ))}
    </View>
  );
}

function Checklist() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Torn-off top edge: a row of little teeth. */}
      <View style={styles.teeth}>
        {Array.from({ length: 16 }, (_, i) => (
          <View key={i} style={styles.tooth} />
        ))}
      </View>
      {Array.from({ length: 22 }, (_, i) => (
        <View key={i} style={[styles.hLine, { top: 56 + i * 30, backgroundColor: RULE }]} />
      ))}
      <View style={[styles.vLine, { left: 34, backgroundColor: MARGIN, width: 1.5 }]} />
    </View>
  );
}

const DECOR: Record<Paper, () => React.JSX.Element> = {
  ruled: Ruled,
  index: IndexCard,
  graph: Graph,
  checklist: Checklist,
};

/**
 * The exam stage: the current question sits on the top sheet of a paper
 * pile, its paper style matching the format — ruled for choices, an index
 * card for identification, graph paper for matching, a torn checklist
 * strip for enumeration. A dog-eared corner marks it as the working page.
 */
export function ExamSheet({ format, children, style }: Props) {
  const Decor = DECOR[PAPER[format]];

  return (
    <View style={style}>
      {/* The pile underneath — pages still to come. */}
      <View style={[styles.under, styles.underDeep]} />
      <View style={[styles.under, styles.underNear]} />

      <View style={styles.sheet}>
        <Decor />
        <View style={styles.content}>{children}</View>
        {/* Dog-eared corner: the page you're on. */}
        <View style={styles.dogEar} />
        <View style={styles.dogEarShade} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  under: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 6,
    bottom: -4,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.card,
  },
  underDeep: {
    transform: [{ rotate: '1.6deg' }],
    bottom: -8,
    opacity: 0.55,
  },
  underNear: {
    transform: [{ rotate: '-1.1deg' }],
  },
  sheet: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...shadow.card,
  },
  content: {
    padding: 14,
  },
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  vLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  teeth: {
    position: 'absolute',
    top: -5,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  tooth: {
    width: 10,
    height: 10,
    backgroundColor: colors.bg,
    transform: [{ rotate: '45deg' }],
  },
  dogEar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderRightWidth: 22,
    borderTopWidth: 22,
    borderRightColor: colors.bg,
    borderTopColor: 'transparent',
  },
  dogEarShade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 22,
    borderBottomWidth: 22,
    borderBottomColor: colors.surface2,
    borderLeftColor: 'transparent',
  },
});
