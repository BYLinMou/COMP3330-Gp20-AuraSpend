import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, Modal, Alert, Pressable, Animated, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';
import { RefreshableScrollView } from '../../components/refreshable-scroll-view';
import { EditTransactionModal } from '../../components/EditTransactionModal';
import { useLanguage } from '../../src/providers/LanguageProvider';
import { 
  getRecentTransactions, 
  getTransactionsByDateRange,
  subscribeToTransactionChanges,
  deleteTransaction,
  getBalancesByPaymentMethod,
  type Transaction 
} from '../../src/services/transactions';
import { getPaymentMethods } from '../../src/services/payment-methods';
import { getMonthlyBudgetAmount, getCurrentBudget, DEFAULT_MONTHLY_BUDGET } from '../../src/services/budgets';
import { getProfile } from '../../src/services/profiles';
import { useAuth } from '../../src/providers/AuthProvider';
import { useCurrency } from '../../src/providers/CurrencyProvider';
import { getItemsByTransaction, type ItemRow, debugGetAllUserItems } from '../../src/services/items';

const { width } = Dimensions.get('window');

// Helper function to format relative time
function getRelativeTime(dateString: string, t: any): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('home.justNow');
  if (diffMins < 60) return t('home.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('home.hoursAgo', { count: diffHours });
  if (diffDays === 1) return t('home.oneDayAgo');
  return t('home.daysAgo', { count: diffDays });
}

