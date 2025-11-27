import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator, Modal, Keyboard, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../../constants/theme';
import { RefreshableScrollView } from '../../components/refreshable-scroll-view';
import { supabase } from '../../src/services/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useCurrency } from '../../src/providers/CurrencyProvider';
import { useLanguage } from '../../src/providers/LanguageProvider';
import { 
  saveOpenAIConfig, 
  getOpenAIConfig, 
  fetchOpenAIModels, 
  type OpenAIConfig,
  type OpenAIModel 
} from '../../src/services/openai-config';
import FloatingChatButton from '../../components/floating-chat-button';
import {
  getCategories,
  addCategory,
  deleteCategory,
  subscribeToCategoryChanges,
  type Category,
} from '../../src/services/categories';
import { getCurrencies, type Currency } from '../../src/services/currencies';
import { getAllBudgets, setBudget, type Budget, DEFAULT_MONTHLY_BUDGET } from '../../src/services/budgets';

const MONTH_LABEL_OPTIONS: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };

const getMonthStartKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}-01`;
};

const normalizeDateString = (value: string) => value.split('T')[0];

const sortMonthKeysDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

const formatBudgetMonth = (monthKey: string) => {
  if (!monthKey) return '';
  const parsed = new Date(`${monthKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return monthKey;
  }
  return parsed.toLocaleDateString(undefined, MONTH_LABEL_OPTIONS);
};

const generateMonthKeyRange = (monthsBefore = 6, monthsAfter = 4) => {
  const keys: string[] = [];
  const today = new Date();
  for (let offset = -monthsBefore; offset <= monthsAfter; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    keys.push(getMonthStartKey(date));
  }
  return keys.sort(sortMonthKeysDesc);
};
import { getProfile, updateProfile } from '../../src/services/profiles';

