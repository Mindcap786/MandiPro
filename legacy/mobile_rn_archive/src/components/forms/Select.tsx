/**
 * Select — Dropdown picker with label/error support.
 * Uses a modal bottom sheet on press.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, radius, fontSize } from '@/theme';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  containerStyle?: ViewStyle;
}

export function Select({
  label,
  placeholder = 'Select...',
  options,
  value,
  onChange,
  error,
  required,
  containerStyle,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.trigger, error ? styles.triggerError : undefined]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={selected ? styles.valueText : styles.placeholderText}>
          {selected?.label ?? placeholder}
        </Text>
        <Text style={styles.chevron}>{'\u25BE'}</Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={open} transparent animationType="slide">
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{label ?? 'Select'}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.option,
                  item.value === value && styles.optionSelected,
                ]}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    item.value === value && styles.optionTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: palette.gray700,
    marginBottom: spacing.xs,
  },
  required: {
    color: palette.error,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: palette.gray300,
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.white,
  },
  triggerError: {
    borderColor: palette.error,
  },
  valueText: {
    fontSize: fontSize.md,
    color: palette.gray900,
    flex: 1,
  },
  placeholderText: {
    fontSize: fontSize.md,
    color: palette.gray400,
    flex: 1,
  },
  chevron: {
    fontSize: fontSize.md,
    color: palette.gray400,
  },
  error: {
    fontSize: fontSize.xs,
    color: palette.error,
    marginTop: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: palette.backdrop,
  },
  sheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    maxHeight: '60%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.gray300,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.gray900,
    marginBottom: spacing.md,
  },
  option: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  optionSelected: {
    backgroundColor: palette.gray50,
  },
  optionText: {
    fontSize: fontSize.md,
    color: palette.gray800,
  },
  optionTextSelected: {
    color: palette.primary,
    fontWeight: '600',
  },
});
