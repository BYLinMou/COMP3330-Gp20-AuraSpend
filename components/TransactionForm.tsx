import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput as RNTextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { TextInput as GestureTextInput } from 'react-native-gesture-handler';
import { Colors } from '../constants/theme';
import { useLanguage } from '../src/providers/LanguageProvider';
import { getCategories, type Category } from '../src/services/categories';
import { getCurrencies, type Currency } from '../src/services/currencies';
import { getPaymentMethods, type PaymentMethod } from '../src/services/payment-methods';

export interface TransactionFormValues {
  is_income?: boolean;
  amount: number;
  occurred_at: Date;
  merchant: string | null;
  category_id: string | null;
  note: string | null;
  payment_method: string | null;
  currency: string | null;
  items: Array<{
    id?: string;
    name: string;
    amount: number;
    price: number;
  }>;
}

interface TransactionFormProps {
  initialValues?: Partial<TransactionFormValues>;
  onSubmit: (values: TransactionFormValues) => void | Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  loading?: boolean;
}

interface ItemEditingState {
  [key: number]: { nameStr?: string; amountStr?: string; priceStr?: string };
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  loading = false,
}) => {
  const { t } = useLanguage();
  const [isIncome, setIsIncome] = useState(
    initialValues?.is_income ?? (initialValues?.amount ? initialValues.amount > 0 : false)
  );
  const [amount, setAmount] = useState(initialValues?.amount ? Math.abs(initialValues.amount).toString() : '');
  const [occurredAt, setOccurredAt] = useState(initialValues?.occurred_at || new Date());
  const [merchant, setMerchant] = useState(initialValues?.merchant || '');
  const [categoryId, setCategoryId] = useState(initialValues?.category_id || '');
  const [note, setNote] = useState(initialValues?.note || '');
  const [paymentMethod, setPaymentMethod] = useState(initialValues?.payment_method || '');
  const [currency, setCurrency] = useState(initialValues?.currency || '');
  const [itemlist, setItemlist] = useState(initialValues?.items || []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrenciesState] = useState<Currency[]>([]);
  const [paymentMethods, setPaymentMethodsState] = useState<PaymentMethod[]>([]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);

  const [itemEditingState, setItemEditingState] = useState<ItemEditingState>({});
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Load dropdowns on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [catsData, currData, pmData] = await Promise.all([
          getCategories(),
          getCurrencies(),
          getPaymentMethods(),
        ]);
        setCategories(catsData);
        setCurrenciesState(currData);
        setPaymentMethodsState(pmData);
      } catch (error) {
        console.error('Error loading form data:', error);
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, []);

  const handleDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'dismissed') return;
      if (date && !isNaN(date.getTime())) {
        setOccurredAt(date);
        setTimeout(() => setShowTimePicker(true), 100);
      }
    } else {
      if (date && !isNaN(date.getTime())) {
        setOccurredAt(date);
      }
    }
  };

  const handleTimeChange = (event: any, time?: Date) => {
    setShowTimePicker(false);
    if (event.type === 'dismissed') return;
    if (time && !isNaN(time.getTime())) {
      const newDateTime = new Date(occurredAt);
      newDateTime.setHours(time.getHours());
      newDateTime.setMinutes(time.getMinutes());
      setOccurredAt(newDateTime);
    }
  };

  const handleSubmit = async () => {
    try {
      const parsedAmount = parseFloat(amount);
      if (!amount.trim() || !Number.isFinite(parsedAmount)) {
        Alert.alert(t('add.validationError'), t('add.enterAmount'));
        return;
      }
      // if (!merchant.trim()) {
      //   Alert.alert('Validation', 'Merchant is required');
      //   return;
      // }

      setSubmitting(true);
      const finalAmount = isIncome ? Math.abs(parsedAmount) : -Math.abs(parsedAmount);
      
      const values: TransactionFormValues = {
        amount: finalAmount,
        is_income: isIncome,
        occurred_at: occurredAt,
        merchant: merchant.trim(),
        category_id: categoryId || null,
        note: note.trim() || null,
        payment_method: paymentMethod || null,
        currency: currency || null,
        items: itemlist.map(item => ({
          ...item,
          name: item.name.trim() || 'Item',
        })),
      };

      await onSubmit(values);
    } catch (error) {
      console.error('Error submitting form:', error);
      Alert.alert(t('home.error'), t('add.failedToSave'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Transaction Details Card */}
      <View style={styles.card}>
        {/* Income/Expense Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, isIncome && styles.toggleButtonActive, isIncome && { backgroundColor: Colors.success }]}
            onPress={() => setIsIncome(true)}
          >
            <Text style={[styles.toggleButtonText, isIncome && styles.toggleButtonTextActive]}>
              {t('home.income') || 'Income'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, !isIncome && styles.toggleButtonActive, !isIncome && { backgroundColor: Colors.error }]}
            onPress={() => setIsIncome(false)}
          >
            <Text style={[styles.toggleButtonText, !isIncome && styles.toggleButtonTextActive]}>
              {t('home.expense') || 'Expense'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Amount with Inline Currency Selector */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            {t('add.amount')} <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.amountInput}>
            <TouchableOpacity
              style={styles.currencySelector}
              onPress={() => !loading && setShowCurrencyModal(true)}
              disabled={loading}
            >
              <Text style={styles.currencySymbol}>
                {currency ? currencies.find(c => c.code === currency)?.symbol : '$'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
            <RNTextInput
              style={styles.amountField}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              editable={!loading}
            />
          </View>
        </View>

        {/* Date & Time */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            {t('add.dateTime')} <Text style={styles.required}>*</Text>
          </Text>
          {Platform.OS === 'web' ? (
            <input
              type="datetime-local"
              value={occurredAt.toISOString().slice(0, 16)}
              onChange={(e) => {
                const newDate = new Date(e.target.value);
                if (!isNaN(newDate.getTime())) {
                  setOccurredAt(newDate);
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
                width: '100%',
              }}
            />
          ) : (
            <>
              <TouchableOpacity
                style={styles.dateInputContainer}
                onPress={() => !loading && setShowDatePicker(true)}
                disabled={loading}
              >
                <View style={styles.dateTextInput}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={styles.dateValueText}>
                    {occurredAt.toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={occurredAt}
                  mode={Platform.OS === 'ios' ? 'datetime' : 'date'}
                  display="default"
                  onChange={handleDateChange}
                  maximumDate={new Date()}
                />
              )}
              {showTimePicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={occurredAt}
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
          <Text style={styles.inputLabel}>{t('add.category')}</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => !loading && setShowCategoryModal(true)}
            disabled={loading}
          >
            <Text style={categoryId ? styles.selectValue : styles.selectPlaceholder}>
              {categories.find(c => c.id === categoryId)?.name || t('add.noCategory')}
            </Text>
            <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Item List */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('add.itemList')}</Text>
          {itemlist.length > 0 && (
            <>
              <Text style={styles.itemListSubtext}>{t('add.swipeLeftToDelete')}</Text>
              <View style={styles.itemListHeader}>
                <Text style={[styles.itemHeaderText, { flex: 1 }]}>{t('add.item')}</Text>
                <Text style={[styles.itemHeaderText, { width: 30 }]}>{t('add.qty')}</Text>
                <Text style={[styles.itemHeaderText, { width: 40 }]}>{t('add.price')}</Text>
                <Text style={[styles.itemHeaderText, { width: 50 }]}>{t('add.total')}</Text>
              </View>
            </>
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
                    <Text style={styles.swipeDeleteText}>{t('home.delete')}</Text>
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
                    placeholder={t('add.itemName')}
                    value={item.name}
                    onChangeText={(text) => {
                      const newList = [...itemlist];
                      newList[index].name = text;
                      setItemlist(newList);
                    }}
                    scrollEnabled={false}
                    numberOfLines={1}
                    editable={!loading}
                  />
                  <GestureTextInput
                    style={[styles.itemInputSmall, { width: 25 }]}
                    placeholder="1"
                    keyboardType="decimal-pad"
                    scrollEnabled={false}
                    numberOfLines={1}
                    value={itemEditingState[index]?.amountStr ?? item.amount.toString()}
                    onChangeText={(text) => {
                      setItemEditingState(prev => ({
                        ...prev,
                        [index]: { ...prev[index], amountStr: text }
                      }));
                    }}
                    onBlur={() => {
                      const rawValue = itemEditingState[index]?.amountStr;
                      if (rawValue !== undefined) {
                        const normalized = rawValue.replace(/,/g, '.');
                        const parsed = parseFloat(normalized);
                        const newList = [...itemlist];
                        newList[index].amount = !isNaN(parsed) && parsed > 0 ? parsed : 1;
                        setItemlist(newList);
                        setItemEditingState(prev => {
                          const updated = { ...prev };
                          if (updated[index]) {
                            delete updated[index].amountStr;
                          }
                          return updated;
                        });
                      }
                    }}
                    editable={!loading}
                  />
                  <GestureTextInput
                    style={[styles.itemInputSmall, { width: 35 }]}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    scrollEnabled={false}
                    numberOfLines={1}
                    value={itemEditingState[index]?.priceStr ?? item.price.toString()}
                    onChangeText={(text) => {
                      setItemEditingState(prev => ({
                        ...prev,
                        [index]: { ...prev[index], priceStr: text }
                      }));
                    }}
                    onBlur={() => {
                      const rawValue = itemEditingState[index]?.priceStr;
                      if (rawValue !== undefined) {
                        const normalized = rawValue.replace(/,/g, '.');
                        const parsed = parseFloat(normalized);
                        const newList = [...itemlist];
                        newList[index].price = !isNaN(parsed) && parsed >= 0 ? parsed : 0;
                        setItemlist(newList);
                        setItemEditingState(prev => {
                          const updated = { ...prev };
                          if (updated[index]) {
                            delete updated[index].priceStr;
                          }
                          return updated;
                        });
                      }
                    }}
                    editable={!loading}
                  />
                  <View style={[styles.itemTotal, { width: 50 }]}>
                    <Text style={styles.itemTotalText} numberOfLines={1} adjustsFontSizeToFit>
                      {currency ? currencies.find(c => c.code === currency)?.symbol : '$'}
                      {(item.amount * item.price).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </Swipeable>
            );
          })}
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setItemlist([...itemlist, { name: '', amount: 1, price: 0 }])}
            disabled={loading}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.addItemText}>{t('add.addItem')}</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Method */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('add.paymentMethod')}</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => !loading && setShowPaymentMethodModal(true)}
            disabled={loading}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              {paymentMethod ? (
                <>
                  {(() => {
                    const selectedMethod = paymentMethods.find(m => m.id === paymentMethod);
                    return selectedMethod?.icon ? (
                      <Ionicons name={selectedMethod.icon as any} size={18} color={Colors.primary} />
                    ) : (
                      <Ionicons name="card-outline" size={18} color={Colors.primary} />
                    );
                  })()}
                  <Text style={styles.selectValue}>
                    {paymentMethods.find(p => p.id === paymentMethod)?.name || paymentMethod}
                  </Text>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="wallet-outline" size={18} color={Colors.gray300} />
                  <Text style={styles.selectPlaceholder}>{t('add.selectPaymentMethod')}</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Merchant */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            {t('add.merchant')}
            {/* Merchant <Text style={styles.required}>*</Text> */}
          </Text>
          <RNTextInput
            style={styles.textInput}
            placeholder={t('add.enterMerchantName')}
            value={merchant}
            onChangeText={setMerchant}
            editable={!loading}
          />
        </View>

        {/* Notes */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('add.notes')}</Text>
          <RNTextInput
            style={[styles.textInput, styles.notesInput]}
            placeholder={t('add.addNotes')}
            multiline
            numberOfLines={3}
            value={note}
            onChangeText={setNote}
            editable={!loading}
          />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          disabled={loading || submitting}
        >
          <Text style={styles.cancelButtonText}>{t('home.cancel')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, (loading || submitting) && styles.saveButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.saveButtonText}>{submitLabel}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Category Modal */}
      <Modal
        visible={showCategoryModal}
        animationType="slide"
        transparent
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
              <TouchableOpacity
                style={[styles.modalItem, !categoryId && styles.modalItemSelected]}
                onPress={() => {
                  setCategoryId('');
                  setShowCategoryModal(false);
                }}
              >
                <Text style={[styles.modalItemText, !categoryId && styles.modalItemTextSelected]}>
                  {t('add.noCategory')}
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.modalItem, categoryId === cat.id && styles.modalItemSelected]}
                  onPress={() => {
                    setCategoryId(cat.id);
                    setShowCategoryModal(false);
                  }}
                >
                  <Text style={[styles.modalItemText, categoryId === cat.id && styles.modalItemTextSelected]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Currency Modal */}
      <Modal
        visible={showCurrencyModal}
        animationType="slide"
        transparent
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
              {currencies.map((cur) => (
                <TouchableOpacity
                  key={cur.code}
                  style={[styles.modalItem, currency === cur.code && styles.modalItemSelected]}
                  onPress={() => {
                    setCurrency(cur.code);
                    setShowCurrencyModal(false);
                  }}
                >
                  <Text style={[styles.modalItemText, currency === cur.code && styles.modalItemTextSelected]}>
                    {cur.symbol} {cur.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Payment Method Modal */}
      <Modal
        visible={showPaymentMethodModal}
        animationType="slide"
        transparent
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
              <TouchableOpacity
                style={[styles.modalItem, !paymentMethod && styles.modalItemSelected]}
                onPress={() => {
                  setPaymentMethod('');
                  setShowPaymentMethodModal(false);
                }}
              >
                <Text style={[styles.modalItemText, !paymentMethod && styles.modalItemTextSelected]}>
                  {t('add.notSpecified')}
                </Text>
              </TouchableOpacity>
              {paymentMethods.map((pm) => (
                <TouchableOpacity
                  key={pm.id}
                  style={[styles.modalItem, paymentMethod === pm.id && styles.modalItemSelected]}
                  onPress={() => {
                    setPaymentMethod(pm.id);
                    setShowPaymentMethodModal(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {pm.icon && <Ionicons name={pm.icon as any} size={20} color={Colors.textSecondary} />}
                    <Text style={[styles.modalItemText, paymentMethod === pm.id && styles.modalItemTextSelected]}>
                      {pm.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleButtonActive: {
    // backgroundColor set inline for specific colors
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  toggleButtonTextActive: {
    color: Colors.white,
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  itemListSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
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
    marginRight: 8,
    textAlign: 'center',
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
    justifyContent: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
    marginTop: 4,
  },
  addItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.textPrimary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray300,
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
});