export default function SettingsScreen() {
  const { session } = useAuth();
  const { refreshCurrency } = useCurrency();
  const { currentLanguage, changeLanguage, t } = useLanguage();
  
  console.log('SettingsScreen mounted, session:', !!session);
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // Email editing is intentionally disabled - show as read-only
  const EMAIL_EDITABLE = false;
  const [currency, setCurrency] = useState('USD ($)');
  const [language, setLanguage] = useState('English');
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [isDefaultBudget, setIsDefaultBudget] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBudgetMonth, setSelectedBudgetMonth] = useState(() => getMonthStartKey(new Date()));
  const [budgetMonthOptions, setBudgetMonthOptions] = useState<string[]>(() => generateMonthKeyRange());
  const [budgetEntries, setBudgetEntries] = useState<Budget[]>([]);
  const [budgetsLoaded, setBudgetsLoaded] = useState(false);
  const [showBudgetMonthModal, setShowBudgetMonthModal] = useState(false);

  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [dailyReminders, setDailyReminders] = useState(true);
  const [weeklyReports, setWeeklyReports] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(false);

  // Feature flags: disable notifications, preferences, or privacy UI (greyed out)
  const NOTIFICATIONS_DISABLED = true;
  const PREFERENCES_DISABLED = true;
  const PRIVACY_DISABLED = true;

  const [darkMode, setDarkMode] = useState(false);
  const [biometricLogin, setBiometricLogin] = useState(false);
  const [autoSync, setAutoSync] = useState(true);

  // External support links (leave empty for now — user will fill these later)
  const [faqUrl, setFaqUrl] = useState('https://github.com/BYLinMou/COMP3330-Gp20-AuraSpend/issues');
  const [contactUrl, setContactUrl] = useState('');
  const [tutorialUrl, setTutorialUrl] = useState('https://github.com/BYLinMou/COMP3330-Gp20-AuraSpend/blob/main/README.md');
  const [termsUrl, setTermsUrl] = useState('https://github.com/BYLinMou/COMP3330-Gp20-AuraSpend/blob/main/LICENSE');
  const [privacyUrl, setPrivacyUrl] = useState('');

  // OpenAI Configuration States
  const [openaiUrl, setOpenaiUrl] = useState('https://api.openai.com/v1');
  const [openaiKey, setOpenaiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<OpenAIModel[]>([]);
  const [receiptModel, setReceiptModel] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [fallbackModel, setFallbackModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [showReceiptModelModal, setShowReceiptModelModal] = useState(false);
  const [showChatModelModal, setShowChatModelModal] = useState(false);
  const [showFallbackModelModal, setShowFallbackModelModal] = useState(false);
  const [receiptModelSearch, setReceiptModelSearch] = useState('');
  const [chatModelSearch, setChatModelSearch] = useState('');
  const [fallbackModelSearch, setFallbackModelSearch] = useState('');
  const [receiptSearchFocused, setReceiptSearchFocused] = useState(false);
  const [chatSearchFocused, setChatSearchFocused] = useState(false);
  const [fallbackSearchFocused, setFallbackSearchFocused] = useState(false);
  const [fetchedModelsCount, setFetchedModelsCount] = useState(0);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Currency state
  const [currencyOptions, setCurrencyOptions] = useState<Currency[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const currencySymbol = React.useMemo(() => {
    const currencyMatch = currencyOptions.find((c) => c.code === selectedCurrency);
    return currencyMatch?.symbol || '$';
  }, [currencyOptions, selectedCurrency]);

  // Language options
  const languageOptions = [
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文' },
  ];

  // Collapsible section state - tracks which section is expanded, all collapsed by default
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const findBudgetForMonth = React.useCallback(
    (monthKey: string) => budgetEntries.find((budget) => normalizeDateString(budget.start_date) === monthKey),
    [budgetEntries]
  );

  const updateMonthOptions = React.useCallback((budgets: Budget[]) => {
    const baseRange = generateMonthKeyRange();
    const budgetMonths = budgets.map((budget) => normalizeDateString(budget.start_date));
    const merged = Array.from(new Set([...baseRange, ...budgetMonths]));
    merged.sort(sortMonthKeysDesc);
    setBudgetMonthOptions(merged);
  }, []);

  const loadBudgetData = React.useCallback(async () => {
    if (!session) {
      setBudgetEntries([]);
      setBudgetMonthOptions(generateMonthKeyRange());
      setBudgetsLoaded(true);
      return;
    }
    try {
      const budgets = await getAllBudgets();
      setBudgetEntries(budgets);
      updateMonthOptions(budgets);
    } catch (error) {
      console.error('Failed to load budget list:', error);
    } finally {
      setBudgetsLoaded(true);
    }
  }, [session, updateMonthOptions]);

  // Handler to toggle section expansion
  const toggleSection = (sectionName: string) => {
    if (expandedSection === sectionName) {
      setExpandedSection(null);
    } else {
      setExpandedSection(sectionName);
    }
  };

  // Handler to toggle model selection with alert if no models available
  const toggleModelSelection = () => {
    if (showModelSelection) {
      setShowModelSelection(false);
    } else {
      // Check if models are empty and no previously selected models
      if (availableModels.length === 0 && !receiptModel && !chatModel && !fallbackModel) {
        console.log('[Settings] No models available, prompting user to fetch');
        setShowModelSelection(true);
        Alert.alert(
          'No Models Available',
          'You need to fetch the available models first. Would you like to fetch them now?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Fetch Models',
              onPress: async () => {
                if (!openaiUrl.trim() || !openaiKey.trim()) {
                  Alert.alert('Validation Error', 'Please enter both API URL and API Key first');
                  return;
                }
                try {
                  setLoadingModels(true);
                  const models = await fetchOpenAIModels(openaiUrl, openaiKey);
                  setAvailableModels(models);
                  setShowModelSelection(true);
                  console.log('[Settings] Models fetched successfully:', models.length);
                  Alert.alert('Success', `Found ${models.length} available models`);
                } catch (error: any) {
                  Alert.alert('Connection Failed', error.message || 'Failed to fetch models');
                  setAvailableModels([]);
                } finally {
                  setLoadingModels(false);
                }
              },
            },
          ]
        );
      } else {
        setShowModelSelection(true);
      }
    }
  };

  // Load OpenAI config on mount
  useEffect(() => {
    loadOpenAIConfig();
    loadCurrencies();
    loadProfile();
  }, []);

  // Sync language display name with current language
  useEffect(() => {
    const langOption = languageOptions.find(l => l.code === currentLanguage);
    if (langOption) {
      setLanguage(langOption.name);
    }
  }, [currentLanguage]);

  useEffect(() => {
    loadBudgetData();
  }, [loadBudgetData]);

  useEffect(() => {
    if (budgetMonthOptions.length === 0) {
      return;
    }
    if (!budgetMonthOptions.includes(selectedBudgetMonth)) {
      setSelectedBudgetMonth(budgetMonthOptions[0]);
    }
  }, [budgetMonthOptions, selectedBudgetMonth]);

  useEffect(() => {
    if (!budgetsLoaded) {
      return;
    }
    const monthEntry = findBudgetForMonth(selectedBudgetMonth);
    if (monthEntry) {
      const monthlyAmount = monthEntry.period === 'monthly'
        ? monthEntry.amount
        : monthEntry.amount / 12;
      setMonthlyBudget(monthlyAmount.toString());
      setIsDefaultBudget(false);
    } else if (selectedBudgetMonth) {
      // Show default budget when none is set for selected month
      setMonthlyBudget(DEFAULT_MONTHLY_BUDGET.toString());
      setIsDefaultBudget(true);
    }
  }, [budgetsLoaded, findBudgetForMonth, selectedBudgetMonth, budgetEntries]);

  // Focus effect: reload categories when navigating back to this screen
  useFocusEffect(
    React.useCallback(() => {
      console.log('[Settings] Screen focused, reloading categories');
      if (session) {
        loadCategories();
      }
    }, [session])
  );

  // Load categories and subscribe to realtime
  useEffect(() => {
    if (!session) return;
    
    let mounted = true;
    let unsub: undefined | (() => Promise<void>);

    (async () => {
      try {
        // Initial load
        await loadCategories();
        
        // Subscribe to realtime changes
        console.log('[Settings] Subscribing to category changes...');
        unsub = await subscribeToCategoryChanges((change) => {
          console.log('[Settings] Category change received:', {
            eventType: change.eventType,
            newCategory: change.new?.name,
            oldCategory: change.old?.name,
          });
          // Reload categories for any event (INSERT, UPDATE, DELETE)
          if (mounted) {
            console.log('[Settings] Reloading categories after', change.eventType);
            loadCategories();
          }
        });
        console.log('[Settings] Successfully subscribed to category changes');
      } catch (e) {
        console.warn('[Settings] Category realtime subscription failed:', e);
      }
    })();

    return () => {
      mounted = false;
      if (unsub) {
        console.log('[Settings] Unsubscribing from category changes');
        unsub().catch(() => {});
      }
    };
  }, [session]);

  useEffect(() => {
    // Load user's actual login email from session
    if (session?.user?.email) {
      setEmail(session.user.email);
      // Also set full name from user metadata if available
      const displayName = session.user.user_metadata?.full_name || '';
      if (displayName) {
        setFullName(displayName);
      }
    }
  }, [session]);

  const loadOpenAIConfig = async () => {
    try {
      const config = await getOpenAIConfig();
      if (config) {
        setOpenaiUrl(config.apiUrl);
        setOpenaiKey(config.apiKey);
        setReceiptModel(config.receiptModel);
        setChatModel(config.chatModel);
        setFallbackModel(config.fallbackModel);
      }
    } catch (error) {
      console.error('Failed to load OpenAI config:', error);
    }
  };

  const loadCurrencies = async () => {
    try {
      const data = await getCurrencies();
      setCurrencyOptions(data);
      console.log('[Settings] Loaded currencies:', data);
    } catch (error) {
      console.error('Failed to load currencies:', error);
    }
  };

  const loadProfile = async () => {
    try {
      const profile = await getProfile();
      // username & primary currency from profile table
      if (profile?.username != null) setFullName(profile.username);
      if (profile?.primary_currency != null) setSelectedCurrency(profile.primary_currency);
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const handleLanguageChange = async (langCode: string) => {
    try {
      await changeLanguage(langCode);
      const langOption = languageOptions.find(l => l.code === langCode);
      if (langOption) {
        setLanguage(langOption.name);
      }
      setShowLanguageModal(false);
    } catch (error) {
      console.error('Failed to change language:', error);
      Alert.alert(t('settings.alerts.error'), t('settings.alerts.failedToSave', { item: 'language' }));
    }
  };

  const handleSaveBudget = async () => {
    if (!session) {
      Alert.alert(t('settings.alerts.notSignedIn'), t('settings.alerts.pleaseSignIn', { item: 'budget' }));
      return;
    }

    const amount = parseFloat(monthlyBudget);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('settings.alerts.invalidBudget'), t('settings.alerts.enterValidBudget'));
      return;
    }

    try {
      const savedBudget = await setBudget(amount, 'monthly', selectedBudgetMonth);
      setBudgetEntries((prevBudgets) => {
        const filtered = prevBudgets.filter((entry) => entry.id !== savedBudget.id);
        const updated = [savedBudget, ...filtered];
        updateMonthOptions(updated);
        return updated;
      });
      setIsDefaultBudget(false);
    } catch (error) {
      console.error('Failed to save budget:', error);
      Alert.alert(t('settings.alerts.error'), t('settings.alerts.failedToSave', { item: 'budget' }));
    }
  };

  const handleSaveProfile = async () => {
    if (!session) {
      Alert.alert(t('settings.alerts.notSignedIn'), t('settings.alerts.pleaseSignIn', { item: 'profile' }));
      return;
    }

    try {
      const updates = {
        username: fullName.trim() === '' ? null : fullName.trim(),
        primary_currency: selectedCurrency || null,
      } as any; // service has proper typing

      await updateProfile(updates);

      // Only save budget if user explicitly changed it (not the displayed default)
      if (!isDefaultBudget) {
        await handleSaveBudget();
      }

      // Refresh global currency after profile update
      await refreshCurrency();

      Alert.alert(t('settings.alerts.success'), t('settings.alerts.profileUpdated'));
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      Alert.alert(t('settings.alerts.error'), error?.message || t('settings.alerts.failedToSave', { item: 'profile' }));
    }
  };

  const handleFetchModels = async () => {
    if (!openaiUrl.trim() || !openaiKey.trim()) {
      Alert.alert(t('settings.alerts.validationError'), t('settings.alerts.enterBothApiCredentials'));
      return;
    }

    try {
      setLoadingModels(true);
      const models = await fetchOpenAIModels(openaiUrl, openaiKey);
      
      // Display all models without filtering
      setAvailableModels(models);
      setFetchedModelsCount(models.length);
    } catch (error: any) {
      Alert.alert(t('settings.alerts.connectionFailed'), error.message || t('settings.alerts.failedToFetchModels'));
      setAvailableModels([]);
      setFetchedModelsCount(0);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      console.log('Loading categories...');
      const data = await getCategories();
      console.log('Categories loaded:', data.length, 'items');
      setCategories(data);
    } catch (e) {
      console.error('Failed to load categories:', e);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      Alert.alert(t('settings.alerts.validationError'), t('settings.alerts.enterCategoryName'));
      return;
    }
    try {
      await addCategory(name);
      setNewCategoryName('');
      Keyboard.dismiss();
      // realtime will refresh; fallback refresh now
      await loadCategories();
    } catch (e: any) {
      Alert.alert(t('settings.alerts.error'), e?.message || t('settings.alerts.failedToSave', { item: 'category' }));
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    console.log('Delete button clicked for category:', name, 'id:', id);
    console.log('Session status:', !!session);
    
    if (!session) {
      console.log('No session, showing error');
      Alert.alert(t('settings.alerts.error'), t('settings.alerts.mustBeLoggedIn'));
      return;
    }
    
    console.log('Showing confirmation dialog');

    Alert.alert(
      t('settings.categories.deleteTitle'),
      t('settings.categories.deleteMessage', { name }),
      [
        { text: t('settings.categories.cancel'), style: 'cancel' },
        {
          text: t('settings.categories.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Calling deleteCategory with id:', id);
              const result = await deleteCategory(id);
              console.log('deleteCategory returned:', result);
              console.log('Reloading categories...');
              // Immediately update the UI without waiting for realtime
              await loadCategories();
              console.log('Categories reloaded successfully');
            } catch (e: any) {
              console.error('Error during delete:', e);
              Alert.alert(t('settings.alerts.error'), e?.message || t('settings.alerts.failedToSave', { item: 'category' }));
            }
          },
        },
      ]
    );
  };

  const handleSaveOpenAIConfig = async () => {
    console.log('[Settings] Save button pressed');
    console.log('[Settings] Current values:', {
      openaiUrl,
      hasApiKey: !!openaiKey,
      receiptModel,
      chatModel,
      fallbackModel,
    });

    if (!openaiUrl.trim() || !openaiKey.trim()) {
      console.log('[Settings] Validation failed: Missing URL or Key');
      Alert.alert(t('settings.alerts.validationError'), t('settings.alerts.enterBothApiCredentials'));
      return;
    }

    if (!receiptModel) {
      console.log('[Settings] Validation failed: Missing receipt model');
      Alert.alert(t('settings.alerts.validationError'), t('settings.alerts.selectReceiptModel'));
      return;
    }

    if (!chatModel) {
      console.log('[Settings] Validation failed: Missing chat model');
      Alert.alert(t('settings.alerts.validationError'), t('settings.alerts.selectChatModel'));
      return;
    }

    try {
      console.log('[Settings] Starting to save config...');
      const config: Omit<OpenAIConfig, 'userId'> = {
        apiUrl: openaiUrl,
        apiKey: openaiKey,
        receiptModel: receiptModel,
        chatModel: chatModel,
        fallbackModel: fallbackModel,
      };

      console.log('[Settings] Config object created:', {
        ...config,
        apiKey: '***HIDDEN***'
      });

      console.log('[Settings] Calling saveOpenAIConfig...');
      await saveOpenAIConfig(config);
      console.log('[Settings] saveOpenAIConfig completed successfully');
      Alert.alert(t('settings.alerts.success'), t('settings.alerts.configSaved'));
    } catch (error: any) {
      console.error('[Settings] Error saving config:', error);
      Alert.alert(t('settings.alerts.error'), error.message || t('settings.alerts.failedToSave', { item: 'configuration' }));
    }
  };

  function handleSignOut() {
    Alert.alert(
      t('settings.signOut.title'),
      t('settings.signOut.message'),
      [
        { text: t('settings.signOut.cancel'), style: 'cancel' },
        {
          text: t('settings.signOut.confirm'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
              Alert.alert('Info', t('settings.signOut.demoMode'));
            }
          },
        },
      ]
    );
  }

  const openExternalLink = async (url: string) => {
    if (!url) {
      Alert.alert(t('settings.alerts.error') || 'Error', 'Link not configured yet');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(t('settings.alerts.error') || 'Error', `Unable to open: ${url}`);
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      console.error('Failed to open URL:', url, e);
      Alert.alert(t('settings.alerts.error') || 'Error', e?.message || 'Failed to open link');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <RefreshableScrollView 
        style={styles.content} 
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          try {
            // Reload settings data
            const config = await getOpenAIConfig();
            if (config) {
              setOpenaiUrl(config.apiUrl);
              setReceiptModel(config.receiptModel);
              setChatModel(config.chatModel);
              setFallbackModel(config.fallbackModel);
            }
            // Reload categories
            await loadCategories();
            // Reload currencies
            await loadCurrencies();
            // Reload budgets
            await loadBudgetData();
          } catch (error) {
            console.error('Error refreshing settings:', error);
          } finally {
            setRefreshing(false);
          }
        }}
      >
        {/* Profile Settings - Collapsible */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('profile')}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons
                name={expandedSection === 'profile' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={Colors.primary}
              />
              <Ionicons name="person-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.collapsibleHeaderTitle}>{t('settings.profile.title')}</Text>
            </View>
          </TouchableOpacity>

          {expandedSection === 'profile' && (
            <View style={styles.collapsibleContent}>
              <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings.profile.userName')}</Text>
            <TextInput
              style={styles.textInput}
              value={fullName}
              onChangeText={setFullName}
              placeholder={t('settings.profile.userNamePlaceholder')}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, !EMAIL_EDITABLE && { color: Colors.textSecondary }]}>{t('settings.profile.email')}</Text>
            <TextInput
              style={[styles.textInput, !EMAIL_EDITABLE && styles.disabledTextInput]}
              value={email}
              onChangeText={setEmail}
              placeholder={t('settings.profile.emailPlaceholder')}
              placeholderTextColor={Colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={EMAIL_EDITABLE}
            />
            <Text style={[styles.helperText, !EMAIL_EDITABLE && { color: Colors.textSecondary }]}>{t('settings.profile.emailHelper')}</Text>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.inputLabel}>{t('settings.profile.currency')}</Text>
              <TouchableOpacity 
                style={styles.selectInput}
                onPress={() => setShowCurrencyModal(true)}
              >
                <Text style={selectedCurrency ? styles.selectText : styles.selectPlaceholder}>
                  {selectedCurrency 
                    ? `${currencyOptions.find(c => c.code === selectedCurrency)?.symbol}  ${selectedCurrency}`
                    : t('settings.profile.currencyPlaceholder')}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.inputLabel}>{t('settings.profile.language')}</Text>
              <TouchableOpacity 
                style={styles.selectInput}
                onPress={() => setShowLanguageModal(true)}
              >
                <Text style={styles.selectText}>{language}</Text>
                <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings.profile.monthlyBudget')}</Text>
            <View style={styles.amountInput}>
              <TouchableOpacity
                style={styles.monthChip}
                onPress={() => setShowBudgetMonthModal(true)}
              >
                <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                <Text style={styles.monthChipText}>{formatBudgetMonth(selectedBudgetMonth)}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.currencySymbol}>{currencySymbol}</Text>
              <TextInput
                style={styles.amountField}
                value={monthlyBudget}
                onChangeText={(val) => { setMonthlyBudget(val); setIsDefaultBudget(false); }}
                keyboardType="numeric"
                placeholder="0"
              />
              {isDefaultBudget && (
                <Text style={styles.helperText}>
                  {t('settings.profile.usingDefaultBudget', { symbol: currencySymbol, amount: Number(DEFAULT_MONTHLY_BUDGET).toLocaleString() })}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
            <Text style={styles.saveButtonText}>{t('settings.profile.saveButton')}</Text>
          </TouchableOpacity>
            </View>
          )}
        </View>

        {/* OpenAI Configuration - Collapsible */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('openai')}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons
                name={expandedSection === 'openai' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={Colors.primary}
              />
              <Ionicons name="sparkles-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.collapsibleHeaderTitle}>{t('settings.openai.title')}</Text>
            </View>
          </TouchableOpacity>

          {expandedSection === 'openai' && (
            <View style={styles.collapsibleContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('settings.openai.apiUrl')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={openaiUrl}
                  onChangeText={setOpenaiUrl}
                  placeholder="https://api.openai.com/v1"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('settings.openai.apiKey')}</Text>
                <View style={styles.keyInputContainer}>
                  <TextInput
                    style={styles.keyInput}
                    value={openaiKey}
                    onChangeText={setOpenaiKey}
                    placeholder="sk-..."
                    secureTextEntry={!showApiKey}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity 
                    style={styles.keyVisibilityButton}
                    onPress={() => setShowApiKey(!showApiKey)}
                  >
                    <Ionicons 
                      name={showApiKey ? "eye-outline" : "eye-off-outline"} 
                      size={20} 
                      color={Colors.textSecondary} 
                    />
                  </TouchableOpacity>
                </View>
              </View>

                {/* Model Selection Collapsible Section */}
              <View style={styles.collapsibleSection}>
                <TouchableOpacity 
                  style={styles.modelSelectionHeader}
                  onPress={toggleModelSelection}
                >
                  <View style={styles.collapsibleHeaderLeft}>
                    <Ionicons 
                      name={showModelSelection ? "chevron-down" : "chevron-forward"} 
                      size={20} 
                      color={Colors.primary} 
                    />
                    <Text style={styles.collapsibleHeaderTitle}>{t('settings.openai.primaryFallback')}</Text>
                  </View>
                  {(receiptModel || chatModel || fallbackModel) && (
                    <View style={styles.modelIndicator}>
                      <Text style={styles.modelIndicatorText}>
                        {receiptModel ? '1' : ''}{chatModel ? '+1' : ''}{fallbackModel ? '+1' : ''}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {showModelSelection && (
                  <View style={{ marginTop: 6 }}>
                    {/* Fetch Models Button */}
                    <View style={{ alignItems: 'center' }}>
                      <TouchableOpacity 
                        style={[styles.signOutPill, { backgroundColor: Colors.primary }, loadingModels && styles.modelsPillDisabled]}
                        onPress={handleFetchModels}
                        disabled={loadingModels}
                      >
                        <Ionicons name="refresh-outline" size={16} color={Colors.white} />
                        <Text style={styles.signOutPillText}>{t('settings.openai.fetchModels')}</Text>
                        {loadingModels && <ActivityIndicator color={Colors.white} style={{ marginLeft: 8 }} />}
                      </TouchableOpacity>
                      {fetchedModelsCount > 0 && (
                        <View style={[styles.versionPill, { marginTop: 12 }]}>
                          <Text style={styles.versionPillText}>{t('settings.openai.foundModels', { count: fetchedModelsCount })}</Text>
                        </View>
                      )}
                    </View>

                    {/* Model Selection UI - Always show if we have models or previously selected models */}
                    {(availableModels.length > 0 || receiptModel || chatModel || fallbackModel) && (
                      <>
                        <View style={[styles.inputGroup, {paddingVertical: 8, paddingHorizontal: 10}]}> 
                          <Text style={styles.inputLabel}>
                            {t('settings.openai.receiptModel')} <Text style={styles.required}>{t('settings.openai.required')}</Text>
                          </Text>
                          <TouchableOpacity 
                            style={styles.selectInput}
                            onPress={() => availableModels.length > 0 && setShowReceiptModelModal(true)}
                            disabled={availableModels.length === 0}
                          >
                            <Text style={receiptModel ? styles.selectText : styles.selectPlaceholder}>
                              {receiptModel || (availableModels.length === 0 ? t('settings.openai.fetchFirst') : t('settings.openai.selectModel', { type: t('settings.openai.receiptModel').toLowerCase() }))}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          <Text style={styles.helperText}>{t('settings.openai.receiptModelHelper')}</Text>
                        </View>

                        <View style={[styles.inputGroup, {paddingVertical: 8, paddingHorizontal: 10}]}> 
                          <Text style={styles.inputLabel}>
                            {t('settings.openai.chatModel')} <Text style={styles.required}>{t('settings.openai.required')}</Text>
                          </Text>
                          <TouchableOpacity 
                            style={styles.selectInput}
                            onPress={() => availableModels.length > 0 && setShowChatModelModal(true)}
                            disabled={availableModels.length === 0}
                          >
                            <Text style={chatModel ? styles.selectText : styles.selectPlaceholder}>
                              {chatModel || (availableModels.length === 0 ? t('settings.openai.fetchFirst') : t('settings.openai.selectModel', { type: t('settings.openai.chatModel').toLowerCase() }))}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          <Text style={styles.helperText}>{t('settings.openai.chatModelHelper')}</Text>
                        </View>

                        <View style={[styles.inputGroup, {paddingVertical: 8, paddingHorizontal: 8}]}> 
                          <Text style={styles.inputLabel}>{t('settings.openai.fallbackModel')}</Text>
                          <TouchableOpacity 
                            style={styles.selectInput}
                            onPress={() => availableModels.length > 0 && setShowFallbackModelModal(true)}
                            disabled={availableModels.length === 0}
                          >
                            <Text style={fallbackModel ? styles.selectText : styles.selectPlaceholder}>
                              {fallbackModel || (availableModels.length === 0 ? t('settings.openai.fetchFirst') : t('settings.openai.selectModel', { type: t('settings.openai.fallbackModel').toLowerCase() }))}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          <Text style={styles.helperText}>{t('settings.openai.fallbackModelHelper')}</Text>
                        </View>
                      </>
                    )}

                    {availableModels.length === 0 && !receiptModel && !chatModel && !fallbackModel && !loadingModels && (
                      <View style={styles.infoBox}>
                        <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
                        <Text style={styles.infoText}>
                          {t('settings.openai.infoText')}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Save OpenAI Configuration Button - Outside collapsible section */}
              <TouchableOpacity 
                style={[styles.saveButton, styles.saveOpenaiButton]}
                onPress={handleSaveOpenAIConfig}
              >
                <Text style={styles.saveButtonText}>{t('settings.openai.saveButton')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Custom Categories - Collapsible */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('categories')}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons
                name={expandedSection === 'categories' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={Colors.primary}
              />
              <Ionicons name="pricetag-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.collapsibleHeaderTitle}>{t('settings.categories.title')}</Text>
            </View>
          </TouchableOpacity>

          {expandedSection === 'categories' && (
            <View style={styles.collapsibleContent}>
              <Text style={styles.sectionDescription}>{t('settings.categories.description')}</Text>

              <View style={styles.addCategoryContainer}>
                <TextInput
                  style={styles.addCategoryInput}
                  placeholder={t('settings.categories.placeholder')}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                />
                <TouchableOpacity style={styles.addButton} onPress={handleAddCategory} disabled={!session}>
                  <Text style={styles.addButtonText}>{t('settings.categories.addButton')}</Text>
                </TouchableOpacity>
              </View>

              {loadingCategories ? (
                <ActivityIndicator />
              ) : categories.length === 0 ? (
                <Text style={styles.helperText}>{t('settings.categories.noCategories')}</Text>
              ) : (
                <View style={styles.categoryTags}>
                  {categories.map((category) => (
                    <View key={category.id} style={styles.categoryTag}>
                      <Text style={styles.categoryTagText}>{category.name}</Text>
                      <TouchableOpacity 
                        onPress={() => {
                          console.log('TouchableOpacity pressed for:', category.name);
                          handleDeleteCategory(category.id, category.name);
                        }}
                        disabled={!session}
                        style={styles.deleteButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.6}
                      >
                        <Ionicons 
                          name="close-circle" 
                          size={18} 
                          color={!session ? Colors.textSecondary : '#FF3B30'} 
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Data & Privacy - Collapsible */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('privacy')}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons
                name={expandedSection === 'privacy' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={Colors.primary}
              />
              <Ionicons name="shield-checkmark-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.collapsibleHeaderTitle}>{t('settings.privacy.title')}</Text>
            </View>
          </TouchableOpacity>

          {expandedSection === 'privacy' && (
            <View style={styles.collapsibleContent}>
              {/* Import Data - (disabled / placeholder) */}
              <TouchableOpacity
                style={[styles.menuItem, PRIVACY_DISABLED && { opacity: 0.6 }]}
                disabled={PRIVACY_DISABLED}
              >
                <Ionicons name="cloud-upload-outline" size={20} color={PRIVACY_DISABLED ? Colors.textSecondary : Colors.textPrimary} />
                <Text style={[styles.menuItemText, PRIVACY_DISABLED && { color: Colors.textSecondary }]}>{t('settings.privacy.importData')}</Text>
              </TouchableOpacity>

              {/* Export Data - disabled since download functionality isn't implemented yet */}
              <TouchableOpacity
                // style={[styles.menuItem, PRIVACY_DISABLED && { opacity: 0.6, borderBottomWidth: 0 }]}
                style={[styles.menuItem, PRIVACY_DISABLED && { opacity: 0.6 }]}
                disabled={PRIVACY_DISABLED}
              > 
                <Ionicons name="download-outline" size={20} color={PRIVACY_DISABLED ? Colors.textSecondary : Colors.textPrimary} />
                <Text style={[styles.menuItemText, PRIVACY_DISABLED && { color: Colors.textSecondary }]}>{t('settings.privacy.exportData')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, PRIVACY_DISABLED && { opacity: 0.6, borderBottomWidth: 0 }]}
                disabled={PRIVACY_DISABLED}
              >
                <Ionicons name="lock-closed-outline" size={20} color={PRIVACY_DISABLED ? Colors.textSecondary : Colors.textPrimary} />
                <Text style={[styles.menuItemText, PRIVACY_DISABLED && { color: Colors.textSecondary }]}>{t('settings.privacy.privacySettings')}</Text>
              </TouchableOpacity>

              <View style={styles.privacyInfo}>
                <Text style={styles.privacyText}>
                  {t('settings.privacy.privacyText')}
                </Text>
                {/* <Text style={styles.backupText}>Last backup: Today at 3:24 PM</Text> */}
              </View>
            </View>
          )}
        </View>

        {/* Notifications - Collapsible */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('notifications')}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons
                name={expandedSection === 'notifications' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={Colors.primary}
              />
              <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.collapsibleHeaderTitle}>{t('settings.notifications.title')}</Text>
            </View>
          </TouchableOpacity>

          {expandedSection === 'notifications' && (
            <View style={styles.collapsibleContent}>
              <View style={[styles.settingItem, NOTIFICATIONS_DISABLED && { opacity: 0.6 }]}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingTitle, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.budgetAlerts')}</Text>
                  <Text style={[styles.settingDescription, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.budgetAlertsDesc')}</Text>
                </View>
                <Switch
                  value={budgetAlerts}
                  onValueChange={setBudgetAlerts}
                  disabled={NOTIFICATIONS_DISABLED}
                  trackColor={{ false: Colors.gray300, true: Colors.gray300 }}
                  thumbColor={Colors.white}
                />
              </View>

              <View style={[styles.settingItem, NOTIFICATIONS_DISABLED && { opacity: 0.6 }]}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingTitle, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.dailyReminders')}</Text>
                  <Text style={[styles.settingDescription, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.dailyRemindersDesc')}</Text>
                </View>
                <Switch
                  value={dailyReminders}
                  onValueChange={setDailyReminders}
                  disabled={NOTIFICATIONS_DISABLED}
                  trackColor={{ false: Colors.gray300, true: Colors.gray300 }}
                  thumbColor={Colors.white}
                />
              </View>

              <View style={[styles.settingItem, NOTIFICATIONS_DISABLED && { opacity: 0.6 }]}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingTitle, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.weeklyReports')}</Text>
                  <Text style={[styles.settingDescription, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.weeklyReportsDesc')}</Text>
                </View>
                <Switch
                  value={weeklyReports}
                  onValueChange={setWeeklyReports}
                  disabled={NOTIFICATIONS_DISABLED}
                  trackColor={{ false: Colors.gray300, true: Colors.gray300 }}
                  thumbColor={Colors.white}
                />
              </View>

              <View style={[styles.settingItem, { borderBottomWidth: 0 }, NOTIFICATIONS_DISABLED && { opacity: 0.6 }]}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingTitle, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.marketingEmails')}</Text>
                  <Text style={[styles.settingDescription, NOTIFICATIONS_DISABLED && { color: Colors.textSecondary }]}>{t('settings.notifications.marketingEmailsDesc')}</Text>
                </View>
                <Switch
                  value={marketingEmails}
                  onValueChange={setMarketingEmails}
                  disabled={NOTIFICATIONS_DISABLED}
                  trackColor={{ false: Colors.gray300, true: Colors.gray300 }}
                  thumbColor={Colors.white}
                />
              </View>
            </View>
          )}
        </View>

        {/* App Preferences - Collapsible */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('preferences')}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons
                name={expandedSection === 'preferences' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={Colors.primary}
              />
              <Ionicons name="settings-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.collapsibleHeaderTitle}>{t('settings.preferences.title')}</Text>
            </View>
          </TouchableOpacity>

          {expandedSection === 'preferences' && (
            <View style={styles.collapsibleContent}>

              <View style={[styles.settingItem, PREFERENCES_DISABLED && { opacity: 0.6 }]}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingTitle, PREFERENCES_DISABLED && { color: Colors.textSecondary }]}>{t('settings.preferences.darkMode')}</Text>
                  <Text style={[styles.settingDescription, PREFERENCES_DISABLED && { color: Colors.textSecondary }]}>{t('settings.preferences.darkModeDesc')}</Text>
                </View>
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  disabled={PREFERENCES_DISABLED}
                  trackColor={{ false: Colors.gray300, true: Colors.gray300 }}
                  thumbColor={Colors.white}
                />
              </View>

              <View style={[styles.settingItem, PREFERENCES_DISABLED && { opacity: 0.6 }]}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingTitle, PREFERENCES_DISABLED && { color: Colors.textSecondary }]}>{t('settings.preferences.biometricLogin')}</Text>
                  <Text style={[styles.settingDescription, PREFERENCES_DISABLED && { color: Colors.textSecondary }]}>{t('settings.preferences.biometricLoginDesc')}</Text>
                </View>
                <Switch
                  value={biometricLogin}
                  onValueChange={setBiometricLogin}
                  disabled={PREFERENCES_DISABLED}
                  trackColor={{ false: Colors.gray300, true: Colors.gray300 }}
                  thumbColor={Colors.white}
                />
              </View>

              <View style={[styles.settingItem, { borderBottomWidth: 0 }]}>
                <View style={styles.settingLeft}>
                  <Text style={styles.settingTitle}>{t('settings.preferences.autoSync')}</Text>
                  <Text style={styles.settingDescription}>{t('settings.preferences.autoSyncDesc')}</Text>
                </View>
                <Switch
                  value={autoSync}
                  onValueChange={setAutoSync}
                  trackColor={{ false: Colors.gray300, true: Colors.primary }}
                  thumbColor={Colors.white}
                />
              </View>
            </View>
          )}
        </View>

        {/* Help & Support - Collapsible */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('support')}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons
                name={expandedSection === 'support' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={Colors.primary}
              />
              <Ionicons name="help-circle-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.collapsibleHeaderTitle}>{t('settings.support.title')}</Text>
            </View>
          </TouchableOpacity>

          {expandedSection === 'support' && (
            <View style={styles.collapsibleContent}>
              <TouchableOpacity
                style={[styles.menuItem, !faqUrl && { opacity: 0.6 }]}
                onPress={() => openExternalLink(faqUrl)}
                disabled={!faqUrl}
              >
                <Text style={styles.menuItemText}>{t('settings.support.faq')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, !contactUrl && { opacity: 0.6 }]}
                onPress={() => openExternalLink(contactUrl)}
                disabled={!contactUrl}
              >
                <Text style={styles.menuItemText}>{t('settings.support.contact')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, !tutorialUrl && { opacity: 0.6 }]}
                onPress={() => openExternalLink(tutorialUrl)}
                disabled={!tutorialUrl}
              >
                <Text style={styles.menuItemText}>{t('settings.support.tutorial')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, !termsUrl && { opacity: 0.6 }]}
                onPress={() => openExternalLink(termsUrl)}
                disabled={!termsUrl}
              >
                <Text style={styles.menuItemText}>{t('settings.support.terms')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, !privacyUrl && { opacity: 0.6 }, { borderBottomWidth: 0 }]}
                onPress={() => openExternalLink(privacyUrl)}
                disabled={!privacyUrl}
              >
                <Text style={styles.menuItemText}>{t('settings.support.privacy')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Sign Out - Small Oval Button */}
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <TouchableOpacity style={styles.signOutPill} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={16} color={Colors.white} />
            <Text style={styles.signOutPillText}>{t('settings.signOut.button')}</Text>
          </TouchableOpacity>
        </View>

        {/* Version - Small Gray Oval */}
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <View style={styles.versionPill}>
            <Text style={styles.versionPillText}>
              {t('settings.version', { version: Constants.expoConfig?.extra?.appVersion || Constants.expoConfig?.version || '0.0.0' })}
            </Text>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </RefreshableScrollView>

      {/* Receipt Model Selection Modal */}
      <Modal
        visible={showReceiptModelModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          // Only close if search input is not focused
          if (!receiptSearchFocused) {
            setShowReceiptModelModal(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modelSelectionModalHeader}>
              <Text style={styles.modalTitle}>{t('settings.modals.selectReceiptModel')}</Text>
              <TouchableOpacity onPress={() => setShowReceiptModelModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            {/* Search Input */}
            <View style={styles.modalSearchContainer}>
              <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder={t('settings.modals.searchPlaceholder')}
                value={receiptModelSearch}
                onChangeText={setReceiptModelSearch}
                onFocus={() => setReceiptSearchFocused(true)}
                onBlur={() => setReceiptSearchFocused(false)}
                placeholderTextColor={Colors.textSecondary}
              />
              {receiptModelSearch !== '' && (
                <TouchableOpacity onPress={() => setReceiptModelSearch('')}>
                  <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            
            <ScrollView style={styles.modalList}>
              {availableModels
                .filter(model => 
                  model.id.toLowerCase().includes(receiptModelSearch.toLowerCase()) ||
                  model.owned_by.toLowerCase().includes(receiptModelSearch.toLowerCase())
                )
                .map((model) => (
                <TouchableOpacity
                  key={model.id}
                  style={[
                    styles.modalItem,
                    receiptModel === model.id && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setReceiptModel(model.id);
                    setShowReceiptModelModal(false);
                    setReceiptModelSearch('');
                  }}
                >
                  <View style={styles.modalItemLeft}>
                    <Text style={[
                      styles.modalItemText,
                      receiptModel === model.id && styles.modalItemTextSelected
                    ]}>
                      {model.id}
                    </Text>
                    <Text style={styles.modalItemSubtext}>
                      {model.owned_by}
                    </Text>
                  </View>
                  {receiptModel === model.id && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              {availableModels.filter(model => 
                model.id.toLowerCase().includes(receiptModelSearch.toLowerCase()) ||
                model.owned_by.toLowerCase().includes(receiptModelSearch.toLowerCase())
              ).length === 0 && (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={32} color={Colors.textSecondary} />
                  <Text style={styles.emptySearchText}>{t('settings.modals.noModelsFound')}</Text>
                  <Text style={styles.emptySearchSubtext}>{t('settings.modals.tryDifferentKeywords')}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Chat Model Selection Modal */}
      <Modal
        visible={showChatModelModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          // Only close if search input is not focused
          if (!chatSearchFocused) {
            setShowChatModelModal(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modelSelectionModalHeader}>
              <Text style={styles.modalTitle}>{t('settings.modals.selectChatModel')}</Text>
              <TouchableOpacity onPress={() => setShowChatModelModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            {/* Search Input */}
            <View style={styles.modalSearchContainer}>
              <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder={t('settings.modals.searchPlaceholder')}
                value={chatModelSearch}
                onChangeText={setChatModelSearch}
                onFocus={() => setChatSearchFocused(true)}
                onBlur={() => setChatSearchFocused(false)}
                placeholderTextColor={Colors.textSecondary}
              />
              {chatModelSearch !== '' && (
                <TouchableOpacity onPress={() => setChatModelSearch('')}>
                  <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            
            <ScrollView style={styles.modalList}>
              {availableModels
                .filter(model => 
                  model.id.toLowerCase().includes(chatModelSearch.toLowerCase()) ||
                  model.owned_by.toLowerCase().includes(chatModelSearch.toLowerCase())
                )
                .map((model) => (
                <TouchableOpacity
                  key={model.id}
                  style={[
                    styles.modalItem,
                    chatModel === model.id && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setChatModel(model.id);
                    setShowChatModelModal(false);
                    setChatModelSearch('');
                  }}
                >
                  <View style={styles.modalItemLeft}>
                    <Text style={[
                      styles.modalItemText,
                      chatModel === model.id && styles.modalItemTextSelected
                    ]}>
                      {model.id}
                    </Text>
                    <Text style={styles.modalItemSubtext}>
                      {model.owned_by}
                    </Text>
                  </View>
                  {chatModel === model.id && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              {availableModels.filter(model => 
                model.id.toLowerCase().includes(chatModelSearch.toLowerCase()) ||
                model.owned_by.toLowerCase().includes(chatModelSearch.toLowerCase())
              ).length === 0 && (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={32} color={Colors.textSecondary} />
                  <Text style={styles.emptySearchText}>{t('settings.modals.noModelsFound')}</Text>
                  <Text style={styles.emptySearchSubtext}>{t('settings.modals.tryDifferentKeywords')}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Fallback Model Selection Modal */}
      <Modal
        visible={showFallbackModelModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          // Only close if search input is not focused
          if (!fallbackSearchFocused) {
            setShowFallbackModelModal(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modelSelectionModalHeader}>
              <Text style={styles.modalTitle}>{t('settings.modals.selectFallbackModel')}</Text>
              <TouchableOpacity onPress={() => setShowFallbackModelModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            {/* Search Input */}
            <View style={styles.modalSearchContainer}>
              <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder={t('settings.modals.searchPlaceholder')}
                value={fallbackModelSearch}
                onChangeText={setFallbackModelSearch}
                onFocus={() => setFallbackSearchFocused(true)}
                onBlur={() => setFallbackSearchFocused(false)}
                placeholderTextColor={Colors.textSecondary}
              />
              {fallbackModelSearch !== '' && (
                <TouchableOpacity onPress={() => setFallbackModelSearch('')}>
                  <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            
            <ScrollView style={styles.modalList}>
              {(fallbackModelSearch === '' || !fallbackModelSearch) && (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    !fallbackModel && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setFallbackModel('');
                    setShowFallbackModelModal(false);
                    setFallbackModelSearch('');
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    !fallbackModel && styles.modalItemTextSelected
                  ]}>
                    {t('settings.modals.none')}
                  </Text>
                  {!fallbackModel && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              
              {availableModels
                .filter(model => 
                  model.id !== receiptModel && model.id !== chatModel &&
                  (model.id.toLowerCase().includes(fallbackModelSearch.toLowerCase()) ||
                   model.owned_by.toLowerCase().includes(fallbackModelSearch.toLowerCase()))
                )
                .map((model) => (
                  <TouchableOpacity
                    key={model.id}
                    style={[
                      styles.modalItem,
                      fallbackModel === model.id && styles.modalItemSelected
                    ]}
                    onPress={() => {
                      setFallbackModel(model.id);
                      setShowFallbackModelModal(false);
                      setFallbackModelSearch('');
                    }}
                  >
                    <View style={styles.modalItemLeft}>
                      <Text style={[
                        styles.modalItemText,
                        fallbackModel === model.id && styles.modalItemTextSelected
                      ]}>
                        {model.id}
                      </Text>
                      <Text style={styles.modalItemSubtext}>
                        {model.owned_by}
                      </Text>
                    </View>
                    {fallbackModel === model.id && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              {availableModels.filter(model => 
                model.id !== receiptModel && model.id !== chatModel &&
                (model.id.toLowerCase().includes(fallbackModelSearch.toLowerCase()) ||
                 model.owned_by.toLowerCase().includes(fallbackModelSearch.toLowerCase()))
              ).length === 0 && fallbackModelSearch !== '' && (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={32} color={Colors.textSecondary} />
                  <Text style={styles.emptySearchText}>{t('settings.modals.noModelsFound')}</Text>
                  <Text style={styles.emptySearchSubtext}>{t('settings.modals.tryDifferentKeywords')}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Budget Month Selection Modal */}
      <Modal
        visible={showBudgetMonthModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBudgetMonthModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.modals.selectBudgetMonth')}</Text>
              <TouchableOpacity onPress={() => setShowBudgetMonthModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalList}>
              {budgetMonthOptions.map((monthKey) => {
                const entry = findBudgetForMonth(monthKey);
                const monthlyAmount = entry
                  ? (entry.period === 'monthly' ? entry.amount : entry.amount / 12)
                  : null;
                return (
                  <TouchableOpacity
                    key={monthKey}
                    style={[
                      styles.modalItem,
                      selectedBudgetMonth === monthKey && styles.modalItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedBudgetMonth(monthKey);
                      setShowBudgetMonthModal(false);
                    }}
                  >
                    <View>
                      <Text
                        style={[
                          styles.modalItemText,
                          selectedBudgetMonth === monthKey && styles.modalItemTextSelected,
                        ]}
                      >
                        {formatBudgetMonth(monthKey)}
                      </Text>
                      <Text style={styles.currencySubtext}>
                        {monthlyAmount != null ? (
                          t('settings.modals.setBudget', { symbol: currencySymbol, amount: monthlyAmount.toLocaleString() })
                        ) : (
                          `${t('settings.modals.noBudgetSet')} · ${t('settings.profile.usingDefaultBudget', { symbol: currencySymbol, amount: Number(DEFAULT_MONTHLY_BUDGET).toLocaleString() })}`
                        )}
                      </Text>
                    </View>
                    {selectedBudgetMonth === monthKey && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.languages.en')}/{t('settings.languages.zh')}</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalList}>
              {languageOptions.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.modalItem,
                    currentLanguage === lang.code && styles.modalItemSelected
                  ]}
                  onPress={() => handleLanguageChange(lang.code)}
                >
                  <Text style={[
                    styles.modalItemText,
                    currentLanguage === lang.code && styles.modalItemTextSelected
                  ]}>
                    {lang.name}
                  </Text>
                  {currentLanguage === lang.code && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Currency Selection Modal */}
      <Modal
        visible={showCurrencyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.modals.selectCurrency')}</Text>
              <TouchableOpacity onPress={() => setShowCurrencyModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalList}>
              {currencyOptions.map((currency) => (
                <TouchableOpacity
                  key={currency.code}
                  style={[
                    styles.modalItem,
                    selectedCurrency === currency.code && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setSelectedCurrency(currency.code);
                    setShowCurrencyModal(false);
                  }}
                >
                  <View>
                    <Text style={[
                      styles.modalItemText,
                      selectedCurrency === currency.code && styles.modalItemTextSelected
                    ]}>
                      {currency.symbol}
                    </Text>
                    <Text style={styles.currencySubtext}>{currency.name}</Text>
                  </View>
                  {selectedCurrency === currency.code && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const INPUT_HEIGHT = 44;

const styles = StyleSheet.create({
    modelSelectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 48,
      backgroundColor: Colors.white,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 1,
    paddingHorizontal: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  textInput: {
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: INPUT_HEIGHT,
    fontSize: 15,
    color: Colors.textPrimary,
    textAlignVertical: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  selectInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: INPUT_HEIGHT,
  },
  selectText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: INPUT_HEIGHT,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginRight: 8,
  },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray200,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    gap: 6,
  },
  monthChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  amountField: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    textAlignVertical: 'center',
  },
  saveButton: {
    backgroundColor: Colors.textPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveOpenaiButton: {
    marginTop: 16,
    marginBottom: 0,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  settingLeft: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  disabledTextInput: {
    opacity: 0.8,
    color: Colors.textSecondary,
  },
  addCategoryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 1,
    paddingHorizontal: 4,
  },
  addCategoryInput: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: INPUT_HEIGHT,
    fontSize: 15,
    textAlignVertical: 'center',
  },
  addButton: {
    backgroundColor: Colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  categoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 12,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 7,
    gap: -2,
  },
  categoryTagText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  deleteButton: {
    padding: 2,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    // justifyContent: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 5,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  menuItemText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  privacyInfo: {
    marginTop: 16,
    paddingTop: 4,
    paddingLeft: 4,
    paddingRight: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  privacyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  backupText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  signOutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 6,
    minHeight: 28,
    minWidth: 80,
    gap: 6,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  signOutPillText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
    paddingLeft: 2,
    paddingRight: 2,
  },
  versionPill: {
    backgroundColor: Colors.gray200,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 80,
  },
  versionPillText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
    paddingLeft: 2,
    paddingRight: 2,
  },
  // OpenAI Configuration Styles
  modelsPillDisabled: {
    backgroundColor: Colors.gray300,
  },
  required: {
    color: Colors.error,
  },
  selectPlaceholder: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.gray50,
    padding: 4,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    marginTop: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  modelSelectionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    height: 64,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalList: {
    maxHeight: 400,
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: INPUT_HEIGHT,
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    textAlignVertical: 'center',
  },
  emptySearchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptySearchText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySearchSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  modalItemSelected: {
    backgroundColor: Colors.gray50,
  },
  modalItemLeft: {
    flex: 1,
  },
  modalItemText: {
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalItemTextSelected: {
    fontWeight: '600',
    color: Colors.primary,
  },
  modalItemSubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  // API Key Input Styles
  keyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: INPUT_HEIGHT,
  },
  keyInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    textAlignVertical: 'center',
    // Remove padding here as it's on the container
  },
  keyVisibilityButton: {
    // The parent container handles alignment
    padding: 8, // Restore padding for touch area
    marginLeft: 4, // Slight margin
  },
  // Collapsible Section Styles
  collapsibleSection: {
    marginTop: 12,
    backgroundColor: Colors.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 0.5,
    paddingHorizontal: 1,
    backgroundColor: Colors.white,
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  collapsibleHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  collapsibleContent: {
    backgroundColor: Colors.gray50,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  modelIndicator: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modelIndicatorText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  // Model Summary Styles
  modelSummary: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: Colors.gray50,
    borderRadius: 8,
    gap: 8,
  },
  modelSummaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelSummaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modelSummaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
  },
  currencySubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    marginLeft: 4,
  },
});
