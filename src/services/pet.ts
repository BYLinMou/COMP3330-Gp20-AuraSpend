import { supabase } from './supabase';
import { AVAILABLE_PETS as CONFIG_AVAILABLE_PETS, AvailablePet as ConfigAvailablePet, getPetById, getLocalizedPetText, getPetByBreed } from '../config/availablePets';

export interface PetState {
  user_id: string;
  mood: number;        // 0-100
  hunger: number;      // 0-100
  xp: number;          // Experience points
  level: number;       // Current level
  last_feed_at: string;
  updated_at: string;
  current_pet_id?: string;
}

export interface UserPet {
  id: string;
  user_id: string;
  pet_type: string;    // 'dog', 'cat', 'turtle', 'hamster', etc.
  pet_breed: string;   // 'Labrador', 'Persian', etc.
  pet_name: string;    // User's name for the pet
  pet_emoji: string;   // Emoji representation
  is_active: boolean;  // Currently active pet
  purchased_at: string;
  created_at: string;
}

export type AvailablePet = ConfigAvailablePet;

// Available pets for purchase
export const AVAILABLE_PETS: AvailablePet[] = CONFIG_AVAILABLE_PETS;

export { getPetById, getLocalizedPetText, getPetByBreed };

/**
 * Get the current user's pet state
 */
export async function getPetState() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('pet_state')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error fetching pet state:', error);
      throw error;
    }

    // If no pet state exists, create one
    if (!data) {
      return await initializePet();
    }

    return data as PetState;
  } catch (error) {
    console.error('Failed to fetch pet state:', error);
    throw error;
  }
}

/**
 * Initialize pet state for a new user with optional starting pet
 */
export async function initializePet(petInfo?: {
  petType: string;
  petBreed: string;
  petName: string;
  petEmoji: string;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Ensure profile exists first
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code === 'PGRST116') {
      // Profile doesn't exist, create it
      await supabase
        .from('profiles')
        .insert([{ id: user.id }]);
    }

    // Create initial pet state
    const { data: petState, error: stateError } = await supabase
      .from('pet_state')
      .insert([
        {
          user_id: user.id,
          mood: 50,
          hunger: 100,
          xp: 0,
          level: 1,
        }
      ])
      .select()
      .single();

    if (stateError) {
      console.error('Error initializing pet state:', stateError);
      throw stateError;
    }

    // If pet info provided, create the first pet
    if (petInfo) {
      const { data: userPet, error: petError } = await supabase
        .from('user_pets')
        .insert([
          {
            user_id: user.id,
            pet_type: petInfo.petType,
            pet_breed: petInfo.petBreed,
            pet_name: petInfo.petName,
            pet_emoji: petInfo.petEmoji,
            is_active: true,
          }
        ])
        .select()
        .single();

      if (petError) {
        console.error('Error creating user pet:', petError);
        // Don't throw - pet state is created, pet can be added later
      } else if (userPet) {
        // Update pet state with current pet ID
        await supabase
          .from('pet_state')
          .update({ current_pet_id: userPet.id })
          .eq('user_id', user.id);
      }
    }

    return petState as PetState;
  } catch (error) {
    console.error('Failed to initialize pet:', error);
    throw error;
  }
}

/**
 * Feed the pet
 */
export async function feedPet() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get current state
    const currentState = await getPetState();
    
    // Update hunger (max 100) and mood
    const newHunger = Math.min(100, currentState.hunger + 20);
    const newMood = Math.min(100, currentState.mood + 10);

    const { data, error } = await supabase
      .from('pet_state')
      .update({
        hunger: newHunger,
        mood: newMood,
        last_feed_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error feeding pet:', error);
      throw error;
    }

    return data as PetState;
  } catch (error) {
    console.error('Failed to feed pet:', error);
    throw error;
  }
}

/**
 * Calculate XP required for a specific level
 * Level 1: 100 XP
 * Level 2: 150 XP
 * Level 3: 200 XP
 * Formula: 50 * level + 50
 */
export function getXPRequiredForLevel(level: number): number {
  return 50 * level + 50;
}

/**
 * Calculate total XP needed to reach a specific level from level 1
 */
