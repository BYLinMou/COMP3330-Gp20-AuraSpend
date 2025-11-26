export interface AvailablePet {
  id: string;
  type: string;
  breed: string;
  emoji: string;
  xp_cost: number;
  description: string;
  // No translation key needed: translations live in this config under `translations`.
  // Per-language translations for UI display. Fallback to `breed` and `description` if missing
  translations?: {
    en?: { breed?: string; description?: string };
    zh?: { breed?: string; description?: string };
  };
}

// Central list of available pets (UI, shop, and services import this). 'translations' contains per-language
// localized `breed` and `description` that UI should prefer.
export const AVAILABLE_PETS: AvailablePet[] = [
  {
    id: 'turtle_common',
    type: 'turtle',
    breed: 'Box Turtle',
    emoji: '🐢',
    xp_cost: 500,
    description: 'Slow and steady wins the race!',
    translations: {
      en: { breed: 'Box Turtle', description: 'Slow and steady wins the race!' },
      zh: { breed: '箱龟', description: '慢而稳，总会成功！' },
    },
  },
  {
    id: 'hamster_syrian',
    type: 'hamster',
    breed: 'Syrian Hamster',
    emoji: '🐹',
    xp_cost: 400,
    description: 'Energetic and adorable!',
    translations: {
      en: { breed: 'Syrian Hamster', description: 'Energetic and adorable!' },
      zh: { breed: '叙利亚仓鼠', description: '精力充沛，超可爱！' },
    },
  },
  {
    id: 'rabbit_dutch',
    type: 'rabbit',
    breed: 'Dutch Rabbit',
    emoji: '🐰',
    xp_cost: 600,
    description: 'Hop to financial success!',
    translations: {
      en: { breed: 'Dutch Rabbit', description: 'Hop to financial success!' },
      zh: { breed: '荷兰兔', description: '蹦跳到理财成功！' },
    },
  },
  {
    id: 'bird_parrot',
    type: 'bird',
    breed: 'Parrot',
    emoji: '🦜',
    xp_cost: 700,
    description: 'Squawk your way to savings!',
    translations: {
      en: { breed: 'Parrot', description: 'Squawk your way to savings!' },
      zh: { breed: '鹦鹉', description: '为存钱大声叫一声！' },
    },
  },
  {
    id: 'fish_goldfish',
    type: 'fish',
    breed: 'Goldfish',
    emoji: '🐠',
    xp_cost: 300,
    description: 'Swimming in savings!',
    translations: {
      en: { breed: 'Goldfish', description: 'Swimming in savings!' },
      zh: { breed: '金鱼', description: '在存钱的海洋里游来游去！' },
    },
  },
  { // 新宠物 1（猫）
    id: 'cat_siamese',
    type: 'cat',
    breed: 'Siamese Cat',
    emoji: '🐱',
    xp_cost: 550,
    description: 'Curious about every coin.',
    translations: {
        en: { breed: 'Siamese Cat', description: 'Curious about every coin!' },
        zh: { breed: '暹罗猫', description: '好奇每一枚存下的硬币！' },
    },
  },
  {  // 新宠物 2（狗）
    id: 'dog_corgi',
    type: 'dog',
    breed: 'Corgi',
    emoji: '🐶',
    xp_cost: 650,
    description: 'Small steps, big gains.',
    translations: {
        en: { breed: 'Corgi', description: 'Small steps, big gains!' },
        zh: { breed: '柯基', description: '小短腿，也能赚大收益！' },
    },
  },
  
];

export function getPetById(id: string): AvailablePet | undefined {
  return AVAILABLE_PETS.find((p) => p.id === id);
}

export function getLocalizedPetText(pet: AvailablePet, lang: 'en' | 'zh') {
  const language = lang === 'zh' ? 'zh' : 'en';
  return {
    breed: pet.translations?.[language]?.breed || pet.breed,
    description: pet.translations?.[language]?.description || pet.description,
  };
}

export function getPetByBreed(breed: string): AvailablePet | undefined {
  if (!breed) return undefined;
  return AVAILABLE_PETS.find((p) =>
    p.breed === breed ||
    p.translations?.en?.breed === breed ||
    p.translations?.zh?.breed === breed ||
    p.id === breed
  );
}