export default function HomeScreen() {
  const { t } = useLanguage();
  const { session } = useAuth();
  const { currencySymbol, currencyCode, convertToUserCurrency, loading: currencyLoading } = useCurrency();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [convertedAmounts, setConvertedAmounts] = useState<Record<string, number>>({});
  const [balance, setBalance] = useState(0);
  const [spent, setSpent] = useState(0);
  const [transactionLimit, setTransactionLimit] = useState(10);
  const [showLimitDropdown, setShowLimitDropdown] = useState(false);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [pressedTransactionId, setPressedTransactionId] = useState<string | null>(null);
  const [transactionItems, setTransactionItems] = useState<Record<string, ItemRow[]>>({});
  const [isFlipped, setIsFlipped] = useState(false);
  const [paymentMethodBalances, setPaymentMethodBalances] = useState<Record<string, number>>({});
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  const [showBackSide, setShowBackSide] = useState(false);
  const [showCardContent, setShowCardContent] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const blurAnimRef = React.useRef<{ [key: string]: Animated.Value }>({});
  const flipAnimation = React.useRef(new Animated.Value(0)).current;
  const cardSlideAnim = React.useRef(new Animated.Value(0)).current;
  const transactionsSlideAnim = React.useRef(new Animated.Value(0)).current;

  const [budget, setBudget] = useState(DEFAULT_MONTHLY_BUDGET); // Budget from Supabase
  const budgetUsed = Math.round((spent / budget) * 100);
  const limitOptions = [5, 10, 20, 50, 100];

  const handleFlip = async () => {
    // Start flip animation
    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();

    // Hide card content during flip to front
    if (isFlipped) {
      setShowCardContent(false);
      setTimeout(() => {
        setShowCardContent(true);
      }, 600); // Delay showing content until after flip animation
    }

    // Fetch payment method balances when flipping to back
    if (!isFlipped) {
      setShowBackSide(true);
      
      // Start slide-in animation immediately when flipping to back
      Animated.spring(cardSlideAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();

      // Start slide-in animation for transactions card with minimal delay
      setTimeout(() => {
        Animated.spring(transactionsSlideAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }).start();
      }, 20); // Reduced delay to 20ms
      
      try {
        setLoadingPaymentMethods(true);
        
        // Get real balances from database with currency conversion
        const balances = await getBalancesByPaymentMethod({
          convertToUserCurrency,
          userCurrency: currencyCode
        });
        setPaymentMethodBalances(balances);
      } catch (error) {
        console.error('Error fetching payment method balances:', error);
      } finally {
        setLoadingPaymentMethods(false);
      }
    } else {
      // Hide back side with a slight delay to let animation complete
      setTimeout(() => {
        setShowBackSide(false);
      }, 400);
    }

    setIsFlipped(!isFlipped);
  };

  useEffect(() => {
    if (showCardContent || showBackSide) {
      // Start slide-in animation for budget card immediately
      Animated.spring(cardSlideAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();

      // Start slide-in animation for transactions card with delay
      setTimeout(() => {
        Animated.spring(transactionsSlideAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }).start();
      }, 50); // Reduced delay to 50ms
    } else {
      // Reset animations when cards are hidden
      cardSlideAnim.setValue(0);
      transactionsSlideAnim.setValue(0);
    }
  }, [showCardContent, showBackSide, cardSlideAnim, transactionsSlideAnim]);

  // Initial data load
  useEffect(() => {
    if (!session || currencyLoading) return;
    loadData();
  }, [session, transactionLimit, currencyCode, currencyLoading]);

  // Realtime: refresh when transactions change
  useEffect(() => {
    if (!session) return;
    let unsub: undefined | (() => Promise<void>);
    (async () => {
      try {
        unsub = await subscribeToTransactionChanges(() => {
          // Re-fetch summary + recent list on any change
          loadData();
        });
      } catch (e) {
        console.warn('Realtime subscription not active:', e);
      }
    })();
    return () => {
      if (unsub) {
        unsub().catch(() => {});
      }
    };
  }, [session]);

  async function loadData() {
    try {
      setLoading(true);
      
      // Get current month date range
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];

      // Fetch all data in parallel
      const [recentTransactionsData, monthlyTransactions, monthlyBudget] = await Promise.all([
        getRecentTransactions(transactionLimit),
        getTransactionsByDateRange(startDate, endDate),
        getMonthlyBudgetAmount(),
      ]);

      // Convert recent transaction amounts for display
      const amounts: Record<string, number> = {};
      await Promise.all(
        recentTransactionsData.map(async (transaction) => {
          if (transaction.currency && transaction.currency !== currencyCode) {
            const result = await convertToUserCurrency(Math.abs(transaction.amount), transaction.currency);
            amounts[transaction.id] = transaction.amount >= 0 ? result.convertedAmount : -result.convertedAmount;
          } else {
            amounts[transaction.id] = transaction.amount;
          }
        })
      );

      // Calculate expenses from monthly transactions (converting if needed)
      let expenses = 0;
      await Promise.all(
        monthlyTransactions.map(async (transaction) => {
          if (transaction.amount < 0) {
             let amount = Math.abs(transaction.amount);
             if (transaction.currency && transaction.currency !== currencyCode) {
                const result = await convertToUserCurrency(amount, transaction.currency);
                amount = result.convertedAmount;
             }
             expenses += amount;
          }
        })
      );

      // Set all state together to ensure UI updates with converted amounts
      setRecentTransactions(recentTransactionsData);
      setConvertedAmounts(amounts);
      setSpent(expenses);
      setBudget(monthlyBudget);
      // Balance = budget - expenses
      setBalance(monthlyBudget - expenses);

      // Debug: 检查所有 items
      try {
        await debugGetAllUserItems();
      } catch (e) {
        console.log('[DEBUG] Failed to fetch all items for debugging:', e);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      // Get current month date range
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];

      // Fetch all data in parallel
      const [recentTransactionsData, monthlyTransactions, monthlyBudget] = await Promise.all([
        getRecentTransactions(transactionLimit),
        getTransactionsByDateRange(startDate, endDate),
        getMonthlyBudgetAmount(),
      ]);

      // Convert recent transaction amounts for display
      const amounts: Record<string, number> = {};
      await Promise.all(
        recentTransactionsData.map(async (transaction) => {
          if (transaction.currency && transaction.currency !== currencyCode) {
            const result = await convertToUserCurrency(Math.abs(transaction.amount), transaction.currency);
            amounts[transaction.id] = transaction.amount >= 0 ? result.convertedAmount : -result.convertedAmount;
          } else {
            amounts[transaction.id] = transaction.amount;
          }
        })
      );

      // Calculate expenses from monthly transactions (converting if needed)
      let expenses = 0;
      await Promise.all(
        monthlyTransactions.map(async (transaction) => {
          if (transaction.amount < 0) {
             let amount = Math.abs(transaction.amount);
             if (transaction.currency && transaction.currency !== currencyCode) {
                const result = await convertToUserCurrency(amount, transaction.currency);
                amount = result.convertedAmount;
             }
             expenses += amount;
          }
        })
      );

      // Set all state together to ensure UI updates with converted amounts
      setRecentTransactions(recentTransactionsData);
      setConvertedAmounts(amounts);
      setSpent(expenses);
      setBudget(monthlyBudget);
      // Balance = budget - expenses
      setBalance(monthlyBudget - expenses);
    } catch (error) {
      console.error('Error refreshing dashboard data:', error);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <RefreshableScrollView
        style={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Balance Card */}
        <View style={styles.flipContainer}>
          <View>
            {/* Front Side */}
            <Animated.View
              style={[
                styles.flipCard,
                {
                  transform: [
                    {
                      rotateY: flipAnimation.interpolate({
                        inputRange: [0, 180],
                        outputRange: ['0deg', '180deg'],
                      }),
                    },
                  ],
                },
                { opacity: flipAnimation.interpolate({
                    inputRange: [0, 90, 90.01, 180],
                    outputRange: [1, 1, 0, 0],
                  })
                },
              ]}
              pointerEvents={isFlipped ? 'none' : 'auto'}
            >
              <TouchableOpacity activeOpacity={1} onPress={handleFlip}>
                <LinearGradient
                  colors={[Colors.gradientStart1, Colors.gradientEnd1]}
                  style={styles.balanceCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.balanceHeader}>
                    <Text style={styles.balanceLabel}>{t('home.remainingBudget')}</Text>
                    <Ionicons name="wallet-outline" size={24} color={Colors.white} />
                  </View>
                  <Text style={styles.balanceAmount}>{currencySymbol}{balance.toFixed(2)}</Text>
                  <View style={styles.balanceFooter}>
                    <View style={styles.balanceItem}>
                      <Ionicons name="wallet" size={16} color={Colors.white} />
                      <Text style={styles.balanceItemText}>{t('home.budget')}: {currencySymbol}{budget.toFixed(2)}</Text>
                    </View>
                    <View style={styles.balanceItem}>
                      <Ionicons name="trending-down" size={16} color={Colors.white} />
                      <Text style={styles.balanceItemText}>{t('home.spent')}: {currencySymbol}{spent.toFixed(2)}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Back Side - Only render when visible to avoid blocking */}
            {showBackSide && (
            <Animated.View
              style={[
                styles.flipCard,
                styles.flipCardBack,
                {
                  transform: [
                    {
                      rotateY: flipAnimation.interpolate({
                        inputRange: [0, 180],
                        outputRange: ['180deg', '360deg'],
                      }),
                    },
                  ],
                },
                { opacity: flipAnimation.interpolate({
                    inputRange: [0, 90, 90.01, 180],
                    outputRange: [0, 0, 1, 1],
                  })
                },
              ]}
              pointerEvents={isFlipped ? 'auto' : 'none'}
            >
              <LinearGradient
                colors={[Colors.gradientEnd1, Colors.gradientStart1]}
                style={styles.balanceCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <TouchableOpacity activeOpacity={1} onPress={handleFlip}>
                  <View style={styles.balanceHeader}>
                    <Text style={styles.balanceLabel}>{t('home.paymentMethodBalances')}</Text>
                    <View style={styles.paymentMethodHeaderRight}>
                      <Text style={styles.hideZeroLabel}>{t('home.hideZeroBalances') || 'Hide 0'}</Text>
                      <Switch
                        value={hideZeroBalances}
                        onValueChange={setHideZeroBalances}
                        trackColor={{ false: Colors.gray200, true: Colors.primary }}
                        thumbColor={hideZeroBalances ? Colors.white : Colors.white}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
                
                {loadingPaymentMethods ? (
                  <View style={styles.paymentMethodsLoading}>
                    <ActivityIndicator size="large" color={Colors.white} />
                  </View>
                ) : (
                  <ScrollView 
                    style={[styles.paymentMethodsScrollView, { maxHeight: Dimensions.get('window').height * 0.7 }]}
                    contentContainerStyle={styles.paymentMethodsList}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                  >
                    {(() => {
                      const visibleEntries = Object.entries(paymentMethodBalances)
                        .filter(([, b]) => (!hideZeroBalances || Math.abs(b) > 0))
                        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
                      if (visibleEntries.length === 0) {
                        return <Text style={styles.paymentMethodEmpty}>{t('home.noPaymentMethods')}</Text>;
                      }
                      return visibleEntries.map(([method, balance]) => {
                          const icon = 
                            method.toLowerCase().includes('cash') ? 'cash-outline' :
                            method.toLowerCase().includes('octopus') ? 'card-outline' :
                            method.toLowerCase().includes('credit') ? 'card-outline' :
                            method.toLowerCase().includes('debit') ? 'card-outline' :
                            'wallet-outline';
                          
                          return (
                            <View key={method} style={styles.paymentMethodItem}>
                              <View style={styles.paymentMethodLeft}>
                                <Ionicons name={icon} size={20} color={Colors.white} />
                                <Text style={styles.paymentMethodName}>{method}</Text>
                              </View>
                              <Text
                                style={[
                                  styles.paymentMethodBalance,
                                  balance >= 0 ? styles.paymentMethodPositive : styles.paymentMethodNegative,
                                ]}
                              >
                                {balance >= 0 ? '+' : ''}{currencySymbol}{balance.toFixed(2)}
                              </Text>
                            </View>
                          );
                        })
                    })()}
                  </ScrollView>
                )}
              </LinearGradient>
            </Animated.View>
            )}
          </View>
        </View>

        {/* Monthly Budget */}
        {!isFlipped && showCardContent && (
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                {
                  translateY: cardSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
              opacity: cardSlideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('home.monthlyBudget')}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{budgetUsed}% {t('home.used')}</Text>
            </View>
          </View>
          <View style={styles.budgetInfo}>
            <Text style={styles.budgetAmount}>{currencySymbol}{spent.toFixed(2)} {t('home.spent')}</Text>
            <Text style={styles.budgetAmount}>{currencySymbol}{budget.toFixed(2)} {t('home.budget')}</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${budgetUsed}%` }]} />
          </View>
          {budgetUsed >= 80 && budgetUsed <= 100 && (
            <View style={styles.warningContainer}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.warningText}>{t('home.closeToBudgetLimit')}</Text>
            </View>
          )}
          {budgetUsed > 100 && (
            <View style={styles.warningContainer}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.warningText}>{t('home.exceededBudget')}</Text>
            </View>
          )}
        </Animated.View>
        )}

        {/* View All Transactions Card */}
        {!isFlipped && showCardContent && (
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                {
                  translateY: cardSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
              opacity: cardSlideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.viewAllTransactionsCard}
            onPress={() => {
              // @ts-ignore - Expo Router navigation
              router.push('/all-transactions');
            }}
            activeOpacity={0.7}
          >
            <View style={styles.viewAllTransactionsLeft}>
              <Ionicons name="list-outline" size={28} color={Colors.primary} />
              <View style={styles.viewAllTransactionsText}>
                <Text style={styles.viewAllTransactionsTitle}>{t('home.viewAllTransactions')}</Text>
                <Text style={styles.viewAllTransactionsSubtitle}>
                  {t('home.searchAndFilterTransactions')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </Animated.View>
        )}

        {/* Recent Transactions */}
        {!isFlipped && showCardContent && (
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                {
                  translateY: transactionsSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
              opacity: transactionsSlideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('home.recentTransactions')}</Text>
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowLimitDropdown(!showLimitDropdown)}
              >
                <Text style={styles.dropdownButtonText}>{transactionLimit}</Text>
                <Ionicons 
                  name={showLimitDropdown ? "chevron-up" : "chevron-down"} 
                  size={18} 
                  color={Colors.primary} 
                />
              </TouchableOpacity>
            </View>
          </View>
          
          {showLimitDropdown && (
            <View style={styles.dropdownMenu}>
              {limitOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.dropdownOption,
                    transactionLimit === option && styles.dropdownOptionSelected,
                  ]}
                  onPress={() => {
                    setTransactionLimit(option);
                    setShowLimitDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      transactionLimit === option && styles.dropdownOptionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {loading || currencyLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : recentTransactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t('home.noTransactions')}</Text>
            </View>
          ) : (
            recentTransactions.map((transaction) => {
              if (!blurAnimRef.current[transaction.id]) {
                blurAnimRef.current[transaction.id] = new Animated.Value(0);
              }
              const blurAnim = blurAnimRef.current[transaction.id];
              
              return (
                <Pressable
                  key={transaction.id}
                  onPress={async () => {
                    if (expandedTransactionId === transaction.id) {
                      setExpandedTransactionId(null);
                    } else {
                      setExpandedTransactionId(transaction.id);
                      // 获取该交易的 items
                      if (!transactionItems[transaction.id]) {
                        try {
                          console.log(`[DEBUG] Fetching items for transaction: ${transaction.id}`);
                          const items = await getItemsByTransaction(transaction.id);
                          console.log(`[DEBUG] Found ${items.length} items:`, items);
                          setTransactionItems(prev => ({
                            ...prev,
                            [transaction.id]: items
                          }));
                        } catch (error) {
                          console.error('Failed to fetch transaction items:', error);
                          Alert.alert(t('home.error'), t('home.failedToLoadItems'));
                        }
                      } else {
                        console.log(`[DEBUG] Using cached items for transaction: ${transaction.id}`, transactionItems[transaction.id]);
                      }
                    }
                  }}
                  onPressIn={() => {
                    setPressedTransactionId(transaction.id);
                    Animated.timing(blurAnim, {
                      toValue: 1,
                      duration: 150,
                      useNativeDriver: false,
                    }).start();
                  }}
                  onPressOut={() => {
                    setPressedTransactionId(null);
                    Animated.timing(blurAnim, {
                      toValue: 0,
                      duration: 150,
                      useNativeDriver: false,
                    }).start();
                  }}
                >
                  <Animated.View style={[
                    styles.transactionItem,
                    expandedTransactionId === transaction.id && styles.transactionItemExpanded,
                    {
                      opacity: blurAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 0.5],
                      }),
                    }
                  ]}>
                    <View style={styles.transactionLeft}>
                      <Animated.Text style={[
                        styles.transactionName,
                        {
                          letterSpacing: blurAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 0.5],
                          }),
                        }
                      ]}>
                        {transaction.merchant || 'Transaction'}
                      </Animated.Text>
                      <Animated.Text style={[
                        styles.transactionTime,
                        {
                          letterSpacing: blurAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 0.5],
                          }),
                        }
                      ]}>
                        {getRelativeTime(transaction.occurred_at, t)}
                      </Animated.Text>
                    </View>
                    <View style={styles.transactionRight}>
                      <Animated.Text
                        style={[
                          styles.transactionAmount,
                          transaction.amount > 0 ? styles.incomeAmount : styles.expenseAmount,
                          {
                            letterSpacing: blurAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 0.5],
                            }),
                          }
                        ]}
                      >
                        {(() => {
                          const displayAmount = convertedAmounts[transaction.id] ?? transaction.amount;
                          const showOriginal = transaction.currency && transaction.currency !== currencyCode;
                          return (
                            <>
                              {transaction.amount > 0 ? '+' : ''}{currencySymbol}{Math.abs(displayAmount).toFixed(2)}
                              {showOriginal && (
                                <Text style={styles.originalCurrencyHint}> *</Text>
                              )}
                            </>
                          );
                        })()}
                      </Animated.Text>
                      <Animated.Text style={[
                        styles.transactionCategory,
                        {
                          letterSpacing: blurAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 0.5],
                          }),
                        }
                      ]}>
                        {transaction.category?.name || 'Uncategorized'}
                      </Animated.Text>
                    </View>
                  </Animated.View>

                {expandedTransactionId === transaction.id && (
                  <View style={[styles.transactionExpandedDetails, styles.transactionItemExpanded]}>
                    {/* Divider Line */}
                    <View style={styles.expandedDivider} />

                    {/* Category */}
                    <View style={styles.expandedDetailRow}>
                      <Text style={styles.expandedDetailLabel}>{t('home.category')}</Text>
                      <Text style={styles.expandedDetailValue}>
                        {transaction.category?.name || t('home.uncategorized')}
                      </Text>
                    </View>

                    {/* Date & Time */}
                    <View style={styles.expandedDetailRow}>
                      <Text style={styles.expandedDetailLabel}>{t('home.dateTime')}</Text>
                      <Text style={styles.expandedDetailValue}>
                        {new Date(transaction.occurred_at).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    </View>

                    {/* Merchant */}
                    {transaction.merchant && (
                      <View style={styles.expandedDetailRow}>
                        <Text style={styles.expandedDetailLabel}>{t('home.merchant')}</Text>
                        <Text style={styles.expandedDetailValue}>{transaction.merchant}</Text>
                      </View>
                    )}

                    {/* Payment Method */}
                    {transaction.payment_method && (
                      <View style={styles.expandedDetailRow}>
                        <Text style={styles.expandedDetailLabel}>{t('home.paymentMethod')}</Text>
                        <Text style={styles.expandedDetailValue}>{transaction.payment_method}</Text>
                      </View>
                    )}

                    {/* Source */}
                    <View style={styles.expandedDetailRow}>
                      <Text style={styles.expandedDetailLabel}>{t('home.source')}</Text>
                      <View style={styles.sourceBadge}>
                        <Ionicons 
                          name={
                            transaction.source === 'manual' ? 'create-outline' :
                            transaction.source === 'ocr' ? 'receipt-outline' :
                            'sparkles'
                          }
                          size={12}
                          color={Colors.white}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.sourceBadgeText}>
                          {transaction.source === 'manual' ? t('home.sourceManual') :
                           transaction.source === 'ocr' ? t('home.sourceReceipt') :
                           t('home.sourceAI')}
                        </Text>
                      </View>
                    </View>

                    {/* Items */}
                    {(() => {
                      const items = transactionItems[transaction.id];
                      console.log(`[DEBUG] Rendering items for ${transaction.id}:`, items);
                      if (items && items.length > 0) {
                        return (
                          <View style={styles.expandedDetailSection}>
                            {items.map((item, index) => {
                              console.log(`[DEBUG] Rendering item ${index}:`, item.item_name);
                              return (
                                  <View key={item.id || index} style={styles.expandedDetailRow}>
                                    <Text style={styles.expandedDetailLabel}>{t('home.item', { number: index + 1 })}</Text>
                                    <View style={styles.itemDetailContainer}>
                                      <Text 
                                        style={styles.itemDetailName}
                                        numberOfLines={2}
                                        ellipsizeMode="tail"
                                      >
                                        {item.item_name || t('home.unknownItem')}
                                      </Text>
                                      <View style={styles.itemDetailQtyPrice}>
                                        <Text style={styles.itemDetailQty}>{t('home.quantity')}: {item.item_amount}</Text>
                                        <Text style={styles.itemDetailPrice}>
                                          ${(item.item_price * item.item_amount).toFixed(2)}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                              );
                            })}
                          </View>
                        );
                      }
                      return null;
                    })()}

                    {/* Notes */}
                    {transaction.note && (
                      <View style={styles.expandedDetailRow}>
                        <Text style={styles.expandedDetailLabel}>{t('home.notes')}</Text>
                        <Text style={styles.expandedDetailValue}>{transaction.note}</Text>
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.transactionActionButtons}>
                      {/* Edit Button */}
                      <TouchableOpacity
                        style={styles.transactionEditButton}
                        onPress={() => {
                          setEditingTransaction(transaction);
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
                                    await deleteTransaction(transaction.id);
                                    setExpandedTransactionId(null);
                                    loadData();
                                  } catch (error) {
                                    Alert.alert(t('home.error'), t('home.failedToDelete'));
                                  }
                                }
                              }
                            ]
                          );
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.error} />
                        <Text style={styles.transactionDeleteButtonText}>{t('home.delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </Pressable>
              );
            })
          )}
        </Animated.View>
        )}

        <View style={{ height: 20 }} />
      </RefreshableScrollView>

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        visible={showEditModal}
        transaction={editingTransaction}
        onClose={() => {
          setShowEditModal(false);
          setEditingTransaction(null);
        }}
        onSuccess={() => {
          loadData();
        }}
      />
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
  balanceCard: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 0,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 15,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  balanceLabel: {
    fontSize: 15,
    color: Colors.white,
    opacity: 0.9,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 38,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 10,
  },
  balanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceItemText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: '500',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'visible',
    zIndex: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  viewAllTransactionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    maxHeight: 60,
  },
  viewAllTransactionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  viewAllTransactionsText: {
    flex: 1,
  },
  viewAllTransactionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  viewAllTransactionsSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  badge: {
    backgroundColor: Colors.error,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  budgetInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  budgetAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.gray200,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.textPrimary,
    borderRadius: 4,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  warningText: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: '500',
  },
  chartContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  donutChart: {
    width: 180,
    height: 180,
    borderRadius: 90,
    position: 'relative',
    overflow: 'hidden',
  },
  chartSegment: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 90,
  },
  donutHole: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.white,
    top: 40,
    left: 40,
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
  transactionContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.gray100,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 40,
    right: 0,
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray200,
    zIndex: 10000,
    minWidth: 80,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  dropdownOptionSelected: {
    backgroundColor: Colors.primary,
    borderBottomColor: Colors.primary,
  },
  dropdownOptionText: {
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  dropdownOptionTextSelected: {
    color: Colors.white,
    fontWeight: '600',
  },
  flipContainer: {
    marginBottom: 16,
    position: 'relative',
    zIndex: 50,
  },
  flipCard: {
    backfaceVisibility: 'hidden',
    zIndex: 50,
  },
  flipCardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  paymentMethodsLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodsScrollView: {
    marginTop: 12,
  },
  paymentMethodsList: {
    gap: 10,
  },
  paymentMethodHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hideZeroLabel: {
    fontSize: 12,
    color: Colors.white,
    opacity: 0.9,
    fontWeight: '500',
    textAlign: 'right',
  },
  paymentMethodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 10,
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentMethodName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  paymentMethodBalance: {
    fontSize: 16,
    fontWeight: '700',
  },
  paymentMethodPositive: {
    color: '#4ade80',
  },
  paymentMethodNegative: {
    color: '#fca5a5',
  },
  paymentMethodEmpty: {
    fontSize: 14,
    color: Colors.white,
    opacity: 0.8,
    textAlign: 'center',
    paddingVertical: 20,
  },
  originalCurrencyHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    opacity: 0.7,
  },
});
