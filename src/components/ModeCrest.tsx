import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import type { ModeSpec } from '@/lib/mode';
import { font, getColors, onWash, radius, shadow, useThemeStore } from '@/theme/tokens';

/**
 * The mode's badge, wherever it has to appear.
 *
 * The picker shelf, the build form and the run header each drew the mode
 * their own way, which meant picking "Beat the clock" and then reading
 * "Build your exam!" on plain paper with no clock anywhere in sight. One
 * crest, three sizes, so the game you chose is on screen the whole way
 * through.
 */

/** The three dials a mode sets, in the words the picker uses. */
export interface ModeDial {
  on: boolean;
  icon: IconName;
  label: string;
  caption: string;
}

export function dialsOf(spec: ModeSpec): ModeDial[] {
  return [
    {
      on: spec.clock !== 'none',
      icon: (spec.clock === 'none' ? 'clockClassic' : 'clock') as IconName,
      label:
        spec.clock === 'none'
          ? 'No clock'
          : spec.clock === 'whole'
            ? 'Whole paper'
            : 'Per question',
      caption: 'CLOCK',
    },
    {
      on: spec.feedback === 'instant',
      icon: 'check' as IconName,
      label: spec.feedback === 'instant' ? 'Straight away' : 'At the end',
      caption: 'MARKS',
    },
    {
      on: spec.repetition !== 'once',
      icon: (spec.repetition === 'once' ? 'play' : 'spark') as IconName,
      label:
        spec.repetition === 'once'
          ? 'One pass'
          : spec.repetition === 'until_retired'
            ? 'Until retired'
            : 'Three lives',
      caption: 'REPEATS',
    },
  ];
}

type CrestSize = 'chip' | 'banner';

interface CrestProps {
  spec: ModeSpec;
  size?: CrestSize;
  /** A second line under the name — usually the subject. */
  detail?: string;
  /** Banner only: the three dials, spelled out under the name. */
  showDials?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ModeCrest({
  spec,
  size = 'chip',
  detail,
  showDials = false,
  style,
}: CrestProps) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const banner = size === 'banner';
  return (
    <View
      accessibilityLabel={`Mode: ${spec.name}`}
      style={[
        styles.crest,
        banner ? styles.crestBanner : styles.crestChip,
        { borderColor: spec.edge, backgroundColor: spec.wash },
        style,
      ]}>
      {/* The cartridge grooves, so it still reads as the thing you picked. */}
      {banner ? <View style={[styles.grooves, { backgroundColor: spec.edge }]} /> : null}

      <View style={[styles.badge, banner && styles.badgeBanner, { borderColor: spec.edge }]}>
        <Icon
          name={spec.icon}
          size={banner ? 24 : 16}
          color={spec.ink}
          fill="#FFFFFF"
          strokeWidth={1.9}
        />
      </View>

      <View style={styles.text}>
        <Text
          style={[styles.name, banner && styles.nameBanner, { color: spec.ink }]}
          numberOfLines={1}>
          {spec.name}
        </Text>
        {detail ? (
          <Text style={[styles.detail, banner && styles.detailBanner]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
        {showDials ? (
          <View style={styles.dialRow}>
            {dialsOf(spec).map((dial, i) => (
              <View
                key={i}
                style={[
                  styles.dial,
                  { borderColor: spec.edge },
                  !dial.on && styles.dialOff,
                ]}>
                <Icon name={dial.icon} size={11} color={spec.ink} strokeWidth={2} />
                <Text style={[styles.dialText, { color: spec.ink }]} numberOfLines={1}>
                  {dial.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The mode's rubber stamp. Sits in a corner of the stage so a screenshot
 * of a question says which game it came out of.
 */
export function ModeStamp({
  spec,
  style,
}: {
  spec: ModeSpec;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      pointerEvents="none"
      style={[stampStyles.stamp, { borderColor: spec.ink }, style]}>
      <Text style={[stampStyles.text, { color: spec.ink }]}>{spec.stamp}</Text>
    </View>
  );
}

const stampStyles = StyleSheet.create({
  stamp: {
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    opacity: 0.45,
    transform: [{ rotate: '-8deg' }],
  },
  text: {
    fontFamily: font.bodyHeavy,
    fontSize: 8.5,
    letterSpacing: 1.1,
  },
});

const getStyles = (colors: any) =>
  StyleSheet.create({
    crest: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      ...shadow.card,
    },
    crestChip: {
      gap: 7,
      borderRadius: radius.pill,
      paddingLeft: 5,
      paddingRight: 12,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    crestBanner: {
      gap: 11,
      borderRadius: 16,
      padding: 11,
      paddingTop: 13,
      alignItems: 'flex-start',
    },
    grooves: {
      position: 'absolute',
      top: 4,
      left: 16,
      right: 16,
      height: 3,
      borderRadius: 2,
      opacity: 0.35,
    },
    badge: {
      width: 28,
      height: 28,
      borderRadius: 10,
      borderWidth: 1.5,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeBanner: {
      width: 42,
      height: 42,
      borderRadius: 14,
      transform: [{ rotate: '-3deg' }],
    },
    text: {
      flex: 1,
      gap: 1,
    },
    name: {
      fontFamily: font.heading,
      fontSize: 13,
    },
    nameBanner: {
      fontFamily: font.hero,
      fontSize: 21,
      lineHeight: 25,
    },
    detail: {
      fontFamily: font.bodySemibold,
      fontSize: 10.5,
      // the crest is painted with the mode's wash, so this leaves the theme
      color: onWash.dim,
    },
    detailBanner: {
      fontSize: 12,
    },
    dialRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
      marginTop: 6,
    },
    dial: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1.5,
      borderRadius: radius.pill,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    dialOff: {
      opacity: 0.5,
    },
    dialText: {
      fontFamily: font.bodyHeavy,
      fontSize: 9.5,
      letterSpacing: 0.2,
    },
  });
