import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
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

interface ToastItem {
  id: number;
  message: string;
  severity: ToastSeverity;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// All toasts use gray color scheme
const severityColors: Record<ToastSeverity, { bg: string; text: string; icon: string }> = {
  success: { bg: '#666', text: '#fff', icon: '✓' },
  error: { bg: '#666', text: '#fff', icon: '✕' },
  info: { bg: '#666', text: '#fff', icon: 'ℹ' },
  warning: { bg: '#666', text: '#fff', icon: '⚠' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();

  const showToast = useCallback((options: ToastOptions) => {
    const { message: msg, severity: sev = 'info', duration = 1500 } = options;
    const id = nextId.current++;
    
    setToasts(prev => [...prev, { id, message: msg, severity: sev }]);
    
    // Auto remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={[styles.toastWrapper, { top: insets.top + 10 }]} pointerEvents="none">
        {toasts.map((toast, index) => (
          <ToastItem key={toast.id} toast={toast} index={index} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, index }: { toast: ToastItem; index: number }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const colorScheme = severityColors[toast.severity];

  useEffect(() => {
    // Faster animation - slide in quickly
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: colorScheme.bg,
          marginBottom: index > 0 ? 8 : 0,
        },
      ]}
    >
      <Text style={[styles.toastIcon, { color: colorScheme.text }]}>
        {colorScheme.icon}
      </Text>
      <Text style={[styles.toastMessage, { color: colorScheme.text }]}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
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
