import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput as RNTextInput, Alert, ActivityIndicator, Modal, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/theme';
import { RefreshableScrollView } from '../../components/refreshable-scroll-view';
import { useLanguage } from '../../src/providers/LanguageProvider';
import { addTransaction } from '../../src/services/transactions';
import { addReceiptItems } from '../../src/services/items';
import { getCategories, addCategory, subscribeToCategoryChanges, type Category } from '../../src/services/categories';
import { getCurrencies, type Currency } from '../../src/services/currencies';
import { getPaymentMethods, type PaymentMethod } from '../../src/services/payment-methods';
import { processReceiptImage, type ReceiptData, type ProcessingProgress } from '../../src/services/receipt-processor';
import { useAuth } from '../../src/providers/AuthProvider';
import { useCurrency } from '../../src/providers/CurrencyProvider';
import { TextInput as GestureTextInput } from 'react-native-gesture-handler';

type InputMethod = 'manual' | 'receipt';

interface ReceiptItem {
  name: string;
  amount: number;  // quantity
  price: number;   // unit price
}

export default function AddScreen() {
  const { t } = useLanguage();
  const { session } = useAuth();
  const { currencyCode: primaryCurrencyCode } = useCurrency();
  const [inputMethod, setInputMethod] = useState<InputMethod>('receipt');
  const [amount, setAmount] = useState('');
  const [itemlist, setItemlist] = useState<ReceiptItem[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [userOverrodeAmount, setUserOverrodeAmount] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Categories and loading states
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<Currency[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  
  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState<string>('');
  const [pendingReceiptData, setPendingReceiptData] = useState<ReceiptData | null>(null);
  
  // Editing state for item inputs (string values while typing)
  const [itemEditingState, setItemEditingState] = useState<{
    [key: string]: { amountStr?: string; priceStr?: string };
  }>({});

  // Auto-calculate amount from itemlist (only if user hasn't manually overridden)
  useEffect(() => {
    if (itemlist.length > 0 && !userOverrodeAmount) {
      const total = itemlist.reduce((sum, item) => sum + (item.price * item.amount), 0);
      setAmount(total.toFixed(2));
    }
  }, [itemlist, userOverrodeAmount]);

  // Reset override flag when itemlist becomes empty
  useEffect(() => {
    if (itemlist.length === 0) {
      setUserOverrodeAmount(false);
      setItemEditingState({});
    }
  }, [itemlist]);

  // Load categories on mount and subscribe to realtime changes
  useEffect(() => {
    loadCategories();
    loadCurrencies();
    loadPaymentMethods();
  }, []);

  // Subscribe to category changes for realtime updates
  useEffect(() => {
    if (!session) return;
    let unsub: undefined | (() => Promise<void>);
    (async () => {
      try {
        console.log('[Add] Subscribing to category changes...');
        unsub = await subscribeToCategoryChanges((change) => {
          console.log('[Add] Category change received:', {
            eventType: change.eventType,
            newCategory: change.new?.name,
            oldCategory: change.old?.name,
            currentlySelected: categoryId,
          });
          
          // If a category is deleted and it's currently selected, clear the selection
          if (change.eventType === 'DELETE' && change.old?.id === categoryId) {
            console.log('[Add] Currently selected category was deleted, clearing selection');
            setCategoryId('');
          }
          // Reload categories for any event (INSERT, UPDATE, DELETE)
          console.log('[Add] Reloading categories after', change.eventType);
          loadCategories();
        });
        console.log('[Add] Successfully subscribed to category changes');
      } catch (e) {
        console.warn('[Add] Category realtime subscription failed:', e);
      }
    })();
    return () => {
      if (unsub) {
        console.log('[Add] Unsubscribing from category changes');
        unsub().catch(() => {});
      }
    };
  }, [categoryId, session]);

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await getCategories();
      setCategories(data);
      // Don't auto-select a category - let user explicitly choose
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCurrencies = async () => {
    try {
      const data = await getCurrencies();
      setCurrencyOptions(data);
      // Set default currency to user's primary currency
      if (!selectedCurrency && primaryCurrencyCode) {
        setSelectedCurrency(primaryCurrencyCode);
      }
      console.log('[Add] Loaded currencies:', data);
    } catch (error) {
      console.error('Failed to load currencies:', error);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const data = await getPaymentMethods();
      setPaymentMethods(data);
      console.log('[Add] Loaded payment methods:', data);
    } catch (error) {
      console.error('Failed to load payment methods:', error);
    }
  };

  const handleDateChange = (event: any, date?: Date) => {
    console.log('[DatePicker] Event:', event);
    console.log('[DatePicker] Selected Date:', date);
    
    try {
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
        
        if (event.type === 'dismissed') {
          console.log('[DatePicker] User cancelled');
          return;
        }
        
        if (date && !isNaN(date.getTime())) {
          // On Android: first select date, then show time picker
          setSelectedDate(date);
          console.log('[DatePicker] Date selected, now showing time picker');
          // Show time picker after a short delay
          setTimeout(() => setShowTimePicker(true), 100);
        }
      } else {
        // iOS: datetime mode works fine
        if (date && !isNaN(date.getTime())) {
          setSelectedDate(date);
        }
      }
    } catch (e) {
      console.error('[DatePicker] Error:', e);
      setShowDatePicker(false);
    }
  };

  const handleTimeChange = (event: any, time?: Date) => {
    console.log('[TimePicker] Event:', event);
    console.log('[TimePicker] Selected Time:', time);
    
    try {
      setShowTimePicker(false);
      
      if (event.type === 'dismissed') {
        console.log('[TimePicker] User cancelled');
        return;
      }
      
      if (time && !isNaN(time.getTime())) {
        // Combine the selected date with the selected time
        const newDateTime = new Date(selectedDate);
        newDateTime.setHours(time.getHours());
        newDateTime.setMinutes(time.getMinutes());
        newDateTime.setSeconds(0);
        newDateTime.setMilliseconds(0);
        
        console.log('[TimePicker] Final datetime:', newDateTime);
        setSelectedDate(newDateTime);
      }
    } catch (e) {
      console.error('[TimePicker] Error:', e);
      setShowTimePicker(false);
    }
  };

  const handleImagePick = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert(t('add.permissionRequired'), t('add.allowPhotoAccess'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        await handleReceiptImageProcessing(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('add.error'), t('add.failedToSelectImage'));
    }
  };

  const handleCameraPick = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert(t('add.permissionRequired'), t('add.allowCameraAccess'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        await handleReceiptImageProcessing(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('add.error'), t('add.failedToTakePhoto'));
    }
  };

  /**
   * Process receipt image: call the independent receipt processor
   * @param imageUri - Local URI of the image
   */
  const handleReceiptImageProcessing = async (imageUri: string) => {
    try {
      setProcessingReceipt(true);

      // 调用独立的收据处理器（来自 receipt-processor.ts）
      const receiptData = await processReceiptImage(imageUri, (progress: ProcessingProgress) => {
        console.log('[Add Screen]', `${progress.message} (${progress.progress}%)`);
      });

      console.log('[Add Screen] Receipt data received:', receiptData);
      console.log('[Add Screen] isNewCategory:', receiptData.isNewCategory);
      console.log('[Add Screen] category:', receiptData.category);

      // Auto-fill the form
      setMerchant(receiptData.merchant);
      setAmount(receiptData.amount.toString());
      
      // Set currency (if detected by AI)
      if (receiptData.currency) {
        setSelectedCurrency(receiptData.currency);
        console.log('[Add Screen] Currency detected:', receiptData.currency);
      }
      
      // Set payment method (if detected by AI)
      if (receiptData.payment_method) {
        setSelectedPaymentMethod(receiptData.payment_method);
        console.log('[Add Screen] Payment method detected:', receiptData.payment_method);
      }
      
      // 如果是字符串数组（旧格式），转换为 ReceiptItem 数组
      if (receiptData.items && Array.isArray(receiptData.items) && receiptData.items.length > 0) {
        const firstItem = receiptData.items[0];
        if (typeof firstItem === 'object' && firstItem !== null && 'name' in firstItem) {
          // 已经是 ReceiptItem 格式
          setItemlist(receiptData.items as unknown as ReceiptItem[]);
        } else if (typeof firstItem === 'string') {
          // 字符串数组，转换为 ReceiptItem 格式
          const convertedItems: ReceiptItem[] = (receiptData.items as unknown as string[]).map(name => ({
            name,
            amount: 1,
            price: 0,
          }));
          setItemlist(convertedItems);
        }
      }
      
      // 合并 description 到 notes
      if (receiptData.description) {
        setNotes(receiptData.description);
      }
      
      if (receiptData.date) {
        // Parse the datetime string (YYYY-MM-DDTHH:MM format) into Date object
        setSelectedDate(new Date(receiptData.date));
      }

      // 处理分类建议
      if (receiptData.category) {
        if (receiptData.isNewCategory) {
          // AI 建议了新分类，显示确认对话框（Web 兼容）
          console.log('[Add Screen] Showing new category confirmation modal');
          setSuggestedCategory(receiptData.category);
          setPendingReceiptData(receiptData);
          setShowNewCategoryModal(true);
        } else {
          // 使用现有分类
          const matchedCategory = categories.find(
            cat => cat.name.toLowerCase() === receiptData.category!.toLowerCase()
          );
          if (matchedCategory) {
            setCategoryId(matchedCategory.id);
          }
          if (Platform.OS === 'web') {
            alert('✅ Receipt information extracted! Please review the details and save.');
          } else {
            Alert.alert(
              '✅ Success', 
              'Receipt information extracted! Please review the details and save.',
              [{ text: 'OK' }]
            );
          }
        }
      } else {
        if (Platform.OS === 'web') {
          alert('✅ Receipt information extracted! Please select a category and save.');
        } else {
          Alert.alert(
            '✅ Success', 
            'Receipt information extracted! Please select a category and save.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error: any) {
      console.error('[Add Screen] Receipt processing error:', error);
      Alert.alert(
        '❌ Processing Failed',
        error?.message || 'Failed to process receipt. Please enter details manually.',
        [{ text: 'OK' }]
      );
    } finally {
      setProcessingReceipt(false);
    }
  };

  const handleSaveTransaction = async () => {
    // Check authentication first
    if (!session) {
      console.warn('[Save Transaction] Blocked: no active session');
      Alert.alert(t('add.authRequired'), t('add.pleaseSignIn'));
      return;
    }

    // Validation
    if (itemlist.length === 0 && (!amount || isNaN(parseFloat(amount)))) {
      console.warn('[Save Transaction] Blocked: no items or invalid amount');
      Alert.alert(t('add.validationError'), t('add.enterAmountOrItems'));
      return;
    }

    try {
      setSubmitting(true);

      // Convert amount to negative for expenses
      const numericAmount = -Math.abs(parseFloat(amount));

      // Determine source based on input method
      let source: 'manual' | 'ocr' | 'ai' = 'manual';
      if (inputMethod === 'receipt') {
        source = 'ocr';
      }

      // 构建商家名称
      let merchantName = merchant.trim();
      if (!merchantName && itemlist.length > 0) {
        // 如果没有商家，用第一个项目名称作为 fallback
        merchantName = itemlist[0].name || 'Transaction';
      }
      if (!merchantName) {
        merchantName = 'Transaction';
      }

      const transactionData = {
        amount: numericAmount,
        occurred_at: selectedDate.toISOString(),
        merchant: merchantName,
        category_id: categoryId || null,
        source,
        note: notes.trim(),
        payment_method: selectedPaymentMethod || null,
        currency: selectedCurrency || 'HKD',
      };

      console.log('Saving transaction:', transactionData);
      const result = await addTransaction(transactionData);
      console.log('Transaction saved successfully:', result);

      // 如果有分项条目，插入到 items 表
      if (itemlist.length > 0) {
        try {
          console.log('[Save Transaction] Inserting receipt items...');
          await addReceiptItems(result.id, itemlist.map(i => ({
            name: i.name,
            amount: i.amount,
            price: i.price,
          })));
          console.log('[Save Transaction] Receipt items inserted successfully');
        } catch (e) {
          console.error('[Save Transaction] 插入条目失败 (仍然保存了交易):', e);
        }
      }

      Alert.alert(t('add.success'), t('add.transactionSavedSuccessfully'), [
        {
          text: t('add.ok'),
          onPress: () => {
            // Reset form
            setAmount('');
            setItemlist([]);
            setMerchant('');
            setNotes('');
            setSelectedDate(new Date());
            setSelectedPaymentMethod('');
            setUserOverrodeAmount(false);
          },
        },
      ]);
    } catch (error: any) {
      console.error('Failed to save transaction:', error);
      const errorMessage = error?.message || t('add.failedToSaveTransaction');
      Alert.alert(t('add.error'), errorMessage);
    } finally {
      console.log('[Save Transaction] Submit flow finished');
      setSubmitting(false);
    }
  };

  const handleCreateNewCategory = async () => {
    try {
      console.log('[Add Screen] Creating new category:', suggestedCategory);
      const newCategory = await addCategory(suggestedCategory);
      setCategoryId(newCategory.id);
      await loadCategories(); // 重新加载分类列表
      setShowNewCategoryModal(false);
      
      if (Platform.OS === 'web') {
        alert(t('add.categoryCreatedSuccess', { name: suggestedCategory }));
      } else {
        Alert.alert(
          t('add.success'),
          t('add.categoryCreatedSuccess', { name: suggestedCategory }),
          [{ text: t('add.ok') }]
        );
      }
    } catch (error: any) {
      console.error('Failed to create category:', error);
      setShowNewCategoryModal(false);

      if (Platform.OS === 'web') {
        alert(t('add.categoryCreationFailed', { message: error?.message }));
      } else {
        Alert.alert(
          t('add.categoryCreationFailed'),
          error?.message || t('add.failedToCreateCategory'),
          [{ text: t('add.ok') }]
        );
      }
    }
  };

  const handleSkipNewCategory = () => {
    console.log('[Add Screen] User skipped creating new category');
    setShowNewCategoryModal(false);
    
    if (Platform.OS === 'web') {
      alert('✅ Receipt information extracted! Please select a category and save.');
    } else {
      Alert.alert(
        '✅ Success', 
        'Receipt information extracted! Please select a category and save.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <RefreshableScrollView 
        style={styles.content}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          try {
            await Promise.all([
              loadCategories(),
              loadCurrencies(),
              loadPaymentMethods(),
            ]);
          } catch (error) {
            console.error('Error refreshing add screen data:', error);
          } finally {
            setRefreshing(false);
          }
        }}
      >
        {/* Input Method Selector */}
        <View style={styles.methodSelector}>
          <TouchableOpacity
            style={[
              styles.methodButton,
              inputMethod === 'manual' && styles.methodButtonActive,
            ]}
            onPress={() => setInputMethod('manual')}
          >
            <View style={styles.methodButtonContent}>
              <Ionicons
                name="cash-outline"
                size={20}
                color={inputMethod === 'manual' ? Colors.white : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.methodLabel,
                  inputMethod === 'manual' && styles.methodLabelActive,
                ]}
              >
                Manual
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.methodButton,
              inputMethod === 'receipt' && styles.methodButtonActive,
            ]}
            onPress={() => setInputMethod('receipt')}
          >
            <View style={styles.methodButtonContent}>
              <Ionicons
                name="camera-outline"
                size={20}
                color={inputMethod === 'receipt' ? Colors.white : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.methodLabel,
                  inputMethod === 'receipt' && styles.methodLabelActive,
                ]}
              >
                Receipt
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Receipt Upload Area */}
        {inputMethod === 'receipt' && (
          <View style={styles.uploadArea}>
            <View style={styles.uploadHeaderRow}>
              <Ionicons name="cloud-upload-outline" size={28} color={Colors.primary} />
              <Text style={styles.uploadText}>Upload a receipt or take a photo</Text>
            </View>
            <View style={styles.uploadButtonRow}>
              <TouchableOpacity 
                style={[styles.uploadButton, processingReceipt && styles.uploadButtonDisabled]} 
                onPress={handleImagePick}
                disabled={processingReceipt}
              >
                <Ionicons name="images-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.uploadButtonText}>{t('add.chooseFile')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.uploadButton, processingReceipt && styles.uploadButtonDisabled]} 
                onPress={handleCameraPick}
                disabled={processingReceipt}
              >
                <Ionicons name="camera-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.uploadButtonText}>{t('add.takePhoto')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Transaction Details Form */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('add.transactionDetails')}</Text>

          {/* Amount with Inline Currency Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {t('add.amount')} <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.amountInput}>
              <TouchableOpacity
                style={styles.currencySelector}
                onPress={() => setShowCurrencyModal(true)}
              >
                <Text style={styles.currencySymbol}>
                  {selectedCurrency ? currencyOptions.find(c => c.code === selectedCurrency)?.symbol : '$'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              <RNTextInput
                style={styles.amountField}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={(text) => {
                  setAmount(text);
                  if (itemlist.length > 0) {
                    setUserOverrodeAmount(true);
                  }
                }}
              />
            </View>
            <Text style={styles.currencySubtext}>
              {t('add.amountCalculationInfo')}
            </Text>
          </View>

          {/* Date & Time (occurred_at) */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('add.dateTime')} <Text style={styles.required}>*</Text></Text>
            {Platform.OS === 'web' ? (
              <input
                type="datetime-local"
                value={(() => {
                  try {
                    return selectedDate.toISOString().slice(0, 16);
                  } catch (e) {
                    console.error('Date formatting error:', e);
                    return new Date().toISOString().slice(0, 16);
                  }
                })()}
                onChange={(e) => {
                  try {
                    const newDate = new Date(e.target.value);
                    if (!isNaN(newDate.getTime())) {
                      setSelectedDate(newDate);
                    }
                  } catch (e) {
                    console.error('Date parsing error:', e);
                  }
                }}
                max={new Date().toISOString().slice(0, 16)}
                style={{
                  backgroundColor: Colors.gray100,
                  borderRadius: 8,
                  padding: 14,
                  fontSize: 15,
                  color: Colors.textPrimary,
                  border: 'none',
                  fontFamily: 'system-ui',
                }}
              />
            ) : (
              <>
                <TouchableOpacity 
                  style={styles.dateInputContainer}
                  onPress={() => setShowDatePicker(true)}
                >
                  <View style={styles.dateTextInput}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                    <Text style={styles.dateValueText}>
                      {(() => {
                        try {
                          return selectedDate.toLocaleString('en-US', { 
                            month: '2-digit', 
                            day: '2-digit', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          });
                        } catch (e) {
                          console.error('Date formatting error:', e);
                          return 'Invalid date';
                        }
                      })()}
                    </Text>
                  </View>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date()}
                    mode={Platform.OS === 'android' ? 'date' : 'datetime'}
                    display="default"
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                  />
                )}
                {showTimePicker && Platform.OS === 'android' && (
                  <DateTimePicker
                    value={selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date()}
                    mode="time"
                    display="default"
                    onChange={handleTimeChange}
                  />
                )}
              </>
            )}
          </View>

          {/* Category */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Category</Text>
            <TouchableOpacity 
              style={styles.selectInput}
              onPress={() => setShowCategoryModal(true)}
              disabled={loadingCategories}
            >
              <Text style={categoryId ? styles.selectValue : styles.selectPlaceholder}>
                {categoryId 
                  ? categories.find(c => c.id === categoryId)?.name || t('add.noCategory')
                  : t('add.noCategory')}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Item List */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('add.itemList')} ({t('add.optional')})</Text>
            {itemlist.length > 0 && (
              <Text style={styles.itemListSubtext}>
                {t('add.swipeToDelete')}
              </Text>
            )}
            {/* {itemlist.length === 0 && (
              <View style={styles.emptyItemListPlaceholder}>
                <Ionicons name="list-outline" size={32} color={Colors.gray300} />
                <Text style={styles.emptyItemListText}>No items added yet</Text>
                <Text style={styles.emptyItemListSubtext}>Add items to break down your transaction</Text>
              </View>
            )} */}
            {itemlist.length > 0 && (
              <View style={styles.itemListHeader}>
                <Text style={[styles.itemHeaderText, { flex: 1 }]}>{t('add.item')}</Text>
                <Text style={[styles.itemHeaderText, { width: 30 }]}>{t('add.qty')}</Text>
                <Text style={[styles.itemHeaderText, { width: 40 }]}>{t('add.price')}</Text>
                <Text style={[styles.itemHeaderText, { width: 50 }]}>{t('add.total')}</Text>
              </View>
            )}
            {itemlist.map((item, index) => {
              const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
                const trans = dragX.interpolate({
                  inputRange: [-80, 0],
                  outputRange: [0, 80],
                  extrapolate: 'clamp',
                });
                return (
                  <Animated.View
                    style={[
                      styles.swipeDeleteContainer,
                      { transform: [{ translateX: trans }] },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.swipeDeleteButton}
                      onPress={() => setItemlist(itemlist.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.white} />
                      <Text style={styles.swipeDeleteText}>{t('add.Delete')}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              };

              return (
                <Swipeable
                  key={index}
                  renderRightActions={renderRightActions}
                  overshootRight={false}
                  friction={2}
                  enableTrackpadTwoFingerGesture
                >
                  <View style={styles.itemRow}>
                    <GestureTextInput
                      style={styles.itemInput}
                      placeholder={t('add.itemNamePlaceholder')}
                      value={item.name}
                      onChangeText={(text) => {
                        const newList = [...itemlist];
                        newList[index].name = text;
                        setItemlist(newList);
                      }}
                      scrollEnabled={false}
                      numberOfLines={1}
                    />
                    <GestureTextInput
                      style={[styles.itemInputSmall, { width: 25 }]}
                      placeholder={t('add.qtyPlaceholder')}
                      keyboardType="decimal-pad"
                      scrollEnabled={false}
                      numberOfLines={1}
                      value={itemEditingState[index]?.amountStr ?? item.amount.toString()}
                      onChangeText={(text) => {
                        // Store raw input string while typing
                        setItemEditingState(prev => ({
                          ...prev,
                          [index]: { ...prev[index], amountStr: text }
                        }));
                      }}
                      onBlur={() => {
                        // Parse and validate on blur
                        const rawValue = itemEditingState[index]?.amountStr;
                        if (rawValue !== undefined) {
                          const normalized = rawValue.replace(/,/g, '.');
                          const parsed = parseFloat(normalized);
                          const newList = [...itemlist];
                          newList[index].amount = !isNaN(parsed) && parsed > 0 ? parsed : 1;
                          setItemlist(newList);
                          // Clear editing state for this field
                          setItemEditingState(prev => {
                            const updated = { ...prev };
                            if (updated[index]) {
                              delete updated[index].amountStr;
                            }
                            return updated;
                          });
                        }
                      }}
                    />
                    <GestureTextInput
                      style={[styles.itemInputSmall, { width: 35 }]}
                      placeholder={t('add.pricePlaceholder')}
                      keyboardType="decimal-pad"
                      scrollEnabled={false}
                      numberOfLines={1}
                      value={itemEditingState[index]?.priceStr ?? item.price.toString()}
                      onChangeText={(text) => {
                        // Store raw input string while typing
                        setItemEditingState(prev => ({
                          ...prev,
                          [index]: { ...prev[index], priceStr: text }
                        }));
                      }}
                      onBlur={() => {
                        // Parse and validate on blur
                        const rawValue = itemEditingState[index]?.priceStr;
                        if (rawValue !== undefined) {
                          const normalized = rawValue.replace(/,/g, '.');
                          const parsed = parseFloat(normalized);
                          const newList = [...itemlist];
                          newList[index].price = !isNaN(parsed) && parsed >= 0 ? parsed : 0;
                          setItemlist(newList);
                          // Clear editing state for this field
                          setItemEditingState(prev => {
                            const updated = { ...prev };
                            if (updated[index]) {
                              delete updated[index].priceStr;
                            }
                            return updated;
                          });
                        }
                      }}
                    />
                    <View style={[styles.itemTotal, { width: 50 }]}>
                      <Text style={styles.itemTotalText} numberOfLines={1} adjustsFontSizeToFit>
                        {selectedCurrency ? currencyOptions.find(c => c.code === selectedCurrency)?.symbol : '$'}{(item.amount * item.price).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </Swipeable>
              );
            })}
            <TouchableOpacity
              style={styles.addItemButton}
              onPress={() => setItemlist([...itemlist, { name: '', amount: 1, price: 0 }])}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.addItemText}>{t('add.addItem')}</Text>
            </TouchableOpacity>
          </View>

          {/* Payment Method */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('add.paymentMethod')} ({t('add.optional')})</Text>
            <TouchableOpacity 
              style={styles.selectInput}
              onPress={() => setShowPaymentMethodModal(true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {selectedPaymentMethod ? (
                  <>
                    {(() => {
                      const selectedMethod = paymentMethods.find(m => m.name === selectedPaymentMethod);
                      return selectedMethod?.icon ? (
                        <Ionicons name={selectedMethod.icon as any} size={18} color={Colors.primary} />
                      ) : (
                        <Ionicons name="card-outline" size={18} color={Colors.primary} />
                      );
                    })()}
                    <Text style={styles.selectValue}>
                      {selectedPaymentMethod}
                    </Text>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="wallet-outline" size={18} color={Colors.gray300} />
                    <Text style={styles.selectPlaceholder}>
                      {t('add.selectPaymentMethodPlaceholder')}
                    </Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Merchant */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('add.merchant')} ({t('add.optional')})</Text>
            <RNTextInput
              style={styles.textInput}
              placeholder={t('add.merchantPlaceholder')}
              value={merchant}
              onChangeText={setMerchant}
            />
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('add.notes')} ({t('add.optional')})</Text>
            <RNTextInput
              style={[styles.textInput, styles.notesInput]}
              placeholder={t('add.notesPlaceholder')}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Transaction Summary */}
          {/* <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Amount:</Text>
              <Text style={styles.summaryAmount}>
                {selectedCurrency ? currencyOptions.find(c => c.code === selectedCurrency)?.symbol : '$'}{amount || '0.00'}
              </Text>
            </View>
            {itemlist.length > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Items:</Text>
                <Text style={styles.summaryValue}>{itemlist.length}</Text>
              </View>
            )}
            {categoryId && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Category:</Text>
                <Text style={styles.summaryValue}>{categories.find(c => c.id === categoryId)?.name}</Text>
              </View>
            )}
            {selectedPaymentMethod && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payment:</Text>
                <Text style={styles.summaryValue}>{selectedPaymentMethod}</Text>
              </View>
            )}
          </View> */}

          {/* Save Button */}
          <TouchableOpacity 
            style={[styles.saveButton, submitting && styles.saveButtonDisabled]} 
            onPress={handleSaveTransaction}
            disabled={submitting || !session}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>{t('add.saveTransaction')}</Text>
            )}
          </TouchableOpacity>
          {!session && (
            <Text style={styles.warningText}>{t('add.pleaseSignInToSave')}</Text>
          )}
        </View>

        <View style={{ height: 20 }} />
      </RefreshableScrollView>

      {/* Category Selection Modal */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add.selectCategory')}</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalList}>
              {loadingCategories ? (
                <ActivityIndicator style={styles.modalLoading} />
              ) : (
                <>
                  {/* No Category Option */}
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      !categoryId && styles.modalItemSelected
                    ]}
                    onPress={() => {
                      setCategoryId('');
                      setShowCategoryModal(false);
                    }}
                  >
                    <Text style={[
                      styles.modalItemText,
                      !categoryId && styles.modalItemTextSelected
                    ]}>
                      {t('add.noCategory')}
                    </Text>
                    {!categoryId && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                  
                  {/* User Categories */}
                  {categories.length === 0 ? (
                    <Text style={styles.emptyText}>{t('add.noCustomCategories')}</Text>
                  ) : (
                    categories.map((category) => (
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.modalItem,
                          categoryId === category.id && styles.modalItemSelected
                        ]}
                        onPress={() => {
                          setCategoryId(category.id);
                          setShowCategoryModal(false);
                        }}
                      >
                        <Text style={[
                          styles.modalItemText,
                          categoryId === category.id && styles.modalItemTextSelected
                        ]}>
                          {category.name}
                        </Text>
                        {categoryId === category.id && (
                          <Ionicons name="checkmark" size={20} color={Colors.primary} />
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}
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
              <Text style={styles.modalTitle}>{t('add.selectCurrency')}</Text>
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

      {/* Payment Method Selection Modal */}
      <Modal
        visible={showPaymentMethodModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentMethodModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add.selectPaymentMethod')}</Text>
              <TouchableOpacity onPress={() => setShowPaymentMethodModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalList}>
              {/* No Payment Method Option */}
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  !selectedPaymentMethod && styles.modalItemSelected
                ]}
                onPress={() => {
                  setSelectedPaymentMethod('');
                  setShowPaymentMethodModal(false);
                }}
              >
                <Text style={[
                  styles.modalItemText,
                  !selectedPaymentMethod && styles.modalItemTextSelected
                ]}>
                  {t('add.notSpecified')}
                </Text>
                {!selectedPaymentMethod && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>

              {paymentMethods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.modalItem,
                    selectedPaymentMethod === method.name && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setSelectedPaymentMethod(method.name);
                    setShowPaymentMethodModal(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {method.icon && (
                      <Ionicons name={method.icon as any} size={20} color={Colors.textSecondary} />
                    )}
                    <Text style={[
                      styles.modalItemText,
                      selectedPaymentMethod === method.name && styles.modalItemTextSelected
                    ]}>
                      {method.name}
                    </Text>
                  </View>
                  {selectedPaymentMethod === method.name && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* New Category Confirmation Modal */}
      <Modal
        visible={showNewCategoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewCategoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmModalTitleRow}>
              <Ionicons name="sparkles" size={26} color={Colors.primary} />
              <Text style={styles.confirmModalTitle}>🤖 AI Suggestion</Text>
            </View>
            
            <Text style={styles.confirmModalMessage}>
              AI suggests creating a new category:{'\n'}
              <Text style={styles.confirmModalCategory}>"{suggestedCategory}"</Text>
              {'\n\n'}Would you like to create this category?
            </Text>
            
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity 
                style={[styles.confirmModalButton, styles.confirmModalButtonSecondary]}
                onPress={handleSkipNewCategory}
              >
                <Text style={styles.confirmModalButtonTextSecondary}>No, Skip</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmModalButton, styles.confirmModalButtonPrimary]}
                onPress={handleCreateNewCategory}
              >
                <Text style={styles.confirmModalButtonTextPrimary}>Yes, Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Processing Receipt Modal */}
      <Modal
        visible={processingReceipt}
        transparent
        animationType="fade"
      >
        <View style={styles.processingOverlay}>
          <View style={styles.processingModalContent}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.processingModalText}>Processing receipt...</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  methodButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gray200,
  },
  methodButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodButtonActive: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  methodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  methodLabelActive: {
    color: Colors.white,
  },
  uploadArea: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  uploadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  uploadIcon: {
    marginBottom: 12,
  },
  uploadText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 0,
    textAlign: 'center',
    lineHeight: 18,
  },
  uploadButtonRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  required: {
    color: Colors.error,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  currencySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 4,
    borderRadius: 6,
    gap: 4,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  amountField: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingHorizontal: 4,
  },
  textInput: {
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  selectInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectPlaceholder: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  selectValue: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateTextInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateValueText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  saveButton: {
    backgroundColor: Colors.textPrimary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  warningText: {
    fontSize: 12,
    color: Colors.error,
    textAlign: 'center',
    marginTop: 8,
  },
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalList: {
    maxHeight: 400,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  modalItemSelected: {
    backgroundColor: Colors.gray50,
  },
  modalItemText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  modalItemTextSelected: {
    fontWeight: '600',
    color: Colors.primary,
  },
  modalLoading: {
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  customInputContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  customInput: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  customInputButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  customInputButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  commonMerchantsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  debugInfo: {
    backgroundColor: Colors.gray100,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  debugText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },
  itemListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  itemHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemInput: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimary,
    marginRight: 8,
  },
  itemInputSmall: {
    backgroundColor: Colors.gray100,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontSize: 12,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginRight: 8,
  },
  itemTotal: {
    backgroundColor: Colors.gray50,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  itemTotalText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  swipeHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  itemListSubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  swipeDeleteContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  swipeDeleteButton: {
    backgroundColor: Colors.error,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  swipeDeleteText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    marginTop: 8,
    paddingTop: 12,
  },
  addItemText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  confirmModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 30,
    marginHorizontal: 20,
    alignItems: 'center',
    maxWidth: 400,
    alignSelf: 'center',
  },
  confirmModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  confirmModalMessage: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  confirmModalCategory: {
    fontWeight: '700',
    color: Colors.primary,
    fontSize: 18,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  confirmModalButtonSecondary: {
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  confirmModalButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  confirmModalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  currencySubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    marginLeft: 4,
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  processingModalText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  emptyItemListPlaceholder: {
    backgroundColor: Colors.gray50,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gray200,
    borderStyle: 'dashed',
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  emptyItemListText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyItemListSubtext: {
    fontSize: 13,
    color: Colors.gray400,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: Colors.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  summaryValue: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
