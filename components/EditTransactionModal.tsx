import React, { useState, useEffect } from 'react';
import { Modal, View, SafeAreaView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { useLanguage } from '../src/providers/LanguageProvider';
import { TransactionForm, type TransactionFormValues } from './TransactionForm';
import { updateTransactionWithItems, type Transaction } from '../src/services/transactions';
import { getItemsByTransaction, type ItemRow } from '../src/services/items';

interface EditTransactionModalProps {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  transaction,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [originalAmount, setOriginalAmount] = useState(0);

  // Load items when transaction changes
  useEffect(() => {
    if (visible && transaction) {
      setOriginalAmount(transaction.amount); // Store original amount with sign
      loadItems();
    }
  }, [visible, transaction?.id]);

  const loadItems = async () => {
    if (!transaction) return;
    try {
      setLoadingItems(true);
      const fetchedItems = await getItemsByTransaction(transaction.id);
      setItems(fetchedItems);
    } catch (error) {
      console.error('Error loading items:', error);
      // Continue without items if fetch fails
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSubmit = async (values: TransactionFormValues) => {
    if (!transaction) return;

    try {
      // Convert items format from form to API format
      const itemsForApi = values.items.map(item => ({
        id: item.id,
        name: item.name,
        amount: item.amount,
        price: item.price,
      }));

      // Preserve the original sign (positive for income, negative for expense)
      // If original was negative (expense), keep it negative
      // If original was positive (income), keep it positive
      const finalAmount = originalAmount >= 0 ? Math.abs(values.amount) : -Math.abs(values.amount);

      await updateTransactionWithItems(transaction.id, {
        amount: finalAmount,
        occurred_at: values.occurred_at.toISOString(),
        merchant: values.merchant,
        category_id: values.category_id,
        note: values.note,
        payment_method: values.payment_method,
        currency: values.currency,
        items: itemsForApi,
      });

    //   Alert.alert('Success', 'Transaction updated successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating transaction:', error);
      Alert.alert(t('home.error'), t('add.failedToSave'));
    }
  };

  if (!transaction) {
    return null;
  }

  const initialValues: Partial<TransactionFormValues> = {
    amount: Math.abs(transaction.amount),
    occurred_at: new Date(transaction.occurred_at),
    merchant: transaction.merchant,
    category_id: transaction.category_id,
    note: transaction.note,
    payment_method: transaction.payment_method,
    currency: transaction.currency,
    items: items.map(item => ({
      id: item.id,
      name: item.item_name,
      amount: item.item_amount,
      price: item.item_price,
    })),
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('home.editTransaction')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {loadingItems ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <TransactionForm
              initialValues={initialValues}
              onSubmit={handleSubmit}
              onCancel={onClose}
              submitLabel={t('home.save')}
            />
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray300,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  closeButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
