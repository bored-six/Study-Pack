import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Tape } from '@/components/notebook';
import { Icon, type IconName } from '@/components/Icon';
import type { Deck } from '@/lib/types';
import { font, getColors, outline, radius, subjectPalette, useThemeStore } from '@/theme/tokens';

interface Props {
  visible: boolean;
  subject: Deck | null;
  onClose: () => void;
  onSave: (deckId: string, name: string, color: string | null, icon: string | null) => void;
  onDelete: (deckId: string) => void;
}

const NAME_MAX = 40;

/**
 * Every glyph in the set, sorted into shelves. The whole box of stickers is
 * still here — but a shelf at a time, so the sheet stays two or three rows
 * tall instead of a page you have to scroll past to reach Save.
 */
const ICON_SHELVES: { key: string; label: string; icons: IconName[] }[] = [
  {
    key: 'school',
    label: 'School',
    icons: [
      'book', 'note', 'pencil', 'calculator', 'flask', 'globe',
      'museum', 'monitor', 'chart', 'cards', 'question', 'apple', 'atom', 'planet'
    ],
  },
  {
    key: 'nature',
    label: 'Nature',
    icons: [
      'leaf', 'sprout', 'flower', 'paw', 'star', 'spark',
      'burst', 'flame', 'flameSmall', 'flameBig', 'flameCrown', 'heart', 'cat'
    ],
  },
  {
    key: 'fun',
    label: 'Fun',
    icons: [
      'palette', 'gamepad', 'dice', 'clapper', 'tv', 'trophy',
      'smartphone', 'car', 'plane', 'flag', 'bolt', 'ghost', 'music'
    ],
  },
  {
    key: 'day',
    label: 'Day',
    icons: [
      'clock', 'calendar', 'bell', 'bulb', 'check',
      'cross', 'play', 'download', 'alert', 'plus', 'trash', 'derpBrain'
    ],
  },
];

/** The shelf an icon lives on, so the picker opens where the current one is. */
function shelfFor(icon: string | null): string {
  if (!icon) return ICON_SHELVES[0].key;
  return (
    ICON_SHELVES.find((shelf) => shelf.icons.includes(icon as IconName))?.key ??
    ICON_SHELVES[0].key
  );
}

export function SubjectSheet({ visible, subject, onClose, onSave, onDelete }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [shelf, setShelf] = useState(ICON_SHELVES[0].key);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Load the subject's current name and look each time the sheet opens.
  useEffect(() => {
    if (visible && subject) {
      setName(subject.name);
      setColor(subject.color);
      setIcon(subject.icon);
      setShelf(shelfFor(subject.icon));
      setConfirmingDelete(false);
    }
  }, [visible, subject]);

  const shownIcons = useMemo(
    () => ICON_SHELVES.find((s) => s.key === shelf)?.icons ?? [],
    [shelf]
  );

  if (!subject) return null;

  const trimmed = name.trim();
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.lift}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Tape style={styles.sheetTape} />
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={[styles.preview, { backgroundColor: previewWash }]}>
                <Icon name={previewIcon} size={26} color={colors.ink} fill={colors.surface} strokeWidth={1.9} />
              </View>
              {/* The title doubles as the rename field — tap it and type. */}
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Subject name"
                placeholderTextColor={colors.textFaint}
                style={styles.nameInput}
                maxLength={NAME_MAX}
                selectTextOnFocus
                returnKeyType="done"
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                        <Icon name="check" size={14} color={tone.ink} strokeWidth={2.8} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Icon</Text>
              <View style={styles.shelfRow}>
                {ICON_SHELVES.map((option) => {
                  const active = option.key === shelf;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setShelf(option.key)}
                      style={[styles.shelfChip, active && styles.shelfChipActive]}>
                      <Text style={[styles.shelfText, active && styles.shelfTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.iconGrid}>
                {shownIcons.map((glyph) => {
                  const active = glyph === icon;
                  return (
                    <Pressable
                      key={glyph}
                      onPress={() => setIcon(active ? null : glyph)}
                      style={[styles.iconCell, active && styles.iconCellActive]}>
                      <Icon
                        name={glyph}
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
                label="Save subject"
                size="lg"
                disabled={trimmed.length === 0}
                onPress={() => onSave(subject.id, trimmed, color, icon)}
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
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.3)',
  },
  lift: {
    flex: 1,
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
  sheetTape: {
    top: -9,
    zIndex: 1,
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
  nameInput: {
    flex: 1,
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 2,
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
    gap: 9,
  },
  swatch: {
    width: 38,
    height: 38,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 11,
    borderBottomLeftRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2deg' }],
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  shelfRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  shelfChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
  },
  shelfChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.ink,
  },
  shelfText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.textDim,
  },
  shelfTextActive: {
    color: colors.ink,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconCell: {
    width: 44,
    height: 44,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 17,
    borderBottomRightRadius: 13,
    borderBottomLeftRadius: 16,
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
