import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';

type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  message: string;
  severity?: ToastSeverity;
  duration?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const severityColors: Record<ToastSeverity, { bg: string; text: string; icon: string }> = {
  success: { bg: '#4CAF50', text: '#fff', icon: '✓' },
  error: { bg: '#f44336', text: '#fff', icon: '✕' },
  info: { bg: '#2196F3', text: '#fff', icon: 'ℹ' },
  warning: { bg: '#FF9800', text: '#fff', icon: '⚠' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<ToastSeverity>('info');
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const showToast = useCallback((options: ToastOptions) => {
    const { message: msg, severity: sev = 'info', duration = 2500 } = options;

    // Clear any existing timeout
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
    }

    setMessage(msg);
    setSeverity(sev);
    setVisible(true);

    // Animate in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Schedule hide
    hideTimeout.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVisible(false);
      });
    }, duration);
  }, [translateY, opacity]);

  const colorScheme = severityColors[severity];

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {visible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              top: insets.top + 10,
              transform: [{ translateY }],
              opacity,
              backgroundColor: colorScheme.bg,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.toastIcon, { color: colorScheme.text }]}>
            {colorScheme.icon}
          </Text>
          <Text style={[styles.toastMessage, { color: colorScheme.text }]}>
            {message}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      },
    }),
  },
  toastIcon: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 10,
  },
  toastMessage: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