export function getTotalXPForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += getXPRequiredForLevel(i);
  }
  return total;
}

/**
 * Calculate level from total XP
 */
export function calculateLevelFromXP(totalXP: number): { level: number; currentLevelXP: number; xpForNextLevel: number } {
  let level = 1;
  let xpUsed = 0;
  
  while (true) {
    const xpNeeded = getXPRequiredForLevel(level);
    if (xpUsed + xpNeeded > totalXP) {
      break;
    }
    xpUsed += xpNeeded;
    level++;
  }
  
  const currentLevelXP = totalXP - xpUsed;
  const xpForNextLevel = getXPRequiredForLevel(level);
  
  return { level, currentLevelXP, xpForNextLevel };
}

/**
 * Add XP to the pet (called when user completes tasks)
 */
export async function addXP(amount: number) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const currentState = await getPetState();
    const newTotalXP = currentState.xp + amount;
    
    // Calculate potential new level based on total XP
    const { level: calculatedLevel } = calculateLevelFromXP(newTotalXP);
    
    // Check if level up is allowed (Mood must be 100)
    let newLevel = currentState.level;
    let leveledUp = false;
    let levelsGained = 0;
    let blockedByMood = false;

    if (calculatedLevel > currentState.level) {
      if (currentState.mood >= 100) {
        newLevel = calculatedLevel;
        leveledUp = true;
        levelsGained = newLevel - currentState.level;
      } else {
        blockedByMood = true;
      }
    }

    const updates: any = {
      xp: newTotalXP,
      level: newLevel,
    };

    // Bonus mood if leveled up (10 per level gained)
    if (leveledUp) {
      updates.mood = Math.min(100, currentState.mood + (levelsGained * 10));
    }

    const { data, error } = await supabase
      .from('pet_state')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error adding XP:', error);
      throw error;
    }

    return { 
      pet: data as PetState, 
      leveledUp, 
      levelsGained,
      xpGained: amount,
      blockedByMood
    };
  } catch (error) {
    console.error('Failed to add XP:', error);
    throw error;
  }
}

// ...existing code...

/**
 * Pet the pet (rub/stroke) to increase happiness
 */
export async function petPet(amount: number = 5) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const currentState = await getPetState();
    let newMood = currentState.mood + amount;
    let xpGained = 0;
    let leveledUp = false;
    let levelsGained = 0;

    // If happiness is already 100 (or reaches 100), add XP
    if (currentState.mood >= 100) {
      newMood = 100;
      xpGained = 5;
    } else {
      newMood = Math.min(100, newMood);
    }

    // Calculate new XP
    const newTotalXP = currentState.xp + xpGained;
    
    // Check for level up (especially if mood just hit 100 or was 100)
    const { level: calculatedLevel } = calculateLevelFromXP(newTotalXP);
    let newLevel = currentState.level;

    if (calculatedLevel > currentState.level && newMood >= 100) {
      newLevel = calculatedLevel;
      leveledUp = true;
      levelsGained = newLevel - currentState.level;
    }

    const { data, error } = await supabase
      .from('pet_state')
      .update({ 
        mood: newMood,
        xp: newTotalXP,
        level: newLevel
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error petting pet:', error);
      throw error;
    }

    return { 
      ...(data as PetState),
      xpGained,
      leveledUp,
      levelsGained
    };
  } catch (error) {
    console.error('Failed to pet pet:', error);
    throw error;
  }
}

/**
 * Hit the pet to decrease happiness (negative interaction)
 */
export async function hitPet(amount: number = 10) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const currentState = await getPetState();
    let newMood = currentState.mood - amount;
    let xpLost = 0;

    // If happiness is 0 (or drops to 0), deduct XP
    if (currentState.mood <= 0) {
      newMood = 0;
      xpLost = 10;
    } else {
      newMood = Math.max(0, newMood);
    }

    const newTotalXP = Math.max(0, currentState.xp - xpLost);
    const { level: newLevel } = calculateLevelFromXP(newTotalXP);
    const leveledDown = newLevel < currentState.level;
    const levelsLost = currentState.level - newLevel;

    const { data, error } = await supabase
      .from('pet_state')
      .update({ 
        mood: newMood,
        xp: newTotalXP,
        level: newLevel,
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error hitting pet:', error);
      throw error;
    }

    return { 
      ...(data as PetState),
      xpLost,
      leveledDown,
      levelsLost,
    };
  } catch (error) {
    console.error('Failed to hit pet:', error);
    throw error;
  }
}

