import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  Animated,
  Modal,
  ScrollView,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLanguage } from '@/src/providers/LanguageProvider';
import { Colors } from '@/constants/theme';
import { EditTransactionModal } from '../components/EditTransactionModal';
import {
  getAllTransactions,
  filterTransactions,
  getTransactionStats,
  deleteTransaction,
  type Transaction,
  type TransactionFilter,
} from '@/src/services/transactions';
import { getItemsByTransaction, type ItemRow } from '@/src/services/items';
import { getCategories, type Category } from '@/src/services/categories';
import { getPaymentMethods, type PaymentMethod } from '@/src/services/payment-methods';
import { getMonthlyBudgetAmount } from '@/src/services/budgets';
import { useCurrency } from '@/src/providers/CurrencyProvider';
import FloatingChatButton from '../components/floating-chat-button';

type SourceType = 'all' | 'manual' | 'ocr' | 'ai';

// Helper function to format relative time
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

export default function AllTransactionsScreen() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const { currencySymbol, currencyCode, convertToUserCurrency } = useCurrency();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [convertedAmounts, setConvertedAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [transactionItems, setTransactionItems] = useState<Record<string, ItemRow[]>>({});
  const [monthlyBudget, setMonthlyBudget] = useState<number>(0);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const blurAnimRef = React.useRef<{ [key: string]: Animated.Value }>({});
  
  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceType>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchTransactions();
    fetchFilterOptions();
    fetchBudget();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, transactions, selectedCategories, selectedPaymentMethods, selectedSource, minAmount, maxAmount, startDate, endDate]);

  const fetchTransactions = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      const data = await getAllTransactions();
      setTransactions(data);
      await convertTransactionAmounts(data);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      Alert.alert('Error', 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [cats, methods] = await Promise.all([
        getCategories(),
        getPaymentMethods(),
      ]);
      setCategories(cats);
      setPaymentMethods(methods);
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  };

  const fetchBudget = async () => {
    try {
      const budget = await getMonthlyBudgetAmount();
      setMonthlyBudget(budget);
    } catch (error) {
      console.error('Failed to fetch budget:', error);
    }
  };

  async function convertTransactionAmounts(transactions: Transaction[]) {
    try {
      const amounts: Record<string, number> = {};
      await Promise.all(
        transactions.map(async (transaction) => {
          if (transaction.currency && transaction.currency !== currencyCode) {
            const result = await convertToUserCurrency(Math.abs(transaction.amount), transaction.currency);
            amounts[transaction.id] = transaction.amount >= 0 ? result.convertedAmount : -result.convertedAmount;
          } else {
            amounts[transaction.id] = transaction.amount;
          }
        })
      );
      setConvertedAmounts(amounts);
      return amounts;
    } catch (error) {
      console.error('Failed to convert transaction amounts:', error);
      return {};
    }
  }

  // Calculate stats using converted amounts
  const getConvertedStats = (transactions: Transaction[]) => {
    const transactionIncome = transactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => {
        const convertedAmount = convertedAmounts[t.id] ?? t.amount;
        return sum + convertedAmount;
      }, 0);

    const expense = transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => {
        const convertedAmount = convertedAmounts[t.id] ?? t.amount;
        return sum + Math.abs(convertedAmount);
      }, 0);

    return {
      totalIncome: transactionIncome,
      totalExpense: expense,
      balance: transactionIncome - expense,
      count: transactions.length,
    };
  };

  const applyFilters = () => {
    let filtered = [...transactions];

    // Apply search query
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.merchant?.toLowerCase().includes(query) ||
          t.category?.name?.toLowerCase().includes(query) ||
          t.note?.toLowerCase().includes(query) ||
          t.items?.some((item) => item.item_name.toLowerCase().includes(query))
      );
    }

    // Apply category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((t) => 
        t.category_id && selectedCategories.includes(t.category_id)
      );
    }

    // Apply payment method filter
    if (selectedPaymentMethods.length > 0) {
      filtered = filtered.filter((t) => 
        t.payment_method && selectedPaymentMethods.includes(t.payment_method)
      );
    }

    // Apply source filter
    if (selectedSource !== 'all') {
      filtered = filtered.filter((t) => t.source === selectedSource);
    }

    // Apply amount range filter
    const min = minAmount ? parseFloat(minAmount) : null;
    const max = maxAmount ? parseFloat(maxAmount) : null;
    if (min !== null) {
      filtered = filtered.filter((t) => Math.abs(t.amount) >= min);
    }
    if (max !== null) {
      filtered = filtered.filter((t) => Math.abs(t.amount) <= max);
    }

    // Apply date range filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((t) => new Date(t.occurred_at) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((t) => new Date(t.occurred_at) <= end);
    }

    setFilteredTransactions(filtered);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategories([]);
    setSelectedPaymentMethods([]);
    setSelectedSource('all');
    setMinAmount('');
    setMaxAmount('');
    setStartDate('');
    setEndDate('');
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (selectedCategories.length > 0) count++;
    if (selectedPaymentMethods.length > 0) count++;
    if (selectedSource !== 'all') count++;
    if (minAmount || maxAmount) count++;
    if (startDate || endDate) count++;
    return count;
  };

  const stats = getConvertedStats(filteredTransactions);
  
  // Balance = budget - expenses
  const displayBalance = monthlyBudget - stats.totalExpense;

  const renderTransaction = ({ item }: { item: Transaction }) => {
    if (!blurAnimRef.current[item.id]) {
      blurAnimRef.current[item.id] = new Animated.Value(0);
    }
    const blurAnim = blurAnimRef.current[item.id];

    return (
      <Pressable
        onPress={async () => {
          if (expandedTransactionId === item.id) {
            setExpandedTransactionId(null);
          } else {
            setExpandedTransactionId(item.id);
            // Fetch items for this transaction if not already available
            if (!transactionItems[item.id] && !item.items) {
              try {
                const items = await getItemsByTransaction(item.id);
                setTransactionItems(prev => ({
                  ...prev,
                  [item.id]: items
                }));
              } catch (error) {
                console.error('Failed to fetch transaction items:', error);
              }
            }
          }
        }}
        onPressIn={() => {
          Animated.timing(blurAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false,
          }).start();
        }}
        onPressOut={() => {
          Animated.timing(blurAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: false,
          }).start();
        }}
      >
        <Animated.View style={[
          styles.transactionItem,
          expandedTransactionId === item.id && styles.transactionItemExpanded,
          {
            opacity: blurAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.5],
            }),
          }
        ]}>
          <View style={styles.transactionLeft}>
            <Text style={styles.transactionName}>
              {item.merchant || 'Transaction'}
            </Text>
            <Text style={styles.transactionTime}>
              {getRelativeTime(item.occurred_at)}
            </Text>
          </View>
          <View style={styles.transactionRight}>
            <Text
              style={[
                styles.transactionAmount,
                item.amount > 0 ? styles.incomeAmount : styles.expenseAmount,
              ]}
            >
              {(() => {
                const displayAmount = convertedAmounts[item.id] ?? item.amount;
                const showOriginal = item.currency && item.currency !== currencyCode;
                return (
                  <>
                    {item.amount > 0 ? '+' : ''}{currencySymbol}{Math.abs(displayAmount).toFixed(2)}
                    {showOriginal && (
                      <Text style={styles.originalCurrencyHint}> *</Text>
                    )}
                  </>
                );
              })()}
            </Text>
            <Text style={styles.transactionCategory}>
              {item.category?.name || 'Uncategorized'}
            </Text>
          </View>
        </Animated.View>

        {expandedTransactionId === item.id && (
          <View style={[styles.transactionExpandedDetails, styles.transactionItemExpanded]}>
            {/* Divider Line */}
            <View style={styles.expandedDivider} />

            {/* Category */}
            <View style={styles.expandedDetailRow}>
              <Text style={styles.expandedDetailLabel}>Category</Text>
              <Text style={styles.expandedDetailValue}>
                {item.category?.name || 'Uncategorized'}
              </Text>
            </View>

            {/* Date & Time */}
            <View style={styles.expandedDetailRow}>
              <Text style={styles.expandedDetailLabel}>Date & Time</Text>
              <Text style={styles.expandedDetailValue}>
                {new Date(item.occurred_at).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>

            {/* Merchant */}
            {item.merchant && (
              <View style={styles.expandedDetailRow}>
                <Text style={styles.expandedDetailLabel}>Merchant</Text>
                <Text style={styles.expandedDetailValue}>{item.merchant}</Text>
              </View>
            )}

            {/* Payment Method */}
            {item.payment_method && (
              <View style={styles.expandedDetailRow}>
                <Text style={styles.expandedDetailLabel}>Payment Method</Text>
                <Text style={styles.expandedDetailValue}>{item.payment_method}</Text>
              </View>
            )}

            {/* Source */}
            <View style={styles.expandedDetailRow}>
              <Text style={styles.expandedDetailLabel}>Source</Text>
              <View style={styles.sourceBadge}>
                <Ionicons 
                  name={
                    item.source === 'manual' ? 'create-outline' :
                    item.source === 'ocr' ? 'receipt-outline' :
                    'sparkles'
                  }
                  size={12}
                  color={Colors.white}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.sourceBadgeText}>
                  {item.source === 'manual' ? 'Manual' :
                   item.source === 'ocr' ? 'Receipt (OCR)' :
                   'AI Suggested'}
                </Text>
              </View>
            </View>

            {/* Items */}
            {(() => {
              const items = transactionItems[item.id] || item.items;
              if (items && items.length > 0) {
                return (
                  <View style={styles.expandedDetailSection}>
                    {items.map((transItem, index) => (
                      <View key={transItem.id || index} style={styles.expandedDetailRow}>
                        <Text style={styles.expandedDetailLabel}>Item {index + 1}</Text>
                        <View style={styles.itemDetailContainer}>
                          <Text 
                            style={styles.itemDetailName}
                            numberOfLines={2}
                            ellipsizeMode="tail"
                          >
                            {transItem.item_name || 'Unknown Item'}
                          </Text>
                          <View style={styles.itemDetailQtyPrice}>
                            <Text style={styles.itemDetailQty}>Qty: {transItem.item_amount}</Text>
                            <Text style={styles.itemDetailPrice}>
                              {currencySymbol}{(transItem.item_price * transItem.item_amount).toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              }
              return null;
            })()}

            {/* Notes */}
            {item.note && (
              <View style={styles.expandedDetailRow}>
                <Text style={styles.expandedDetailLabel}>Notes</Text>
                <Text style={styles.expandedDetailValue}>{item.note}</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.transactionActionButtons}>
              {/* Edit Button */}
              <TouchableOpacity
                style={styles.transactionEditButton}
                onPress={() => {
                  setEditingTransaction(item);
                  setShowEditModal(true);
                }}
              >
                <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
                <Text style={styles.transactionEditButtonText}>{t('home.edit')}</Text>
              </TouchableOpacity>

              {/* Delete Button */}
              <TouchableOpacity
                style={styles.transactionDeleteButton}
                onPress={() => {
                  Alert.alert(
                    t('home.deleteTransaction'),
                    t('home.deleteTransactionConfirm'),
                    [
                      { text: t('home.cancel'), style: 'cancel' },
                      {
                        text: t('home.delete'),
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await deleteTransaction(item.id);
                            setExpandedTransactionId(null);
                            fetchTransactions();
                          } catch (error) {
                            Alert.alert('Error', 'Failed to delete transaction');
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.transactionDeleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'All Transactions',
          headerShown: true,
          headerBackTitle: 'Back',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setShowFilters(true)}
              style={{ marginRight: 8 }}
            >
              <View style={{ position: 'relative' }}>
                <Ionicons name="filter" size={24} color={Colors.primary} />
                {getActiveFiltersCount() > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{getActiveFiltersCount()}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by merchant, category, or notes..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Statistics Summary */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Budget</Text>
            <Text style={[styles.statValue, styles.incomeAmount]}>
              {currencySymbol}{monthlyBudget.toFixed(2)}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Expense</Text>
            <Text style={[styles.statValue, styles.expenseAmount]}>
              {currencySymbol}{stats.totalExpense.toFixed(2)}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Balance</Text>
            <Text style={[styles.statValue, displayBalance >= 0 ? styles.incomeAmount : styles.expenseAmount]}>
              {currencySymbol}{displayBalance.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Transaction List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredTransactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={64} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No transactions found</Text>
                <Text style={styles.emptySubtext}>
                  Try adjusting your search or filters
                </Text>
              </View>
            }
          />
        )}

        {/* Advanced Filters Modal */}
        <Modal
          visible={showFilters}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowFilters(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {/* Category Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Category</Text>
                <View style={styles.filterChips}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      selectedCategories.length === 0 && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedCategories([])}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedCategories.length === 0 && styles.filterChipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.filterChip,
                        selectedCategories.includes(cat.id) && styles.filterChipActive,
                      ]}
                      onPress={() => {
                        setSelectedCategories((prev) =>
                          prev.includes(cat.id)
                            ? prev.filter((id) => id !== cat.id)
                            : [...prev, cat.id]
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedCategories.includes(cat.id) && styles.filterChipTextActive,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Payment Method Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Payment Method</Text>
                <View style={styles.filterChips}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      selectedPaymentMethods.length === 0 && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedPaymentMethods([])}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedPaymentMethods.length === 0 && styles.filterChipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {paymentMethods.map((method) => (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.filterChip,
                        selectedPaymentMethods.includes(method.name) && styles.filterChipActive,
                      ]}
                      onPress={() => {
                        setSelectedPaymentMethods((prev) =>
                          prev.includes(method.name)
                            ? prev.filter((name) => name !== method.name)
                            : [...prev, method.name]
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedPaymentMethods.includes(method.name) && styles.filterChipTextActive,
                        ]}
                      >
                        {method.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Source Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Source</Text>
                <View style={styles.filterChips}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      selectedSource === 'all' && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedSource('all')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedSource === 'all' && styles.filterChipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      selectedSource === 'manual' && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedSource('manual')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedSource === 'manual' && styles.filterChipTextActive,
                      ]}
                    >
                      Manual
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      selectedSource === 'ocr' && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedSource('ocr')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedSource === 'ocr' && styles.filterChipTextActive,
                      ]}
                    >
                      Receipt (OCR)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      selectedSource === 'ai' && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedSource('ai')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedSource === 'ai' && styles.filterChipTextActive,
                      ]}
                    >
                      AI Suggested
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Amount Range Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Amount Range</Text>
                <View style={styles.amountRangeContainer}>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="Min"
                    value={minAmount}
                    onChangeText={setMinAmount}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.amountRangeSeparator}>to</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="Max"
                    value={maxAmount}
                    onChangeText={setMaxAmount}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Date Range Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Date Range</Text>
                <View style={styles.dateRangeContainer}>
                  <View style={styles.dateInputWrapper}>
                    <Text style={styles.dateLabel}>From</Text>
                    <TextInput
                      style={styles.dateInput}
                      placeholder="YYYY-MM-DD"
                      value={startDate}
                      onChangeText={setStartDate}
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                  <View style={styles.dateInputWrapper}>
                    <Text style={styles.dateLabel}>To</Text>
                    <TextInput
                      style={styles.dateInput}
                      placeholder="YYYY-MM-DD"
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                </View>
                <View style={styles.quickDateButtons}>
                  <TouchableOpacity
                    style={styles.quickDateButton}
                    onPress={() => {
                      const today = new Date();
                      const yyyy = today.getFullYear();
                      const mm = String(today.getMonth() + 1).padStart(2, '0');
                      const dd = String(today.getDate()).padStart(2, '0');
                      const todayStr = `${yyyy}-${mm}-${dd}`;
                      setStartDate(todayStr);
                      setEndDate(todayStr);
                    }}
                  >
                    <Text style={styles.quickDateButtonText}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickDateButton}
                    onPress={() => {
                      const today = new Date();
                      const weekAgo = new Date(today);
                      weekAgo.setDate(weekAgo.getDate() - 7);
                      const formatDate = (d: Date) => {
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        return `${yyyy}-${mm}-${dd}`;
                      };
                      setStartDate(formatDate(weekAgo));
                      setEndDate(formatDate(today));
                    }}
                  >
                    <Text style={styles.quickDateButtonText}>Last 7 Days</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickDateButton}
                    onPress={() => {
                      const today = new Date();
                      const monthAgo = new Date(today);
                      monthAgo.setDate(monthAgo.getDate() - 30);
                      const formatDate = (d: Date) => {
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        return `${yyyy}-${mm}-${dd}`;
                      };
                      setStartDate(formatDate(monthAgo));
                      setEndDate(formatDate(today));
                    }}
                  >
                    <Text style={styles.quickDateButtonText}>Last 30 Days</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickDateButton}
                    onPress={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                      const formatDate = (d: Date) => {
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        return `${yyyy}-${mm}-${dd}`;
                      };
                      setStartDate(formatDate(firstDay));
                      setEndDate(formatDate(today));
                    }}
                  >
                    <Text style={styles.quickDateButtonText}>This Month</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearAllFilters}
              >
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => setShowFilters(false)}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
        {/* Floating Chat Button */}
        <FloatingChatButton />

        {/* Edit Transaction Modal */}
        <EditTransactionModal
          visible={showEditModal}
          transaction={editingTransaction}
          onClose={() => {
            setShowEditModal(false);
            setEditingTransaction(null);
          }}
          onSuccess={() => {
            fetchTransactions();
          }}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  quickFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
  },
  filterButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: Colors.white,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.gray200,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  transactionItemExpanded: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: 12,
    marginHorizontal: -12,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  transactionTime: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  incomeAmount: {
    color: Colors.success,
  },
  expenseAmount: {
    color: Colors.error,
  },
  transactionCategory: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  transactionExpandedDetails: {
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: Colors.gray200,
    marginBottom: 4,
  },
  expandedDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  expandedDetailSection: {
    paddingVertical: 8,
  },
  expandedDetailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  expandedDetailValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sourceBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  itemDetailContainer: {
    flex: 1,
    marginLeft: 12,
  },
  itemDetailName: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
    marginBottom: 4,
    lineHeight: 18,
  },
  itemDetailQtyPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemDetailQty: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  itemDetailPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  itemsList: {
    marginTop: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    overflow: 'hidden',
  },
  itemsListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  itemsListName: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  itemsListQtyPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemsListQty: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  itemsListPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  transactionActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  transactionEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    flex: 1,
  },
  transactionEditButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  transactionDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    flex: 1,
  },
  transactionDeleteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  filterSection: {
    marginTop: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  amountRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  amountInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: Colors.white,
  },
  amountRangeSeparator: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  dateRangeContainer: {
    gap: 12,
  },
  dateInputWrapper: {
    gap: 8,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dateInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: Colors.white,
    color: Colors.textPrimary,
  },
  quickDateButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  quickDateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  quickDateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  clearButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  applyButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  originalCurrencyHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    opacity: 0.7,
  },
});
