import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Colors, Gradients } from '../constants/theme';
import { getUserPets, switchPet, type UserPet, type PetState } from '../src/services/pet';
import { useToast } from '../src/providers/ToastProvider';
import { useRateLimit } from '../src/hooks/useRateLimit';
import { PetSpeechBubble } from './pet-speech-bubble';

// Decorative corner component - curved flourish matching card radius
const OrnamentalCorner = ({ position }: { position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }) => {
  const cornerStyles = {
    topLeft: { top: 8, left: 8, transform: [{ rotate: '0deg' }] },
    topRight: { top: 8, right: 8, transform: [{ rotate: '90deg' }] },
    bottomLeft: { bottom: 8, left: 8, transform: [{ rotate: '-90deg' }] },
    bottomRight: { bottom: 8, right: 8, transform: [{ rotate: '180deg' }] },
  };
  
  return (
    <View style={[styles.ornamentalCorner, cornerStyles[position]]}>
      {/* Outer curved line */}
      <View style={styles.curveOuter} />
      {/* Inner curved line */}
      <View style={styles.curveInner} />
      {/* Small accent dot */}
      <View style={styles.accentDot} />
    </View>
  );
};

interface FlippablePetCardProps {
  petState: PetState | null;
  activePet: UserPet | null;
  size?: 'small' | 'large';
  speechText?: string;
  onPetChanged?: () => void;
  onInteract?: (action: 'pet' | 'hit') => void | Promise<void>;
}

