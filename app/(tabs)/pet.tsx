import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Gradients } from '../../constants/theme';
import { PET_PHRASES, getRandomPetPhrase } from '../../src/config/petPhrases';

// Decorative corner component - curved flourish matching card radius
const OrnamentalCorner = ({ position }: { position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }) => {
  const cornerStyles: Record<string, any> = {
    topLeft: { top: 8, left: 8, transform: [{ rotate: '0deg' }] },
    topRight: { top: 8, right: 8, transform: [{ rotate: '90deg' }] },
    bottomLeft: { bottom: 8, left: 8, transform: [{ rotate: '-90deg' }] },
    bottomRight: { bottom: 8, right: 8, transform: [{ rotate: '180deg' }] },
  };
  
  return (
    <View style={[petStatusStyles.ornamentalCorner, cornerStyles[position]]}>
      {/* Outer curved line */}
      <View style={petStatusStyles.curveOuter} />
      {/* Inner curved line */}
      <View style={petStatusStyles.curveInner} />
      {/* Small accent dot */}
      <View style={petStatusStyles.accentDot} />
    </View>
  );
};

const petStatusStyles = StyleSheet.create({
  ornamentalCorner: {
    position: 'absolute',
    width: 18,
    height: 18,
    zIndex: 10,
  },
  // Outer curved flourish (matches card's 16px border radius)
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
    // Mask to only show the curve in corner area
  },
  // Inner curved line (subtle parallel)
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
  // Small accent dot at corner point
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
});
import { RefreshableScrollView } from '../../components/refreshable-scroll-view';
import { useIsFocused } from '@react-navigation/native';
import FlippablePetCard from '../../components/flippable-pet-card';
import { useLanguage } from '../../src/providers/LanguageProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { 
  getPetState, 
  getActivePet, 
  purchasePet,
  getUserPets,
  addXP,
  petPet,
  hitPet,
  calculateLevelFromXP,
  AVAILABLE_PETS,
  UserPet,
  PetState,
  getLocalizedPetText,
} from '../../src/services/pet';


