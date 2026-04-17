/**
 * Avatar — User/entity display with initials fallback
 */

import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { palette, fontSize } from '@/theme';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
}

const sizeMap: Record<AvatarSize, number> = { sm: 32, md: 40, lg: 56 };

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ uri, name, size = 'md', style }: AvatarProps) {
  const dim = sizeMap[size];
  const textSize = dim * 0.4;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: palette.gray200 },
          style as any,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: dim, height: dim, borderRadius: dim / 2 },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize: textSize }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: palette.white,
    fontWeight: '600',
  },
});
