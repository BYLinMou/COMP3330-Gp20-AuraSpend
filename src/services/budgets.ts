import { supabase } from './supabase';

export interface Budget {
  id: string;
  user_id: string;
  period: 'monthly' | 'yearly';
  amount: number;
  start_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get current active budget for the user
 * Returns the most recent budget that has started (start_date <= today)
 */
export async function getCurrentBudget(): Promise<Budget | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const now = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', user.id)
      .lte('start_date', now)
      .order('start_date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching budget:', error);
      throw error;
    }

    return data as Budget | null;
  } catch (error) {
    console.error('Failed to fetch budget:', error);
    throw error;
  }
}

/**
 * Get monthly budget amount
 * If period is yearly, returns amount / 12
 * Returns default 2000 if no budget is set
 */
export async function getMonthlyBudgetAmount(): Promise<number> {
  try {
    const budget = await getCurrentBudget();
    
    if (!budget) {
      return 2000; // Default budget
    }

    if (budget.period === 'monthly') {
      return budget.amount;
    } else {
      // Yearly budget, divide by 12
      return budget.amount / 12;
    }
  } catch (error) {
    console.error('Failed to get monthly budget amount:', error);
    return 2000; // Default on error
  }
}

/**
 * Get weekly budget amount
 * If period is yearly, returns amount / 52
 * If period is monthly, returns amount / 4.345 (approx weeks/month)
 * Returns default ~460 if no budget is set
 */
export async function getWeeklyBudgetAmount(): Promise<number> {
  try {
    const budget = await getCurrentBudget();

    if (!budget) {
      // Default weekly value based on default monthly 2000
      return Math.round(2000 / 4.345);
    }

    if (budget.period === 'monthly') {
      return budget.amount / 4.345; // convert monthly to weekly
    } else {
      // Yearly budget, divide by 52
      return budget.amount / 52;
    }
  } catch (error) {
    console.error('Failed to get weekly budget amount:', error);
    return Math.round(2000 / 4.345);
  }
}

/**
 * Create or update budget
 * If a budget with the same period and start_date exists, it will be updated
 * Otherwise, a new budget will be created
 */
export async function setBudget(
  amount: number, 
  period: 'monthly' | 'yearly', 
  startDate: string
): Promise<Budget> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check if a budget already exists for this period and start date
    const { data: existingBudget } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', user.id)
      .eq('period', period)
      .eq('start_date', startDate)
      .single();

    if (existingBudget) {
      // Update existing budget
      const { data, error } = await supabase
        .from('budgets')
        .update({
          amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingBudget.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating budget:', error);
        throw error;
      }

      return data as Budget;
    } else {
      // Create new budget
      const { data, error } = await supabase
        .from('budgets')
        .insert([
          {
            amount,
            period,
            start_date: startDate,
            user_id: user.id,
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error creating budget:', error);
        throw error;
      }

      return data as Budget;
    }
  } catch (error) {
    console.error('Failed to set budget:', error);
    throw error;
  }
}

/**
 * Update current budget amount
 * Updates the most recent budget for the user
 */
export async function updateCurrentBudget(amount: number): Promise<Budget> {
  try {
    const currentBudget = await getCurrentBudget();
    
    if (!currentBudget) {
      // No budget exists, create a new monthly budget starting today
      const today = new Date().toISOString().split('T')[0];
      return await setBudget(amount, 'monthly', today);
    }

    // Update existing budget
    const { data, error } = await supabase
      .from('budgets')
      .update({
        amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentBudget.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating current budget:', error);
      throw error;
    }

    return data as Budget;
  } catch (error) {
    console.error('Failed to update current budget:', error);
    throw error;
  }
}

/**
 * Delete a budget by ID
 */
export async function deleteBudget(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting budget:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to delete budget:', error);
    throw error;
  }
}

/**
 * Get all budgets for the current user
 * Ordered by start_date descending
 */
export async function getAllBudgets(): Promise<Budget[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching budgets:', error);
      throw error;
    }

    return data as Budget[];
  } catch (error) {
    console.error('Failed to fetch budgets:', error);
    throw error;
  }
}
