/**
 * Pet Phrases Configuration
 * Contains localized phrases for pet interactions
 */

export const PET_PHRASES = {
  en: [
    "Saving a bit today, freer tomorrow. 🐾💰",
    "Tiny savings, big peace. 🛡️✨",
    "Let your coins quietly grow. 🌱💸",
    "Smart saving brings dreams closer. 🎁💖",
    "Spend a little, save a little. ⚖️🐱",
    "Small steps, big goals. ✨📈",
    "Will this still feel worth it later? 🧠💵",
    "Each coin builds your freedom. 🗝️🌈",
    "Less impulse, more purpose. 🎯💚",
    "Save now, stress less. 🐶📊",
    "Even one coin counts. 🐾📈",
    "Tracking money is self‑care. 🤗💸",
    "Progress beats perfection. 🌤️📆",
    "Quiet savings, big upgrades. 🕹️💰",
    "Choose long‑term joy, not impulse. 💖⏳",
    "Cute goal, steady steps. 🎉🎯",
    "Money is your tool, not your boss. 🧩👑",
    "Pause before you pay. ⏸️🏆",
    "One ‘no’ powers your dreams. 🙅‍♂️🌟",
    "You and your wallet are a team. 🐾💼",
    "One less snack, one more coin. 🍪➡️💰",
    "Coins today, choices tomorrow. 🪙➡️🎯",
    "You’re quietly getting richer. 🤫💸",
    "Your savings grow while you rest. 😴📈",
    "Think goal first, then buy. 🎯🛒",
    "Budget first, shopping later. 📋🛍️",
    "A plan is the best discount. 🧠💰",
    "Tiny cuts, huge results. ✂️📊",
    "Save for joy, not for fear. 🌈💵",
    "A calm wallet, a calm mind. 😌💼",
    "Less stuff, more freedom. 📦❌🗽",
    "Let patience grow your money. ⏳🌱",
    "Track it to control it. 📝💸",
    "Dream first, swipe later. 🌟💳",
    "Needs first, wants later. ✅➡️✨",
    "Your goals are cheering for you. 📣🎯",
    "Skip one impulse, win one step. 🏃‍♀️📈",
    "Savings are your soft shield. 🛡️💚",
    "Treat each coin kindly. 🐾🪙",
    "I’m proud of every tiny effort. 🥹💰"
  ],
  zh: [
    "一点点存，明天更轻松。🐾💰",
    "小小存款，大大安心。🛡️✨",
    "让钱像树苗慢慢长。🌱💸",
    "聪明存钱，靠近梦想。🎁💖",
    "想花就花，也别忘存。⚖️🐱",
    "小步伐，大目标。✨📈",
    "买前想想，值不值。🧠💵",
    "你在替未来铺路。🗝️🌈",
    "少点冲动，多点目标。🎯💚",
    "多存一点，少烦一点。🐶📊",
    "只存一点也很棒。🐾📈",
    "记账存钱，是种温柔。🤗💸",
    "不求完美，只求进步。🌤️📆",
    "安静的存款在升级你。🕹️💰",
    "克制一下，多点幸福。💖⏳",
    "小目标，也该被庆祝。🎉🎯",
    "钱是工具，不是主人。🧩👑",
    "花前停一下，你就赢。⏸️🏆",
    "少一次乱买，多一点梦。🙅‍♂️🌟",
    "你和钱包，是好搭档。🐾💼",
    "少一杯奶茶，多一块存款。🧋➡️💰",
    "今天多一块，明天多选择。🪙➡️🎯",
    "你在悄悄变富。🤫💸",
    "睡觉时，钱也在长。😴📈",
    "先想目标，再想购物。🎯🛒",
    "先做预算，再去买单。📋🛍️",
    "最好的优惠是有计划。🧠💰",
    "小小削减，大大成果。✂️📊",
    "为快乐存钱，不为恐惧。🌈💵",
    "钱包安稳，人就安心。😌💼",
    "少点东西，多点自由。📦❌🗽",
    "耐心一点，钱长更快。⏳🌱",
    "记下来，才管得住。📝💸",
    "先想梦想，再刷卡。🌟💳",
    "先满足需要，再考虑想要。✅➡️✨",
    "你的目标在为你鼓掌。📣🎯",
    "少一次冲动，多一步进步。🏃‍♀️📈",
    "存款是柔软的小铠甲。🛡️💚",
    "把每一块都温柔对待。🐾🪙",
    "我真的为你的努力骄傲。🥹💰"
  ]
};

/**
 * Get a random phrase in the specified language
 * Ensures the new phrase is different from the previous one
 */
export function getRandomPetPhrase(language: 'en' | 'zh', previousPhrase?: string): string {
  const phrases = PET_PHRASES[language];
  
  if (phrases.length === 0) {
    return "...";
  }
  
  if (phrases.length === 1) {
    return phrases[0];
  }
  
  let newPhrase;
  do {
    newPhrase = phrases[Math.floor(Math.random() * phrases.length)];
  } while (newPhrase === previousPhrase);
  
  return newPhrase;
}
