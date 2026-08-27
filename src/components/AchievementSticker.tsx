import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import type { AchievementFamily } from '@/lib/achievements';
import { font, getColors } from '@/theme/tokens';

/**
 * One sticker in the album.
 *
 * Each family wears its own shape — a wax seal for the tally, a rosette
 * ribbon for the fire, a shield for what you know, a luggage tag for
 * promises, a heart for the character ones. Shape carries the family so
 * a filled album can be read across the room.
 *
 * Locked stickers are the pressed outline of that shape and nothing
 * else: no title, no requirement, no progress. They give away which
 * shelf a sticker belongs to and never how to earn it.
 */

const SHAPES: Record<AchievementFamily, string> = {
  // scalloped wax seal
  tally:
    'M32 5 38 9.5 45.4 8.6 48.2 15.5 55 18.3 54.1 25.7 58.6 31.7 54.1 37.7 55 45.1 48.2 47.9 45.4 54.8 38 53.9 32 58.4 26 53.9 18.6 54.8 15.8 47.9 9 45.1 9.9 37.7 5.4 31.7 9.9 25.7 9 18.3 15.8 15.5 18.6 8.6 26 9.5z',
  // rosette medal with tails
  fire: 'M18 6h28v30l-14-8-14 8z',
  // shield
  knowledge: 'M32 5 54 12v20c0 14-11 22-22 27-11-5-22-13-22-27V12z',
  // luggage tag
  promises: 'M14 12h26l12 14-12 22H14z',
  // heart
  character:
    'M32 54C16 42 8 34 8 24.5 8 16.5 14 11 21 11c4.6 0 8.6 2.4 11 6 2.4-3.6 6.4-6 11-6 7 0 13 5.5 13 13.5C56 34 48 42 32 54z',
};

/** The tails under the fire family's medal, drawn only for that shape. */
const FIRE_TAILS = 'M22 36 18 56l14-7 14 7-4-20';

const WASH: Record<AchievementFamily, { fill: string; edge: string }> = {
  tally: { fill: '#FCEBC0', edge: '#AC761C' },
  fire: { fill: '#FBD5CC', edge: '#C24E38' },
  knowledge: { fill: '#DDF3DC', edge: '#2C8A4A' },
  promises: { fill: '#DBEEFB', edge: '#2E6FA3' },
  character: { fill: '#EAE2FA', edge: '#6C51A8' },
};

/** Where the icon sits inside each shape, so it looks centred by eye. */
const ICON_OFFSET: Record<AchievementFamily, number> = {
  tally: 0,
  fire: -8,
  knowledge: -2,
  promises: 0,
  character: -3,
};

interface Props {
  family: AchievementFamily;
  /** Undefined renders the locked ghost. */
  icon?: React.ComponentProps<typeof Icon>['name'];
  size?: number;
  isDark?: boolean;
}

export function AchievementSticker({ family, icon, size = 64, isDark = false }: Props) {
  const colors = getColors(isDark);
  const wash = WASH[family];
  const locked = icon == null;
  const scale = size / 64;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {family === 'fire' && !locked ? (
          <Path
            d={FIRE_TAILS}
            fill="#F7CFD3"
            stroke={colors.ink}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
        ) : null}
        {family === 'fire' && locked ? (
          <Path
            d={FIRE_TAILS}
            fill="none"
            stroke={colors.textFaint}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeDasharray="4 3.5"
            opacity={0.75}
          />
        ) : null}

        <Path
          d={SHAPES[family]}
          fill={locked ? 'none' : wash.fill}
          stroke={locked ? colors.textFaint : colors.ink}
          strokeWidth={locked ? 2 : 2.4}
          strokeLinejoin="round"
          strokeDasharray={locked ? '4 3.5' : undefined}
          opacity={locked ? 0.75 : 1}
        />

        {locked ? (
          <SvgText
            x={32}
            y={family === 'fire' ? 28 : 39}
            textAnchor="middle"
            fontSize={20}
            fontFamily={font.hero}
            fill={colors.textFaint}
            opacity={0.9}>
            ?
          </SvgText>
        ) : family === 'tally' ? (
          <Circle cx={32} cy={31.7} r={13.5} fill="#FFF6DC" stroke={wash.edge} strokeWidth={1.8} />
        ) : family === 'fire' ? (
          <Circle cx={32} cy={20} r={9} fill="#FFF6DC" stroke={wash.edge} strokeWidth={1.8} />
        ) : null}
      </Svg>

      {!locked ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.iconLayer,
            { transform: [{ translateY: ICON_OFFSET[family] * scale }] },
          ]}>
          <Icon name={icon} size={Math.round(size * 0.4)} color={wash.edge} strokeWidth={2} />
        </View>
      ) : null}
    </View>
  );
}

/** A sticker plus its title, as it appears on an album shelf. */
export function AlbumSlot({
  family,
  icon,
  title,
  size = 56,
  isDark = false,
}: Props & { title?: string }) {
  const colors = getColors(isDark);
  return (
    <View style={styles.slot}>
      <AchievementSticker family={family} icon={icon} size={size} isDark={isDark} />
      {title ? (
        <Text style={[styles.slotTitle, { color: colors.textDim }]} numberOfLines={2}>
          {title}
        </Text>
      ) : (
        <Text style={[styles.slotTitle, { color: 'transparent' }]} numberOfLines={2}>
          {' '}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    alignItems: 'center',
    gap: 3,
  },
  slotTitle: {
    fontFamily: font.bodyBold,
    fontSize: 8.5,
    lineHeight: 10.5,
    textAlign: 'center',
  },
});
