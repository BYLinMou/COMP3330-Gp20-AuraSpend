import { supabase } from './supabase';

// 与 items 表对应的类型
// 注意：根据数据库结构，created_at 和 updated_at 字段不存在
export interface ItemRow {
  id: string;
  transaction_id: string;
  item_name: string;
  item_amount: number;
  item_price: number;
  user_id: string;
}

// Add.tsx 中的 ReceiptItem 接口的简化映射
export interface ReceiptItemInput {
  name: string;      // item_name
  amount: number;    // item_amount
  price: number;     // item_price (单价)
}

/**
 * 批量为某个交易(transaction)插入收据条目
 * @param transactionId 交易 ID
 * @param items ReceiptItemInput 数组
 */
export async function addReceiptItems(
  transactionId: string,
  items: ReceiptItemInput[]
) {
  if (!transactionId) {
    throw new Error('transactionId 不能为空');
  }
  if (!items || items.length === 0) {
    return [] as ItemRow[]; // 无需插入
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('用户未认证，无法保存条目');
  }

  // 构造待插入的行
  const rows = items.map(it => ({
    transaction_id: transactionId,
    item_name: it.name?.trim() || 'Item',
    item_amount: Number.isFinite(it.amount) ? it.amount : 1,
    item_price: Number.isFinite(it.price) ? it.price : 0,
    user_id: user.id,
  }));

  const { data, error } = await supabase
    .from('items')
    .insert(rows)
    .select();

  if (error) {
    console.error('[items] 插入收据条目失败:', error);
    throw error;
  }

  return data as ItemRow[];
}

/**
 * 根据 transaction_id 获取该交易的所有条目
 */
export async function getItemsByTransaction(transactionId: string) {
  console.log(`[getItemsByTransaction] Starting fetch for transaction: ${transactionId}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('用户未认证');
  }
  console.log(`[getItemsByTransaction] User ID: ${user.id}`);
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('user_id', user.id);
  if (error) {
    console.error('[items] 获取交易条目失败:', error);
    throw error;
  }
  console.log(`[getItemsByTransaction] Query result:`, data);
  console.log(`[getItemsByTransaction] Found ${data?.length || 0} items`);
  return data as ItemRow[];
}

/**
 * 删除某条 item 记录
 */
export async function deleteItem(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('用户未认证');
  }
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    console.error('[items] 删除条目失败:', error);
    throw error;
  }
  return true;
}

/**
 * 更新某条 item 记录
 */
export async function updateItem(
  id: string,
  updates: Partial<Omit<ItemRow, 'id' | 'transaction_id' | 'user_id'>>
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('用户未认证');
  }
  const { data, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) {
    console.error('[items] 更新条目失败:', error);
    throw error;
  }
  return data as ItemRow;
}

/**
 * 测试函数：读取指定 transaction 的所有 items 并打印到控制台
 * @param transactionId 交易 ID
 */
export async function testGetTransactionItems(transactionId: string) {
  try {
    console.log(`[测试] 开始读取 transaction: ${transactionId} 的所有 items...`);
    
    const items = await getItemsByTransaction(transactionId);
    
    console.log(`[测试] 成功读取 ${items.length} 个 items:`);
    items.forEach((item, index) => {
      console.log(`  [${index + 1}] ${item.item_name}`);
      console.log(`      数量: ${item.item_amount}`);
      console.log(`      单价: ${item.item_price}`);
      console.log(`      总价: ${item.item_amount * item.item_price}`);
      console.log(`      ID: ${item.id}`);
    });
    
    if (items.length === 0) {
      console.log('[测试] 该交易没有任何条目');
    }
    
    return items;
  } catch (error) {
    console.error('[测试] 读取 items 失败:', error);
    throw error;
  }
}

/**
 * 调试函数：获取当前用户的所有 items（不限交易）
 */
export async function debugGetAllUserItems() {
  try {
    console.log('[DEBUG] Fetching all items for current user...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('用户未认证');
    }
    
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', user.id);
    
    if (error) {
      console.error('[DEBUG] 获取所有 items 失败:', error);
      throw error;
    }
    
    console.log(`[DEBUG] 总共找到 ${data?.length || 0} 个 items:`);
    data?.forEach((item, index) => {
      console.log(`  [${index + 1}] Transaction: ${item.transaction_id}, Item: ${item.item_name}, Qty: ${item.item_amount}, Price: ${item.item_price}`);
    });
    
    // 按 transaction_id 分组统计
    const byTransaction: Record<string, number> = {};
    data?.forEach(item => {
      byTransaction[item.transaction_id] = (byTransaction[item.transaction_id] || 0) + 1;
    });
    
    console.log('[DEBUG] Items 按交易分组:');
    Object.entries(byTransaction).forEach(([txId, count]) => {
      console.log(`  Transaction ${txId}: ${count} items`);
    });
    
    return data as ItemRow[];
  } catch (error) {
    console.error('[DEBUG] debugGetAllUserItems 失败:', error);
    throw error;
  }
}
