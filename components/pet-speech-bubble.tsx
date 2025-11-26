import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients } from '../constants/theme';

interface PetSpeechBubbleProps {
  text: string;
  visible?: boolean;
  style?: ViewStyle;
}

export function PetSpeechBubble({ text, visible = true, style }: PetSpeechBubbleProps) {
  if (!visible || !text) return null;

  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={Gradients.primary.colors}
        start={Gradients.primary.start}
        end={Gradients.primary.end}
        style={styles.bubble}
      >
        <Text style={styles.text}>{text}</Text>
      </LinearGradient>
      <View style={styles.pointer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    marginBottom: 16,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    lineHeight: 20,
  },
  pointer: {
    position: 'absolute',
    bottom: -8,
    left: 16,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(124, 58, 237, 0.8)', // Match start of primary gradient
  },
});
