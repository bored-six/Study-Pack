import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import type { ModeSpec } from '@/lib/mode';
import { playSfx } from '@/lib/sfx';
import { font, getColors, useThemeStore } from '@/theme/tokens';

/**
 * Loading the cartridge.
 *
 * Picking a game used to be the strongest idea in the app and the shortest
 * lived: you chose a cartridge off a shelf and the next screen simply
 * appeared, sliding in from the right like every other screen in the
 * project. The metaphor stopped being a metaphor at the exact moment you
 * committed to it.
 *
 * So the cartridge goes in. It drops into a slot, the slot bites, and the
 * mode's own colour floods the screen and wipes away onto whatever comes
 * next — the build form, or the first question. Three beats, about
 * three-quarters of a second, which is roughly how long a real one takes.
 */

/** Total run time. Long enough to read as an action, short enough to sit through daily. */
const DROP_MS = 240;
const BITE_MS = 150;
const FLOOD_MS = 260;
/** A beat at full cover, so the swap underneath is never glimpsed. */
const HOLD_MS = 90;
const WIPE_MS = 230;
export const LOAD_MS = DROP_MS + BITE_MS + FLOOD_MS + HOLD_MS + WIPE_MS;

interface Props {
  spec: ModeSpec;
  /** Called once the screen is fully covered — swap the content here. */
  onCovered: () => void;
  /** Called when the wipe is done and the overlay can come off. */
  onDone: () => void;
}

export function CartridgeLoad({ spec, onCovered, onDone }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const reduced = useReducedMotion();

  /** 0 held above the slot, 1 seated in it. */
  const drop = useSharedValue(0);
  /** The slot biting down on the cartridge. */
  const bite = useSharedValue(0);
  /** 0 clear, 1 the mode's colour over everything. */
  const flood = useSharedValue(0);
  /** Fades the cartridge out once it is under the flood. */
  const cartOut = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      // No theatre, but the same contract: cover, swap, uncover.
      onCovered();
      onDone();
      return;
    }

    playSfx('cartridge_click');

    // The animation is the picture; these timers are the contract. Driving
    // the handover off an animation callback meant a dropped frame or a
    // backgrounded app could strand someone on a dimmed screen forever.
    drop.value = withTiming(1, { duration: DROP_MS, easing: Easing.in(Easing.quad) });
    bite.value = withDelay(
      DROP_MS,
      withSequence(
        withTiming(1, { duration: BITE_MS / 2 }),
        withTiming(0, { duration: BITE_MS / 2 })
      )
    );
    flood.value = withDelay(
      DROP_MS + BITE_MS,
      withTiming(1, { duration: FLOOD_MS, easing: Easing.out(Easing.cubic) })
    );

    const covered = setTimeout(() => {
      // Fully covered: swap what is underneath while nobody can see it,
      // then let the colour recede onto whatever arrived.
      onCovered();
      cartOut.value = withTiming(1, { duration: 90 });
      flood.value = withDelay(
        HOLD_MS,
        withTiming(0, { duration: WIPE_MS, easing: Easing.in(Easing.cubic) })
      );
    }, DROP_MS + BITE_MS + FLOOD_MS);

    const done = setTimeout(onDone, LOAD_MS);
    return () => {
      clearTimeout(covered);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const cartStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -120 + drop.value * 120 },
      { scale: 1 - bite.value * 0.06 },
      { rotate: `${(1 - drop.value) * -6}deg` },
    ],
    opacity: (0.25 + drop.value * 0.75) * (1 - cartOut.value),
  }));

  const slotStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 - bite.value * 0.35 }],
    opacity: 1 - cartOut.value,
  }));

  // Grows to cover, then shrinks away — the colour arrives and recedes.
  const floodStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, flood.value * 1.6),
    transform: [{ scale: 0.6 + flood.value * 2.4 }],
  }));

  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - cartOut.value }));

  return (
    <View style={styles.fill} pointerEvents="none" accessibilityElementsHidden>
      <Animated.View style={[styles.dim, dimStyle]} />

      <View style={styles.centre}>
        <Animated.View style={[styles.cart, { backgroundColor: spec.wash }, cartStyle]}>
          <View style={[styles.grooves, { backgroundColor: spec.edge }]} />
          <Icon name={spec.icon} size={34} color={spec.ink} fill="#FFFFFF" strokeWidth={1.9} />
          <Text style={styles.cartName} numberOfLines={1}>
            {spec.name}
          </Text>
        </Animated.View>

        {/* The slot it goes into. */}
        <Animated.View style={[styles.slot, { borderColor: spec.edge }, slotStyle]}>
          <View style={[styles.slotMouth, { backgroundColor: spec.edge }]} />
        </Animated.View>
      </View>

      {/* The mode's colour, arriving. */}
      <Animated.View
        style={[styles.flood, { backgroundColor: spec.wash }, floodStyle]}
      />
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    fill: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 90,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(39, 54, 43, 0.45)',
    },
    centre: {
      alignItems: 'center',
    },
    cart: {
      width: 152,
      borderWidth: 2,
      borderColor: colors.ink,
      borderTopLeftRadius: 15,
      borderTopRightRadius: 15,
      borderBottomLeftRadius: 6,
      borderBottomRightRadius: 6,
      paddingTop: 16,
      paddingBottom: 13,
      paddingHorizontal: 10,
      alignItems: 'center',
      gap: 5,
    },
    grooves: {
      position: 'absolute',
      top: 5,
      left: 20,
      right: 20,
      height: 4,
      borderRadius: 2,
      opacity: 0.4,
    },
    cartName: {
      fontFamily: font.hero,
      fontSize: 17,
      lineHeight: 20,
      color: '#1A211C',
      textAlign: 'center',
    },
    slot: {
      width: 176,
      height: 26,
      marginTop: -4,
      borderWidth: 2,
      borderRadius: 8,
      backgroundColor: colors.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slotMouth: {
      width: 150,
      height: 7,
      borderRadius: 4,
      opacity: 0.55,
    },
    flood: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 260,
    },
  });
