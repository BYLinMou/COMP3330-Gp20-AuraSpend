import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { RefreshableScrollView } from '../../components/refreshable-scroll-view';
import { 
  getSpendingBreakdown,
  type Transaction 
} from '../../src/services/transactions';
import { 
  getMonthlyTrends, 
  getSpendingSummary,
  type MonthlyTrend,
} from '../../src/services/reports';
import { useAuth } from '../../src/providers/AuthProvider';
import { useCurrency } from '../../src/providers/CurrencyProvider';
import { PieChart } from 'react-native-chart-kit';
import Svg, { Path, Circle } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CHART_HEIGHT = 160;
const VERTICAL_PADDING_BOTTOM = 10; // 20% of 160

type TabType = 'trends' | 'compare' | 'merchants' | 'search' | 'breakdown';
type PeriodType = 'month' | 'week' | 'year';

type ChartPoint = {
  x: number;
  y: number;
  key: string;
};

export default function ReportsScreen() {
  const { session } = useAuth();
  const { currencySymbol, currencyCode, convertToUserCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState<TabType>('trends');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [spendingData, setSpendingData] = useState<Array<{
    category: string;
    amount: number;
    color: string;
    percentage: number;
  }>>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [chartWidth, setChartWidth] = useState(0);
  
  // Add a ref to track if we're currently loading to prevent duplicate requests
  const loadingRef = React.useRef(false);

  // Calculate maxValue from monthlyTrends dynamically
  const rawMax = monthlyTrends.length > 0 
    ? Math.max(
        ...monthlyTrends.map(t => t.actualSpending),
        ...monthlyTrends.map(t => t.budgetTarget)
      ) 
    : 2200;
  
  // Add 20% headroom so the chart doesn't touch the top
  const maxValue = rawMax * 1.2;

  const yAxisLabels = useMemo(() => {
    const safeMax = maxValue || 1;
    const step = safeMax / 4;
    return [4, 3, 2, 1, 0].map((multiplier) => Math.round(step * multiplier));
  }, [maxValue]);

  const trendPoints = useMemo(() => {
    if (!chartWidth || monthlyTrends.length === 0) {
      return { actual: [] as ChartPoint[], budget: [] as ChartPoint[] };
    }

    const length = monthlyTrends.length;
    // Add horizontal padding so points aren't on the very edge
    const paddingX = 16;
    const availableWidth = chartWidth - (paddingX * 2);
    const availableHeight = CHART_HEIGHT - VERTICAL_PADDING_BOTTOM;
    const step = length > 1 ? availableWidth / (length - 1) : 0;

    const actual: ChartPoint[] = [];
    const budget: ChartPoint[] = [];

    monthlyTrends.forEach((trend, index) => {
      const x = length === 1 ? chartWidth / 2 : paddingX + (index * step);
      const actualHeight = (trend.actualSpending / (maxValue || 1)) * availableHeight;
      const budgetHeight = (trend.budgetTarget / (maxValue || 1)) * availableHeight;

      actual.push({
        x,
        y: availableHeight - actualHeight,
        key: `${trend.month}-${trend.year}-actual`,
      });

      budget.push({
        x,
        y: availableHeight - budgetHeight,
        key: `${trend.month}-${trend.year}-budget`,
      });
    });

    return { actual, budget };
  }, [chartWidth, monthlyTrends, maxValue]);

  const buildPath = useCallback((points: ChartPoint[]) => {
    if (!points.length) return '';
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }, []);

  const actualPath = useMemo(() => buildPath(trendPoints.actual), [buildPath, trendPoints.actual]);
  const budgetPath = useMemo(() => buildPath(trendPoints.budget), [buildPath, trendPoints.budget]);

  const handleChartLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (Math.abs(chartWidth - nextWidth) > 1) {
      setChartWidth(nextWidth);
    }
  }, [chartWidth]);

  // Category color mapping
  const categoryColors: Record<string, string> = {
    'Food': Colors.chartPurple,
    'Transport': Colors.chartCyan,
    'Entertainment': Colors.chartOrange,
    'Shopping': Colors.chartRed,
    'Bills': Colors.chartGreen,
    'Income': Colors.success,
  };

  useEffect(() => {
    if (session) {
      loadAllData();
    }
  }, [session, period, activeTab]); // Also reload when switching tabs

  async function loadAllData() {
    // Prevent duplicate loading requests
    if (loadingRef.current) {
      return;
    }
    
    try {
      loadingRef.current = true;
      setLoading(true);
      
      // Get date range based on selected period
      const now = new Date();
      let startDate: string;
      let endDate: string;

      if (period === 'week') {
        // Get current week (last 7 days) - include full day today
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 6);
        weekAgo.setHours(0, 0, 0, 0);
        startDate = weekAgo.toISOString();
        // End of today to include all transactions
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        endDate = endOfDay.toISOString();
      } else if (period === 'year') {
        // Get current year - include full year
        const firstDay = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const lastDay = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        startDate = firstDay.toISOString();
        endDate = lastDay.toISOString();
      } else {
        // Get current month - include full month
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        startDate = firstDay.toISOString();
        endDate = lastDay.toISOString();
      }

      // Load data based on active tab to improve performance
      // Only load what's needed for the current view
      const dataToLoad: Promise<any>[] = [
        getSpendingSummary(startDate, endDate),
        getSpendingBreakdown(startDate, endDate),
      ];

      // Only load trends if on trends tab
      if (activeTab === 'trends') {
        dataToLoad.push(getMonthlyTrends(6));
      }

      const results = await Promise.all(dataToLoad);
      const [summary, breakdown, trends] = results;

      // Update summary
      setTotalIncome(summary.totalIncome);
      setTotalSpent(summary.totalExpenses);

      // Update breakdown
      const total = Object.values(breakdown).reduce<number>((sum, val) => sum + (val as number), 0);
      const fallbackColors = [
        Colors.chartPurple,
        Colors.chartCyan,
        Colors.chartOrange,
        Colors.chartRed,
        Colors.chartGreen,
      ];

      const chartData = Object.entries(breakdown).map(([category, amount], index) => {
        const explicitColor = categoryColors[category];
        const fallbackColor = fallbackColors[index % fallbackColors.length];

        return {
          category,
          amount: amount as number,
          color: explicitColor ?? fallbackColor,
          percentage: Math.round(((amount as number) / total) * 100),
        };
      });
      setSpendingData(chartData);

      // Update trends only if loaded
      if (activeTab === 'trends' && trends) {
        setMonthlyTrends(trends);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadAllData();
    } catch (error) {
      console.error('Error refreshing data:', error);
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
        {/* Income and Spent Cards */}
        <View style={styles.summaryCards}>
          <View style={[styles.summaryCard, styles.incomeCard]}>
            <Text style={styles.summaryLabel}>Total Income</Text>
            <Text style={styles.summaryAmount}>{currencySymbol}{totalIncome.toFixed(2)}</Text>
            <View style={styles.trendIcon}>
              <Ionicons name="trending-up" size={24} color={Colors.white} />
            </View>
          </View>

          <View style={[styles.summaryCard, styles.spentCard]}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryAmount}>{currencySymbol}{totalSpent.toFixed(2)}</Text>
            <View style={styles.trendIcon}>
              <Ionicons name="trending-down" size={24} color={Colors.white} />
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trends' && styles.tabActive]}
            onPress={() => setActiveTab('trends')}
          >
            <Text style={[styles.tabText, activeTab === 'trends' && styles.tabTextActive]}>
              Trends
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'breakdown' && styles.tabActive]}
            onPress={() => setActiveTab('breakdown')}
          >
            <Text style={[styles.tabText, activeTab === 'breakdown' && styles.tabTextActive]}>
              Breakdown
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'compare' && styles.tabActive]}
            onPress={() => setActiveTab('compare')}
          >
            <Text style={[styles.tabText, activeTab === 'compare' && styles.tabTextActive]}>
              Compare
            </Text>
          </TouchableOpacity>
        </View>

        {/* Spending Trends Chart */}
        {activeTab === 'trends' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Spending Trends</Text>
            <Text style={styles.cardSubtitle}>Monthly spending vs budget over time</Text>

            <View style={styles.chartContainer}>
              {/* Y-axis labels */}
              <View style={styles.yAxisLabels}>
                {yAxisLabels.map((label, index) => (
                  <Text key={`y-axis-${index}`} style={styles.yAxisLabel}>
                    {label}
                  </Text>
                ))}
              </View>

              {/* Chart area */}
              <View style={styles.chartArea} onLayout={handleChartLayout}>
                {/* Grid lines */}
                <View style={styles.gridLines}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <View key={i} style={styles.gridLine} />
                  ))}
                </View>

                {loading || monthlyTrends.length === 0 ? (
                  <View style={styles.chartPlaceholder}>
                    <Text style={styles.placeholderText}>Loading trends...</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.chartCanvas}>
                      {chartWidth > 0 && (
                        <Svg width={chartWidth} height={CHART_HEIGHT}>
                          {budgetPath && (
                            <Path
                              d={budgetPath}
                              stroke={Colors.chartCyan}
                              strokeWidth={2}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}

                          {actualPath && (
                            <Path
                              d={actualPath}
                              stroke={Colors.chartPurple}
                              strokeWidth={2}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}

                          {trendPoints.budget.map((point) => (
                            <Circle
                              key={point.key}
                              cx={point.x}
                              cy={point.y}
                              r={4.5}
                              stroke={Colors.chartCyan}
                              strokeWidth={2}
                              fill={Colors.white}
                            />
                          ))}

                          {trendPoints.actual.map((point) => (
                            <Circle
                              key={point.key}
                              cx={point.x}
                              cy={point.y}
                              r={4.5}
                              stroke={Colors.chartPurple}
                              strokeWidth={2}
                              fill={Colors.white}
                            />
                          ))}
                        </Svg>
                      )}
                    </View>

                    {/* X-axis labels */}
                    <View style={styles.xAxisLabels}>
                      {monthlyTrends.map((trend) => (
                        <Text key={`${trend.month}-${trend.year}`} style={styles.xAxisLabel}>
                          {trend.month}
                        </Text>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.chartPurple }]} />
                <Text style={styles.legendText}>Actual Spending</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.chartCyan }]} />
                <Text style={styles.legendText}>Budget Target</Text>
              </View>
            </View>
          </View>
        )}

        {/* Compare Tab */}
        {activeTab === 'compare' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Compare Periods</Text>
            <Text style={styles.cardSubtitle}>Coming soon...</Text>
          </View>
        )}

        {/* Breakdown Tab */}
        {activeTab === 'breakdown' && (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.cardTitle}>Analysis</Text>
                <Text style={styles.periodIndicator}>
                  {period === 'week' && 'Last 7 Days'}
                  {period === 'month' && 'This Month'}
                  {period === 'year' && 'This Year'}
                </Text>
              </View>
              
              {/* Period Filter */}
              <View style={styles.periodFilter}>
                <TouchableOpacity
                  style={[styles.periodButton, period === 'month' && styles.periodButtonActive]}
                  onPress={() => setPeriod('month')}
                >
                  <Text style={[styles.periodButtonText, period === 'month' && styles.periodButtonTextActive]}>
                    Monthly
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.periodButton, period === 'week' && styles.periodButtonActive]}
                  onPress={() => setPeriod('week')}
                >
                  <Text style={[styles.periodButtonText, period === 'week' && styles.periodButtonTextActive]}>
                    Weekly
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.periodButton, period === 'year' && styles.periodButtonActive]}
                  onPress={() => setPeriod('year')}
                >
                  <Text style={[styles.periodButtonText, period === 'year' && styles.periodButtonTextActive]}>
                    Yearly
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : spendingData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="pie-chart-outline" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>暂无支出数据</Text>
              </View>
            ) : (
              <>
                {/* Spending Summary with Pie Chart */}
                <View style={styles.spendingSummary}>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>Total Expense</Text>
                    <Text style={styles.summaryTotal}>{currencySymbol}{totalSpent.toFixed(2)}</Text>
                  </View>

                  {/* Pie Chart for breakdown */}
                  <View style={styles.pieChartContainer}>
                    <PieChart
                      data={spendingData.map((item) => ({
                        name: item.category,
                        amount: item.amount,
                        color: item.color,
                        legendFontColor: Colors.textSecondary,
                        legendFontSize: 12,
                      }))}
                      width={width - 80}
                      height={220}
                      chartConfig={{
                        backgroundGradientFrom: '#ffffff',
                        backgroundGradientTo: '#ffffff',
                        color: () => Colors.textPrimary,
                        labelColor: () => Colors.textSecondary,
                      }}
                      accessor="amount"
                      backgroundColor="transparent"
                      paddingLeft={((width - 80) / 4).toString()} // 动态计算 paddingLeft 为宽度的 1/4 以实现居中
                      center={[0, 0]}
                      hasLegend={false}
                      absolute={false}
                    />
                  </View>

                  {/* Horizontal stacked bar 作为额外视觉辅助 */}
                  <View style={styles.stackedBar}>
                    {spendingData.map((item) => (
                      <View
                        key={item.category}
                        style={[
                          styles.stackedBarSegment,
                          {
                            backgroundColor: item.color,
                            width: `${item.percentage}%`,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Category List */}
                <View style={styles.categoryList}>
                  {spendingData.map((item) => (
                    <View key={item.category} style={styles.categoryItem}>
                      <View style={styles.categoryLeft}>
                        <View style={[styles.categoryColor, { backgroundColor: item.color }]} />
                        <View style={styles.categoryInfo}>
                          <Text style={styles.categoryName}>{item.category}</Text>
                          <Text style={styles.categoryPercentage}>{item.percentage}%</Text>
                        </View>
                      </View>
                      <Text style={styles.categoryAmount}>{currencySymbol} {item.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Weekly Tab - REMOVED */}

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
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  incomeCard: {
    backgroundColor: Colors.success,
  },
  spentCard: {
    backgroundColor: Colors.error,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.white,
    opacity: 0.9,
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  trendIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    opacity: 0.3,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.textPrimary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.white,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  chartContainer: {
    flexDirection: 'row',
    height: 200,
    marginBottom: 16,
  },
  yAxisLabels: {
    width: 40,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    paddingRight: 8,
    paddingBottom: VERTICAL_PADDING_BOTTOM,
  },
  yAxisLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
  },
  gridLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    paddingBottom: VERTICAL_PADDING_BOTTOM,
  },
  gridLine: {
    height: 1,
    backgroundColor: Colors.gray200,
  },
  chartCanvas: {
    height: CHART_HEIGHT,
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  xAxisLabel: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  // Header row with filter
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  periodFilter: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  periodButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  periodButtonActive: {
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  periodButtonTextActive: {
    color: Colors.textPrimary,
  },
  // Breakdown tab styles - Summary and Stacked Bar
  spendingSummary: {
    marginBottom: 24,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  summaryTotal: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: Colors.gray200,
  },
  stackedBarSegment: {
    height: '100%',
  },
  // Category list
  categoryList: {
    gap: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryColor: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  categoryPercentage: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  categoryAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  chartPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  // Empty and loading states
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
  pieChartContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  periodIndicator: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