export default function FlippablePetCard({ 
  petState, 
  activePet, 
  size = 'small',
  speechText,
  onPetChanged,
  onInteract
}: FlippablePetCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [userPets, setUserPets] = useState<UserPet[]>([]);
  const [loading, setLoading] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: string; emoji: string; opacity: Animated.Value; translateX: Animated.Value; translateY: Animated.Value; tilt: string }>>([]);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  
  // Layout shared values for gesture detection
  const petX = useSharedValue(0);
  const petY = useSharedValue(0);
  const petWidth = useSharedValue(0);
  const petHeight = useSharedValue(0);

  // Toast and rate limiting
  const { showToast } = useToast();
  const { tryCall, getRemainingTime } = useRateLimit();
  const { t } = useTranslation();
  const lastToastTime = useRef<number>(0);
  
  // Animation refs for pet movement
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  // New animation refs for effects
  const hitOpacity = useRef(new Animated.Value(0)).current;
  const hitScale = useRef(new Animated.Value(1)).current;
  
  // Shared value to track swipe side relative to pet center (-1: Left, 1: Right)
  const lastSide = useSharedValue(0);

  // Emoji pool for celebration
  const celebrationEmojis = useRef(['❤️', '💕', '💖', '💗', '💓', '💞', '💘', '✨', '🌟', '⭐', '🌈', '🎈', '🥳', '🎉', '🎊']).current;

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
  const cardHeight = isLarge ? 310 : 240;

  // Helper function to select 5 random unique emojis
  const selectRandomEmojis = (): string[] => {
    const shuffled = [...celebrationEmojis].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  };

  // Pet animation (rotate + celebration)
  const playPetAnimation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Generate 5 random unique emojis
    const selectedEmojis = selectRandomEmojis();
    const newParticles: Array<{ id: string; emoji: string; opacity: Animated.Value; translateX: Animated.Value; translateY: Animated.Value; tilt: string }> = [];

    // Create 5 new particles
    selectedEmojis.forEach((emoji, index) => {
      const opacity = new Animated.Value(1);
      const translateX = new Animated.Value(0);
      const translateY = new Animated.Value(0);
      
      const tiltDeg = Math.round((Math.random() - 0.5) * 60); // -30..30 degrees
      const particle = { 
        id: `${Date.now()}-${index}`, 
        emoji,
        opacity, 
        translateX, 
        translateY,
        tilt: `${tiltDeg}deg`,
      };
      newParticles.push(particle);
      
      // Divide 360 degrees into 5 sectors with random variation inside each
      const sectors = 5;
      const baseAngle = (index * (2 * Math.PI / sectors)); // base angle for each sector
      const angleVariation = (Math.random() - 0.5) * (Math.PI / sectors); // ±(360/5)/2 variation
      const randomAngle = baseAngle + angleVariation;
      
      // Distance to keep particles within card bounds
      // Slightly vary distance so particles scatter differently
      const distance = 80 + Math.random() * 40;
      const tx = Math.cos(randomAngle) * distance;
      const ty = Math.sin(randomAngle) * distance;
      
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: tx,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: ty,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(1200),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        // Remove particle after animation completes
        setParticles(prev => prev.filter(p => p.id !== particle.id));
      });
    });
    
    // Add new particles to the list
    setParticles(prev => [...prev, ...newParticles]);

    Animated.parallel([
      // Rotate animation (wiggle left/right)
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: -1, duration: 100, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: -0.5, duration: 100, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0.5, duration: 100, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]),
    ]).start();
  };

  // Hit animation (shake + red flash)
  const playHitAnimation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Reset hit opacity and scale
    hitOpacity.setValue(0.6);
    hitScale.setValue(1);

    Animated.parallel([
      // Shake
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]),
      // Red flash fade out and expand
      Animated.timing(hitOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(hitScale, {
        toValue: 2,
        duration: 400,
        useNativeDriver: true,
      }),
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
          message: t('pet.tooManyInteractions', { seconds: remainingSeconds }), 
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

  // Sync wrapper for gesture handler (runOnJS cannot call async functions directly)
  const triggerFlip = useCallback(() => {
    // Load pets asynchronously if flipping to back
    if (!isFlipped) {
      loadUserPets();
    }

    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();

    setIsFlipped(!isFlipped);
  }, [isFlipped, flipAnimation]);

  // Tap gesture - quick tap
  // If on pet -> hit. If elsewhere -> flip.
  const tapGesture = Gesture.Tap()
    .maxDistance(10) // Ensure tap doesn't trigger if we swipe
    .onEnd((e) => {
      const padding = 20; // LinearGradient padding
      const absoluteX = petX.value + padding;
      const absoluteY = petY.value + padding;
      
      // Check if tap is strictly within pet bounds
      const isHit = e.x >= absoluteX && e.x <= absoluteX + petWidth.value &&
                    e.y >= absoluteY && e.y <= absoluteY + petHeight.value;

      if (isHit) {
        runOnJS(handlePetInteraction)('hit');
      } else {
        runOnJS(triggerFlip)();
      }
    });

  // Pan gesture - rub/pet
  // Trigger when crossing the center of the pet
  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onStart((e) => {
      const padding = 20;
      const absoluteX = petX.value + padding;
      const centerX = absoluteX + petWidth.value / 2;
      
      // Determine initial side relative to center
      if (e.x < centerX) {
        lastSide.value = -1;
      } else {
        lastSide.value = 1;
      }
    })
    .onUpdate((e) => {
      const padding = 20;
      const absoluteX = petX.value + padding;
      const absoluteY = petY.value + padding;
      const centerX = absoluteX + petWidth.value / 2;
      
      // Check if within Y bounds (with generous buffer)
      const bufferY = 50; 
      const isOverY = e.y >= absoluteY - bufferY && e.y <= absoluteY + petHeight.value + bufferY;
      
      if (!isOverY) return;

      const hysteresis = 15; // Distance from center to trigger crossing
      
      if (lastSide.value === -1 && e.x > centerX + hysteresis) {
        // Crossed from Left to Right
        lastSide.value = 1;
        runOnJS(handlePetInteraction)('pet');
      } else if (lastSide.value === 1 && e.x < centerX - hysteresis) {
        // Crossed from Right to Left
        lastSide.value = -1;
        runOnJS(handlePetInteraction)('pet');
      }
    });

  // Long press gesture - pet/stroke (positive interaction)
  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .maxDistance(10) // Ensure long press doesn't trigger if we swipe
    .onStart((e) => {
       // Only trigger if on pet
       const padding = 20;
       const absoluteX = petX.value + padding;
       const absoluteY = petY.value + padding;
       const isHit = e.x >= absoluteX && e.x <= absoluteX + petWidth.value &&
                     e.y >= absoluteY && e.y <= absoluteY + petHeight.value;
       
       if (isHit) {
         runOnJS(startContinuousInteraction)();
       }
    })
    .onFinalize(() => {
      runOnJS(stopContinuousInteraction)();
    });

  // Combine gestures with priority
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
    outputRange: ['-15deg', '15deg'],
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
        <GestureDetector gesture={combinedGesture}>
          <LinearGradient
            colors={['#ffffff', '#f5f5f5']}
            style={styles.gradientCard}
          >
            {/* Ornamental Corners */}
            <OrnamentalCorner position="topLeft" />
            <OrnamentalCorner position="topRight" />
            <OrnamentalCorner position="bottomLeft" />
            <OrnamentalCorner position="bottomRight" />
            
            {/* Flex Container for Dynamic Layout */}
            <View style={styles.flexContainer}>
              
              {/* Top: Speech Bubble */}
              <View style={styles.topSection}>
                {speechText ? (
                  <PetSpeechBubble text={speechText} />
                ) : (
                  <View style={{ height: 20 }} /> // Spacer
                )}
              </View>

              {/* Middle: Pet & Effects */}
              <View 
                style={styles.middleSection}
                onLayout={(e) => {
                  petX.value = e.nativeEvent.layout.x;
                  petY.value = e.nativeEvent.layout.y;
                  petWidth.value = e.nativeEvent.layout.width;
                  petHeight.value = e.nativeEvent.layout.height;
                }}
              >
                {/* Particles */}
                <View style={styles.particlesContainer} pointerEvents="none">
                  {particles.map((particle) => (
                    <Animated.View 
                      key={particle.id}
                      style={[{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          marginLeft: -12,
                          marginTop: -12,
                          opacity: particle.opacity,
                          transform: [
                            { translateX: particle.translateX },
                            { translateY: particle.translateY },
                            { rotate: particle.tilt },
                          ],
                        }]}
                    >
                      <Text style={styles.effectEmoji}>{particle.emoji}</Text>
                    </Animated.View>
                  ))}
                </View>

                {/* Hit Effect */}
                <Animated.View 
                    style={[
                        styles.hitEffect, 
                        { 
                            width: petSize, 
                            height: petSize,
                            borderRadius: petSize / 2,
                            opacity: hitOpacity,
                            transform: [{ scale: hitScale }]
                        }
                    ]} 
                />

                {/* Pet Avatar */}
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

              {/* Bottom: Info */}
              <View style={styles.bottomSection}>
                <Text style={[styles.petName, isLarge && styles.petNameLarge]}>
                  {activePet?.pet_name || 'Aura'}
                </Text>
                <Text style={styles.petLevel}>
                  Level {petState?.level || 1} • {petState?.xp || 0} XP
                </Text>
                <View style={styles.tapHint}>
                  <Ionicons name="hand-left-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.tapHintText}>{t('pet.tapHint')}</Text>
                </View>
              </View>

            </View>
          </LinearGradient>
        </GestureDetector>
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
            {/* Ornamental Corners */}
            <OrnamentalCorner position="topLeft" />
            <OrnamentalCorner position="topRight" />
            <OrnamentalCorner position="bottomLeft" />
            <OrnamentalCorner position="bottomRight" />
            
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
              <Text style={styles.tapHintText}>{t('pet.tapToGoBack')}</Text>
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
    marginBottom: 0,
  },
  ornamentalCorner: {
    position: 'absolute',
    width: 18,
    height: 18,
    zIndex: 10,
  },
  curveOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 18,
    height: 18,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: Colors.primary,
    borderTopLeftRadius: 16,
    opacity: 0.4,
  },
  curveInner: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 10,
    height: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: Colors.primary,
    borderTopLeftRadius: 10,
    opacity: 0.2,
  },
  accentDot: {
    position: 'absolute',
    top: -0.5,
    left: -0.5,
    width: 3,
    height: 3,
    backgroundColor: Colors.primary,
    opacity: 0.3,
    borderRadius: 1.5,
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
  flexContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  topSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 40,
  },
  middleSection: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
     marginBottom: 3,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  particlesContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  hitEffect: {
    position: 'absolute',
    backgroundColor: '#FF0000',
  },
  effectEmoji: {
    fontSize: 24,
  },
  petContainer: {
    // 
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
});
