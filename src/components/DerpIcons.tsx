import React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';
import { colors } from '@/theme/tokens';

export function DerpCheck({ checked, ...props }: SvgProps & { checked?: boolean }) {
  return (
    <Svg viewBox="0 0 40 40" {...props}>
      {/* Wobbly hand-drawn box */}
      <Path
        d="M10,8 Q20,6 30,10 Q34,20 28,30 Q15,34 8,28 Q4,18 10,8 Z"
        fill="none"
        stroke={colors.ink}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={checked ? undefined : '4'}
      />
      {/* Giant marker check */}
      {checked && (
        <Path
          d="M4,20 L16,32 L38,2"
          fill="none"
          stroke={colors.coral}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

export function DerpPlus(props: SvgProps) {
  return (
    <Svg viewBox="0 0 48 48" {...props}>
      {/* Wobbly blob background */}
      <Path
        d="M24,10 C36,8 40,18 38,28 C36,40 24,42 14,38 C4,34 8,20 12,14 C16,8 20,12 24,10 Z"
        fill={colors.accentWash}
        stroke={colors.accentDeep}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Hand-drawn plus */}
      <Path
        d="M25,14 Q23,24 26,34 M14,24 Q24,25 34,23"
        fill="none"
        stroke={colors.ink}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function DerpMinus(props: SvgProps) {
  return (
    <Svg viewBox="0 0 48 48" {...props}>
      {/* Wobbly blob background */}
      <Path
        d="M10,24 C10,12 18,8 28,10 C40,12 42,20 38,32 C34,44 20,42 12,38 C6,32 10,30 10,24 Z"
        fill={colors.accentWash}
        stroke={colors.accentDeep}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Hand-drawn minus */}
      <Path
        d="M16,25 Q24,23 32,26"
        fill="none"
        stroke={colors.ink}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function DerpScribbleLine(props: SvgProps) {
  return (
    <Svg viewBox="0 0 100 20" preserveAspectRatio="none" {...props}>
      <Path
        d="M 0,10 Q 20,0 40,15 T 70,5 T 100,12 M 10,16 Q 50,18 90,8"
        fill="none"
        stroke={colors.gold}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function DerpArrow(props: SvgProps) {
  return (
    <Svg viewBox="0 0 24 24" {...props}>
      {/* Hand-drawn arrow */}
      <Path
        d="M20,12 Q12,11 4,12 M10,6 Q5,10 4,12 Q7,15 10,18"
        fill="none"
        stroke={colors.ink}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
