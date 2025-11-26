import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/theme';
import { getUserPets, switchPet, type UserPet, type PetState } from '../src/services/pet';
import { useToast } from '../src/providers/ToastProvider';
import { useRateLimit } from '../src/hooks/useRateLimit';

interface FlippablePetCardProps {
  petState: PetState | null;
  activePet: UserPet | null;
  size?: 'small' | 'large';
  onPetChanged?: () => void;
  onInteract?: (action: 'pet' | 'hit') => void | Promise<void>;
}

export default function FlippablePetCard({ 
  petState, 
  activePet, 
  size = 'small',
  onPetChanged,
  onInteract
}: FlippablePetCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [userPets, setUserPets] = useState<UserPet[]>([]);
  const [loading, setLoading] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  
  // Toast and rate limiting
  const { showToast } = useToast();
  const { tryCall, getRemainingTime } = useRateLimit();
  const lastToastTime = useRef<number>(0);
  
  // Animation refs for pet movement
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const interactionInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (interactionInterval.current) {
        clearInterval(interactionInterval.current);
      }
    };
  }, []);

  const isLarge = size === 'large';
  const petSize = isLarge ? 130 : 90;
  const cardHeight = isLarge ? 260 : 200;

  // Pet animation (happy bounce + scale)
  const playPetAnimation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.15,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -15,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  // Hit animation (shake)
  const playHitAnimation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Gesture handlers for pet avatar interaction
  const handlePetInteraction = useCallback((action: 'pet' | 'hit') => {
    if (!onInteract) return;
    
    if (interacting) return;

    // Rate limiting check: 5 interactions per 3 seconds, 1s cooldown between each
    if (!tryCall()) {
      const now = Date.now();
      // Throttle toast to once every 2 seconds to prevent explosion
      if (now - lastToastTime.current > 2000) {
        const remainingSeconds = Math.ceil(getRemainingTime() / 1000);
        showToast({ 
          message: `Too many interactions! Wait ${remainingSeconds}s...`, 
          severity: 'warning' 
        });
        lastToastTime.current = now;
      }
      return;
    }
    
    setInteracting(true);
    
    if (action === 'pet') {
      playPetAnimation();
    } else {
      playHitAnimation();
    }
    
    // Call onInteract and handle the promise
    Promise.resolve(onInteract(action)).finally(() => {
      // Short cooldown before allowing next interaction
      setTimeout(() => setInteracting(false), 300);
    });
  }, [interacting, onInteract, tryCall, showToast]);

  const stopContinuousInteraction = useCallback(() => {
    if (interactionInterval.current) {
      clearInterval(interactionInterval.current);
      interactionInterval.current = null;
    }
  }, []);

  const startContinuousInteraction = useCallback(() => {
    // Trigger immediately (at start of continuous hold)
    handlePetInteraction('pet');
    
    // Then trigger every 1.5s
    stopContinuousInteraction();
    interactionInterval.current = setInterval(() => {
      handlePetInteraction('pet');
    }, 1000);
  }, [handlePetInteraction, stopContinuousInteraction]);

  // Tap gesture - quick tap = hit (negative interaction)
  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(handlePetInteraction)('hit');
    });

  // Pan gesture - rub left/right to pet (positive interaction) - relaxed for easier triggering
  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((event) => {
      // Trigger on any small horizontal movement
      if (Math.abs(event.translationX) > 10) {
        runOnJS(handlePetInteraction)('pet');
      }
    });

  // Long press gesture - pet/stroke (positive interaction)
  const longPressGesture = Gesture.LongPress()
    .minDuration(1500)
    .onStart(() => {
      runOnJS(startContinuousInteraction)();
    })
    .onFinalize(() => {
      runOnJS(stopContinuousInteraction)();
    });

  // Combine gestures with priority: longPress > pan > tap
  const combinedGesture = Gesture.Race(
    longPressGesture,
    panGesture,
    tapGesture
  );

  const loadUserPets = async () => {
    try {
      const pets = await getUserPets();
      setUserPets(pets);
    } catch (error: any) {
      console.error('Error loading user pets:', error);
    }
  };

  const handleFlip = async () => {
    if (!isFlipped) {
      // Load pets when flipping to back
      await loadUserPets();
    }

    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();

    setIsFlipped(!isFlipped);
  };

  const handleSelectPet = async (pet: UserPet) => {
    if (pet.id === activePet?.id) {
      // Already active, just flip back
      handleFlip();
      return;
    }

    try {
      setLoading(true);
      await switchPet(pet.id);
      showToast({ message: `Switched to ${pet.pet_name}!`, severity: 'success' });
      handleFlip();
      if (onPetChanged) {
        onPetChanged();
      }
    } catch (error: any) {
      console.error('Error switching pet:', error);
      showToast({ message: 'Failed to switch pet', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = flipAnimation.interpolate({
    inputRange: [0, 90, 180],
    outputRange: [1, 0, 0],
  });

  const backOpacity = flipAnimation.interpolate({
    inputRange: [0, 90, 180],
    outputRange: [0, 0, 1],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-8deg', '8deg'],
  });

  return (
    <View style={[styles.cardContainer, { height: cardHeight }]}>
      {/* Front - Active Pet */}
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ rotateY: frontInterpolate }],
            opacity: frontOpacity,
          },
        ]}
        pointerEvents={isFlipped ? 'none' : 'auto'}
      >
        {/* Entire card is tappable for flip */}
        <TouchableOpacity 
          onPress={handleFlip}
          activeOpacity={0.9}
          style={styles.cardTouchable}
        >
          <LinearGradient
            colors={['#ffffff', '#f5f5f5']}
            style={styles.gradientCard}
          >
            {/* Pet interaction area - blocks flip, only pet interactions */}
            <GestureDetector gesture={combinedGesture}>
              <View 
                style={styles.petInteractionArea}
                onStartShouldSetResponder={() => true}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <Animated.View 
                  style={[
                    styles.petContainer,
                    {
                      transform: [
                        { translateY: bounceAnim },
                        { translateX: shakeAnim },
                        { rotate: rotate },
                        { scale: scaleAnim },
                      ],
                    }
                  ]}
                >
                  <View style={[styles.petAvatar, { width: petSize, height: petSize, borderRadius: petSize / 2 }]}>
                    <Text style={[styles.petEmoji, { fontSize: petSize * 0.53 }]}>
                      {activePet?.pet_emoji || '🐶'}
                    </Text>
                  </View>
                </Animated.View>
              </View>
            </GestureDetector>
            
            {/* Card info - part of flip area */}
            <Text style={[styles.petName, isLarge && styles.petNameLarge]}>
              {activePet?.pet_name || 'Aura'}
            </Text>
            <Text style={styles.petLevel}>
              Level {petState?.level || 1} • {petState?.xp || 0} XP
            </Text>
            <View style={styles.tapHint}>
              <Ionicons name="hand-left-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.tapHintText}>Tap=poke • Hold/swipe=pet • Tap card to flip</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Back - Pet Selection */}
      <Animated.View
        style={[
          styles.card,
          styles.cardBack,
          {
            transform: [{ rotateY: backInterpolate }],
            opacity: backOpacity,
          },
        ]}
        pointerEvents={isFlipped ? 'auto' : 'none'}
      >
        <TouchableOpacity 
          onPress={handleFlip}
          activeOpacity={0.9}
          style={styles.cardTouchable}
        >
          <LinearGradient
            colors={['#ffffff', '#f0f0f0']}
            style={styles.gradientCard}
          >
            <Text style={styles.backTitle}>Choose Your Pet</Text>
            <View style={styles.petGrid}>
              {userPets.length > 0 ? (
                userPets.map((pet) => (
                  <TouchableOpacity
                    key={pet.id}
                    style={[
                      styles.petOption,
                      pet.id === activePet?.id && styles.petOptionActive,
                    ]}
                    onPress={() => handleSelectPet(pet)}
                    disabled={loading}
                  >
                    <Text style={styles.petOptionEmoji}>{pet.pet_emoji}</Text>
                    <Text style={styles.petOptionName} numberOfLines={1}>
                      {pet.pet_name}
                    </Text>
                    {pet.id === activePet?.id && (
                      <View style={styles.activeIndicator}>
                        <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noPetsText}>No pets available</Text>
              )}
            </View>
            <View style={styles.tapHint}>
              <Ionicons name="arrow-back-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.tapHintText}>Tap to go back</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    marginBottom: 16,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
  },
  cardBack: {
    transform: [{ rotateY: '180deg' }],
  },
  cardTouchable: {
    flex: 1,
  },
  petInteractionArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfoArea: {
    alignItems: 'center',
    paddingTop: 8,
  },
  gradientCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  petContainer: {
    marginBottom: 12,
  },
  petAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  petEmoji: {
    lineHeight: undefined,
  },
  petName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  petNameLarge: {
    fontSize: 28,
  },
  petLevel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  tapHintText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  backTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  petGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    width: '100%',
  },
  petOption: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.gray200,
  },
  petOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.secondaryLight,
  },
  petOptionEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  petOptionName: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  activeIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  noPetsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
