import { supabase } from './supabase';

export interface Profile {
  id: string;
  created_at: string;
  username: string | null;
  primary_currency: string | null;
  preferred_language: string | null;
}

/**
 * Get the current user's profile
 */
export async function getProfile(): Promise<Profile> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error fetching profile:', error);
      throw error;
    }

    // If no profile exists, create one
    if (!data) {
      return await createProfile();
    }

    return data as Profile;
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    throw error;
  }
}

export type ProfileUpdateInput = {
  username?: string | null;
  primary_currency?: string | null;
  preferred_language?: string | null;
};

/**
 * Create a profile for a new user
 * This should typically be called after user signs up
 */
export async function createProfile(updates?: ProfileUpdateInput): Promise<Profile> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (existingProfile) {
      // If already exists and caller provided updates, apply them
      if (updates && (updates.username !== undefined || updates.primary_currency !== undefined)) {
        return await updateProfile(updates);
      }
      return existingProfile as Profile;
    }

    // Only include provided fields to avoid overwriting DB defaults
    const payload: Record<string, any> = { id: user.id };
    if (updates) {
      if (updates.username !== undefined) payload.username = updates.username;
      if (updates.primary_currency !== undefined) payload.primary_currency = updates.primary_currency;
      if (updates.preferred_language !== undefined) payload.preferred_language = updates.preferred_language;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      throw error;
    }

    return data as Profile;
  } catch (error) {
    console.error('Failed to create profile:', error);
    throw error;
  }
}

/**
 * Update current user's profile fields
 */
export async function updateProfile(updates: ProfileUpdateInput): Promise<Profile> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Only include fields that are explicitly provided
    const payload: Record<string, any> = {};
    if (updates.username !== undefined) payload.username = updates.username;
    if (updates.primary_currency !== undefined) payload.primary_currency = updates.primary_currency;
    if (updates.preferred_language !== undefined) payload.preferred_language = updates.preferred_language;

    if (Object.keys(payload).length === 0) {
      // Nothing to update; return current profile
      return await getProfile();
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      throw error;
    }

    return data as Profile;
  } catch (error) {
    console.error('Failed to update profile:', error);
    throw error;
  }
}

/**
 * Initialize a complete user account with profile, default categories, pet, etc.
 * Call this after successful sign up
 */
export async function initializeUserAccount(options?: ProfileUpdateInput) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Create profile (will skip if already exists)
    const profile = await createProfile(options);

    // Check if categories already exist
    const { data: existingCategories } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    // Create default categories only if none exist
    if (!existingCategories || existingCategories.length === 0) {
      const defaultCategories = [
        'Food',
        'Transport',
        'Entertainment',
        'Shopping',
        'Bills',
        'Healthcare',
        'Education',
        'Income',
        'Other',
      ];

      const { error: categoriesError } = await supabase
        .from('categories')
        .insert(
          defaultCategories.map(name => ({
            user_id: user.id,
            name,
          }))
        );

      if (categoriesError) {
        console.error('Error creating default categories:', categoriesError);
      }
    }

    // Check if pet state already exists
    const { data: existingPet } = await supabase
      .from('pet_state')
      .select('user_id')
      .eq('user_id', user.id)
      .single();

    // Initialize pet state only if it doesn't exist
    if (!existingPet) {
      const { error: petError } = await supabase
        .from('pet_state')
        .insert([
          {
            user_id: user.id,
            mood: 50,
            hunger: 100,
            xp: 0,
            level: 1,
          }
        ]);

      if (petError) {
        console.error('Error initializing pet:', petError);
      }
    }

    return { profile, success: true };
  } catch (error) {
    console.error('Failed to initialize user account:', error);
    throw error;
  }
}
