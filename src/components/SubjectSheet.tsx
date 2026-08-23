import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon, type IconName } from '@/components/Icon';
import type { Deck } from '@/lib/types';
import { colors, font, radius, subjectPalette } from '@/theme/tokens';

interface Props {
  visible: boolean;
  subject: Deck | null;
  onClose: () => void;
  onSave: (deckId: string, color: string | null, icon: string | null) => void;
  onDelete: (deckId: string) => void;
}

/**
 * Every glyph in the set, subject-flavoured ones first — the student
 * asked for the whole box of stickers, not a curated few.
 */
const ICON_CHOICES: IconName[] = [
  'book', 'flask', 'leaf', 'globe', 'calculator', 'museum', 'palette', 'note',
  'monitor', 'paw', 'flag', 'car', 'flower', 'burst', 'smartphone', 'gamepad',
  'dice', 'clapper', 'tv', 'bulb', 'star', 'heart', 'trophy', 'bolt',
  'flame', 'flameSmall', 'flameBig', 'flameCrown', 'spark', 'sprout', 'plane',
  'clock', 'calendar', 'bell', 'pencil', 'question', 'check', 'cross',
  'cards', 'chart', 'download', 'play', 'alert',
];

export function SubjectSheet({ visible, subject, onClose, onSave, onDelete }: Props) {
  const [color, setColor] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Load the subject's current look each time the sheet opens.
  useEffect(() => {
    if (visible && subject) {
      setColor(subject.color);
      setIcon(subject.icon);
      setConfirmingDelete(false);
    }
  }, [visible, subject]);

  if (!subject) return null;

  const previewWash = color ?? colors.surface2;
  const previewIcon = (icon as IconName | null) ?? 'book';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={[styles.preview, { backgroundColor: previewWash }]}>
              <Icon name={previewIcon} size={26} color={colors.ink} fill={colors.surface} strokeWidth={1.9} />
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {subject.name}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Colour</Text>
            <View style={styles.swatches}>
              {subjectPalette.map((tone) => {
                const active = tone.wash === color;
                return (
                  <Pressable
                    key={tone.wash}
                    onPress={() => setColor(active ? null : tone.wash)}
                    style={[
                      styles.swatch,
                      { backgroundColor: tone.wash },
                      active && styles.swatchActive,
                    ]}>
                    {active ? (
                      <Icon name="check" size={15} color={tone.ink} strokeWidth={2.8} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Icon</Text>
            <View style={styles.iconGrid}>
              {ICON_CHOICES.map((name) => {
                const active = name === icon;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setIcon(active ? null : name)}
                    style={[styles.iconCell, active && styles.iconCellActive]}>
                    <Icon
                      name={name}
                      size={22}
                      color={colors.ink}
                      fill={active ? (color ?? colors.accentWash) : colors.surface2}
                      strokeWidth={1.9}
                    />
                  </Pressable>
                );
              })}
            </View>

            <ChunkyButton
              label="Save look"
              size="lg"
              onPress={() => onSave(subject.id, color, icon)}
              style={styles.saveBtn}
            />

            <Pressable onPress={() => setConfirmingDelete(true)} style={styles.deleteRow}>
              <Icon name="trash" size={17} color={colors.coral} strokeWidth={1.9} />
              <Text style={styles.deleteText}>Delete this subject</Text>
            </Pressable>
          </ScrollView>

          <ConfirmModal
            visible={confirmingDelete}
            title="Delete this subject?"
            message={`"${subject.name}" and all its questions will be removed. This can't be undone.`}
            confirmLabel="Delete"
            destructive
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={() => {
              setConfirmingDelete(false);
              onDelete(subject.id);
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 30,
    maxHeight: '86%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  preview: {
    width: 46,
    height: 46,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  title: {
    flex: 1,
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
  },
  label: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 22,
    marginBottom: 10,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellActive: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  saveBtn: {
    marginTop: 26,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 16,
    marginTop: 6,
  },
  deleteText: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.coral,
  },
});