export default function PetScreen() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [petState, setPetState] = useState<PetState | null>(null);
  const [activePet, setActivePet] = useState<UserPet | null>(null);
  const [userPets, setUserPets] = useState<UserPet[]>([]);
  const [loading, setLoading] = useState(true);
  const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);
  
  const [speechText, setSpeechText] = useState(PET_PHRASES.en[0]);
  const { currentLanguage } = useLanguage();
  const isFocused = useIsFocused();

  const updateSpeech = () => {
    const language = currentLanguage && currentLanguage.startsWith('zh') ? 'zh' : 'en';
    setSpeechText(prev => getRandomPetPhrase(language, prev));
  };

  useEffect(() => {
    loadPetData();
    
    // Load cooldown from storage
    const loadCooldown = async () => {
      try {
        const savedCooldown = await AsyncStorage.getItem('petXPCooldown');
        if (savedCooldown) {
          const endTime = parseInt(savedCooldown);
          if (endTime > Date.now()) {
            setCooldownEndTime(endTime);
          } else {
            await AsyncStorage.removeItem('petXPCooldown');
          }
        }
      } catch (error) {
        console.error('Error loading cooldown:', error);
      }
    };
    
    loadCooldown();
  }, []);

  // Refresh pet speech when the screen becomes focused (entering the pet screen)
  useEffect(() => {
    if (isFocused) {
      updateSpeech();
    }
  }, [isFocused, currentLanguage]);

  // Countdown timer
  useEffect(() => {
    if (!cooldownEndTime) {
      setRemainingTime(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((cooldownEndTime - now) / 1000));
      setRemainingTime(remaining);

      if (remaining === 0) {
        setCooldownEndTime(null);
        AsyncStorage.removeItem('petXPCooldown').catch(console.error);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [cooldownEndTime]);

  const loadPetData = async () => {
    try {
      const [state, active, pets] = await Promise.all([
        getPetState(),
        getActivePet(),
        getUserPets(),
      ]);
      
      setPetState(state);
      setActivePet(active);
      setUserPets(pets);
    } catch (error: any) {
      console.error('Error loading pet data:', error);
      showToast({ message: t('pet.failedToLoad'), severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  async function onRefresh() {
    setRefreshing(true);
    await loadPetData();
    // Also refresh the pet's speech so manual refresh updates it.
    updateSpeech();
    setRefreshing(false);
  }

  const handleGainXP = async () => {
    // Check if still in cooldown
    if (cooldownEndTime && Date.now() < cooldownEndTime) {
      showToast({
        message: t('pet.pleaseWaitMessage', { seconds: remainingTime }),
        severity: 'warning'
      });
      return;
    }

    try {
      const result = await addXP(100);
      
      // Set 10 minute cooldown
      const endTime = Date.now() + 10 * 60 * 1000; // 10 minutes
      setCooldownEndTime(endTime);
      await AsyncStorage.setItem('petXPCooldown', endTime.toString());
      
      if (result.leveledUp) {
        showToast({
          message: `🎉 ${t('pet.levelUpMessage', { level: result.pet.level, levels: result.levelsGained })}`,
          severity: 'success'
        });
      } else if (result.blockedByMood) {
        showToast({
          message: t('pet.levelUpBlocked', { defaultValue: "Level up blocked! Pet needs 100% happiness." }),
          severity: 'warning'
        });
      } else {
        showToast({
          message: t('pet.xpGainedMessage', { xp: result.xpGained }),
          severity: 'success'
        });
      }
      
      updateSpeech();
      await loadPetData();
    } catch (error: any) {
      console.error('Error adding XP:', error);
      showToast({ message: t('pet.failedToGainXP'), severity: 'error' });
    }
  };

  const handlePurchasePet = async (petId: string) => {
    try {
      const availablePet = AVAILABLE_PETS.find(p => p.id === petId);
      if (!availablePet) return;

      // Check if user has enough XP
      if (petState && petState.xp < availablePet.xp_cost) {
        showToast({
          message: t('pet.notEnoughXPMessage', { required: availablePet.xp_cost, current: petState.xp }),
          severity: 'warning'
        });
        return;
      }

      const language = currentLanguage === 'zh' ? 'zh' : 'en';
      const breedText = getLocalizedPetText(availablePet, language).breed;
      Alert.alert(
        t('pet.purchasePet'),
        t('pet.purchasePetMessage', { breed: breedText, cost: availablePet.xp_cost }),
        [
          { text: t('pet.cancel'), style: 'cancel' },
          {
            text: t('pet.buy'),
            onPress: async () => {
              try {
                await purchasePet(petId);
                showToast({ 
                  message: t('pet.purchaseSuccess', { breed: breedText }), 
                  severity: 'success'
                });
                await loadPetData();
              } catch (error: any) {
                console.error('Error purchasing pet:', error);
                showToast({ 
                  message: error.message || t('pet.failedToPurchase'), 
                  severity: 'error' 
                });
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error purchasing pet:', error);
    }
  };

  // Handle pet interaction (pet or hit)
  const handlePetInteract = async (action: 'pet' | 'hit') => {
    try {
      updateSpeech();
      if (action === 'pet') {
        const result: any = await petPet(5);
        if (result.leveledUp) {
          showToast({
            message: `🎉 ${t('pet.levelUpMessage', { level: result.level, levels: result.levelsGained })}`,
            severity: 'success'
          });
        } else if (result.xpGained > 0) {
           showToast({
            message: t('pet.pettedMessageXP', { name: activePet?.pet_name || 'Pet', mood: result.mood, xp: result.xpGained, defaultValue: `You petted ${activePet?.pet_name || 'Pet'}! +${result.xpGained} XP` }),
            severity: 'success'
          });
        } else {
          showToast({
            message: t('pet.pettedMessage', { name: activePet?.pet_name || 'Pet', mood: result.mood }),
            severity: 'success'
          });
        }
      } else {
        const result: any = await hitPet(10);
        if (result.xpLost > 0) {
           showToast({
            message: t('pet.hitMessageXP', { name: activePet?.pet_name || 'Pet', mood: result.mood, xp: result.xpLost, defaultValue: `You hit ${activePet?.pet_name || 'Pet'}! -${result.xpLost} XP` }),
            severity: 'info'
          });
        } else {
          showToast({
            message: t('pet.hitMessage', { name: activePet?.pet_name || 'Pet', mood: result.mood }),
            severity: 'info'
          });
        }
      }
      
      await loadPetData();
    } catch (error: any) {
      console.error('Error interacting with pet:', error);
      showToast({ message: t('pet.failedToInteract'), severity: 'error' });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('pet.loadingPet')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const happiness = petState?.mood || 0;
  
  // Calculate level progress using new system
  const totalXP = petState?.xp || 0;
  const { currentLevelXP, xpForNextLevel } = calculateLevelFromXP(totalXP);
  const levelProgress = currentLevelXP;
  const levelMax = xpForNextLevel;
  
  const dailyStreak = 0; // TODO: Calculate from transaction history
  const lastFed = petState?.last_feed_at 
    ? `${Math.floor((Date.now() - new Date(petState.last_feed_at).getTime()) / (1000 * 60 * 60))}h ago`
    : 'Never';

  const outfits = [
    { id: 1, name: 'Casual', xp: 0, unlocked: true, wearing: true },
    { id: 2, name: 'Business Suit', xp: 100, unlocked: false },
    { id: 3, name: 'Party Hat', xp: 50, unlocked: false },
    { id: 4, name: 'Cape & Mask', xp: 150, unlocked: false },
    { id: 5, name: 'Cozy Sweater', xp: 75, unlocked: false },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <RefreshableScrollView 
        style={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Flippable Pet Card */}
        <View style={styles.petCardContainer}>
          <FlippablePetCard 
            petState={petState} 
            activePet={activePet} 
            size="large"
            speechText={speechText}
            onPetChanged={() => { updateSpeech(); loadPetData(); }}
            onInteract={handlePetInteract}
          />
        </View>

        {/* Pet Status Card */}
        <View style={styles.card}>
          {/* Ornamental Corners */}
          <OrnamentalCorner position="topLeft" />
          <OrnamentalCorner position="topRight" />
          <OrnamentalCorner position="bottomLeft" />
          <OrnamentalCorner position="bottomRight" />
          
          <View style={styles.cardHeader}>
            <Ionicons name="heart" size={24} color={Colors.error} />
            <Text style={styles.cardTitle}>{t('pet.petStatus')}</Text>
          </View>

          {/* Happiness */}
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t('pet.happiness')}</Text>
            <Text style={styles.statusValue}>{happiness}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, styles.happinessFill, { width: `${happiness}%` }]} />
          </View>

          {/* Level Progress */}
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t('pet.levelProgress')}</Text>
            <Text style={styles.statusValue}>{levelProgress}/{levelMax} XP</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                styles.levelFill,
                { width: `${(levelProgress / levelMax) * 100}%` },
              ]}
            />
          </View>

          {/* Daily Streak */}
          <View style={styles.streakContainer}>
            <View style={styles.streakLeft}>
              <Ionicons name="flash" size={20} color={Colors.warning} />
              <Text style={styles.streakText}>{t('pet.dailyStreak', { count: dailyStreak })}</Text>
            </View>
            <Text style={styles.streakTime}>{t('pet.lastFed', { time: lastFed })}</Text>
          </View>
        </View>

        {/* Come Back Timer - Click to Gain XP */}
        <TouchableOpacity 
          style={[
            styles.timerCard,
            remainingTime > 0 && styles.timerCardDisabled
          ]} 
          onPress={handleGainXP} 
          activeOpacity={remainingTime > 0 ? 1 : 0.7}
          disabled={remainingTime > 0}
        >
          <Ionicons 
            name={remainingTime > 0 ? "time-outline" : "gift-outline"} 
            size={24} 
            color={remainingTime > 0 ? Colors.gray600 : Colors.white} 
          />
          <Text style={[
            styles.timerText,
            remainingTime > 0 && styles.timerTextDisabled
          ]}>
            {remainingTime > 0 
              ? t('pet.waitToClaim', { seconds: remainingTime })
              : t('pet.tapToGainXP')}
          </Text>
        </TouchableOpacity>
        <Text style={styles.timerSubtext}>
          {remainingTime > 0 
            ? t('pet.comeBackMessage', { seconds: remainingTime })
            : t('pet.claimNow', { minutes: 10 })}
        </Text>

        {/* Choose Your Pets Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="storefront" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>{t('pet.chooseYourPets')}</Text>
          </View>
          <Text style={styles.shopSubtitle}>
            {t('pet.shopSubtitle', { xp: petState?.xp || 0 })}
          </Text>

          {/* Available Pets for Purchase */}
          {AVAILABLE_PETS.map((pet) => {
            const language = currentLanguage === 'zh' ? 'zh' : 'en';
            const { breed: breedText, description: descriptionText } = getLocalizedPetText(pet, language);
            const owned = userPets.some(u => 
              u.pet_type === pet.type && (
                u.pet_breed === pet.breed ||
                u.pet_breed === pet.translations?.en?.breed ||
                u.pet_breed === pet.translations?.zh?.breed
              )
            );
            return (
              <View key={pet.id} style={styles.petShopItem}>
                <View style={styles.petShopLeft}>
                  <Text style={styles.petShopEmoji}>{pet.emoji}</Text>
                  <View style={styles.petShopInfo}>
                    <Text style={styles.petShopName}>{breedText}</Text>
                    <Text style={styles.petShopDescription}>{descriptionText}</Text>
                    {!owned && <Text style={styles.petShopCost}>{pet.xp_cost} XP</Text>}
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.petShopButton,
                    owned && styles.petShopButtonOwned,
                  ]}
                  onPress={() => !owned && handlePurchasePet(pet.id)}
                  disabled={owned}
                >
                  <Text
                    style={[
                      styles.petShopButtonText,
                      owned && styles.petShopButtonTextOwned,
                    ]}
                  >
                    {owned ? t('pet.owned') : t('pet.buy')}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Outfit Shop */}
        {/* <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="gift" size={24} color={Colors.success} />
            <Text style={styles.cardTitle}>{t('pet.outfitShop')}</Text>
          </View>
          <Text style={styles.shopSubtitle}>
            {t('pet.outfitShopSubtitle')}
          </Text> */}

          {/* Outfits List */}
          {/* {outfits.map((outfit) => (
            <View key={outfit.id} style={styles.outfitItem}>
              <View style={styles.outfitLeft}>
                <Ionicons
                  name={outfit.unlocked ? 'star' : 'star-outline'}
                  size={24}
                  color={outfit.unlocked ? Colors.warning : Colors.gray400}
                />
                <View style={styles.outfitInfo}>
                  <Text style={styles.outfitName}>{outfit.name}</Text>
                  {!outfit.unlocked && <Text style={styles.outfitXP}>{outfit.xp} XP</Text>}
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.outfitButton,
                  outfit.wearing && styles.outfitButtonWearing,
                  !outfit.unlocked && styles.outfitButtonLocked,
                ]}
                disabled={!outfit.unlocked}
              >
                <Text
                  style={[
                    styles.outfitButtonText,
                    outfit.wearing && styles.outfitButtonTextWearing,
                    !outfit.unlocked && styles.outfitButtonTextLocked,
                  ]}
                >
                  {outfit.wearing ? t('pet.wearing') : outfit.unlocked ? t('pet.wear') : t('pet.buy')}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View> */}

        <View style={{ height: 20 }} />
      </RefreshableScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  petCardContainer: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 8,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statusValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  progressBar: {
    height: 10,
    backgroundColor: Colors.gray200,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  happinessFill: {
    backgroundColor: Colors.textPrimary,
  },
  levelFill: {
    backgroundColor: Colors.textPrimary,
  },
  streakContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  streakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  streakTime: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  timerCard: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  timerCardDisabled: {
    backgroundColor: Colors.gray300,
    shadowColor: Colors.gray400,
    shadowOpacity: 0.2,
    opacity: 0.7,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  timerTextDisabled: {
    color: Colors.gray600,
  },
  timerSubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  shopSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  petShopItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  petShopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  petShopEmoji: {
    fontSize: 36,
  },
  petShopInfo: {
    flex: 1,
  },
  petShopName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  petShopDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  petShopCost: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  petShopButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  petShopButtonOwned: {
    backgroundColor: Colors.gray300,
  },
  petShopButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  petShopButtonTextOwned: {
    color: Colors.gray600 || Colors.textSecondary,
  },
  outfitItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  outfitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  outfitInfo: {
    flex: 1,
  },
  outfitName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 1,
  },
  outfitXP: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  outfitButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.textPrimary,
  },
  outfitButtonWearing: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  outfitButtonLocked: {
    backgroundColor: Colors.white,
    borderColor: Colors.gray300,
  },
  outfitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  outfitButtonTextWearing: {
    color: Colors.white,
  },
  outfitButtonTextLocked: {
    color: Colors.gray400,
  },
});