/**
 * Update pet mood and hunger based on time passed
 * Call this periodically (e.g., when user opens the app)
 */
export async function updatePetStatus() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const currentState = await getPetState();
    const lastFeed = new Date(currentState.last_feed_at);
    const now = new Date();
    const hoursPassed = (now.getTime() - lastFeed.getTime()) / (1000 * 60 * 60);

    // Decrease hunger and mood over time
    const hungerDecrease = Math.floor(hoursPassed * 2); // 2 points per hour
    const moodDecrease = Math.floor(hoursPassed * 1);   // 1 point per hour

    const newHunger = Math.max(0, currentState.hunger - hungerDecrease);
    const newMood = Math.max(0, currentState.mood - moodDecrease);

    // Only update if there's a change
    if (newHunger !== currentState.hunger || newMood !== currentState.mood) {
      const { data, error } = await supabase
        .from('pet_state')
        .update({
          hunger: newHunger,
          mood: newMood,
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating pet status:', error);
        throw error;
      }

      return data as PetState;
    }

    return currentState;
  } catch (error) {
    console.error('Failed to update pet status:', error);
    throw error;
  }
}

/**
 * Get all user's pets
 */
export async function getUserPets() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('user_pets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching user pets:', error);
      throw error;
    }

    return (data || []) as UserPet[];
  } catch (error) {
    console.error('Failed to fetch user pets:', error);
    throw error;
  }
}

/**
 * Get the currently active pet
 */
export async function getActivePet() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('user_pets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching active pet:', error);
      throw error;
    }

    return data as UserPet | null;
  } catch (error) {
    console.error('Failed to fetch active pet:', error);
    throw error;
  }
}

/**
 * Switch to a different pet
 */
export async function switchPet(petId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Deactivate all pets
    await supabase
      .from('user_pets')
      .update({ is_active: false })
      .eq('user_id', user.id);

    // Activate the selected pet
    const { data, error } = await supabase
      .from('user_pets')
      .update({ is_active: true })
      .eq('id', petId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error switching pet:', error);
      throw error;
    }

    // Update pet state with new current pet
    await supabase
      .from('pet_state')
      .update({ current_pet_id: petId })
      .eq('user_id', user.id);

    return data as UserPet;
  } catch (error) {
    console.error('Failed to switch pet:', error);
    throw error;
  }
}



/**
 * Purchase a new pet with XP
 */
export async function purchasePet(petId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get available pet info
    const availablePet = AVAILABLE_PETS.find(p => p.id === petId);
    if (!availablePet) {
      throw new Error('Pet not found');
    }

    // Check if user has enough XP
    const currentState = await getPetState();
    if (currentState.xp < availablePet.xp_cost) {
      throw new Error(`Not enough XP. You need ${availablePet.xp_cost} XP but only have ${currentState.xp} XP.`);
    }

    // Deduct XP
    const { error: xpError } = await supabase
      .from('pet_state')
      .update({ xp: currentState.xp - availablePet.xp_cost })
      .eq('user_id', user.id);

    if (xpError) {
      console.error('Error deducting XP:', xpError);
      throw xpError;
    }

    // Create the new pet
    const { data: newPet, error: petError } = await supabase
      .from('user_pets')
      .insert([
        {
          user_id: user.id,
          pet_type: availablePet.type,
          pet_breed: availablePet.breed,
          pet_name: availablePet.breed,
          pet_emoji: availablePet.emoji,
          is_active: false,
        }
      ])
      .select()
      .single();

    if (petError) {
      console.error('Error creating pet:', petError);
      throw petError;
    }

    return { pet: newPet as UserPet, xpSpent: availablePet.xp_cost };
  } catch (error) {
    console.error('Failed to purchase pet:', error);
    throw error;
  }
}
