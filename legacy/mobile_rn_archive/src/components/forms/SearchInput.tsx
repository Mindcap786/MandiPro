/**
 * SearchInput — Debounced search field with clear button.
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { palette, spacing, radius, fontSize } from '@/theme';

interface SearchInputProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  debounceMs?: number;
}

export function SearchInput({
  placeholder = 'Search...',
  value,
  onChangeText,
  debounceMs = 300,
}: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleChange = useCallback(
    (text: string) => {
      setLocal(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onChangeText(text), debounceMs);
    },
    [onChangeText, debounceMs]
  );

  const handleClear = () => {
    setLocal('');
    onChangeText('');
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.icon}>{'\u{1F50D}'}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={palette.gray400}
        value={local}
        onChangeText={handleChange}
        returnKeyType="search"
      />
      {local.length > 0 && (
        <TouchableOpacity onPress={handleClear} hitSlop={8}>
          <Text style={styles.clear}>{'\u2715'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.gray100,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  icon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: palette.gray900,
    paddingVertical: spacing.sm,
  },
  clear: {
    fontSize: 14,
    color: palette.gray500,
    padding: spacing.xs,
  },
});
