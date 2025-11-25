import AsyncStorage from '@react-native-async-storage/async-storage';

// 在控制台运行此代码来检查语言设置
export async function debugLanguageSettings() {
  console.log('=== Language Debug Info ===');
  
  // 检查 AsyncStorage
  const storedLang = await AsyncStorage.getItem('@aura_spend_language');
  console.log('1. AsyncStorage language:', storedLang);
  
  // 检查 i18n 当前语言
  const i18n = require('../i18n').default;
  console.log('2. i18n current language:', i18n.language);
  console.log('3. i18n available languages:', i18n.languages);
  
  // 测试翻译
  console.log('4. Test translation (Profile Settings):', i18n.t('settings.profile.title'));
  console.log('5. Test translation (User Name):', i18n.t('settings.profile.userName'));
  
  // 检查 profile
  const { getProfile } = require('../services/profiles');
  try {
    const profile = await getProfile();
    console.log('6. Profile preferred_language:', profile?.preferred_language);
  } catch (e) {
    console.log('6. Error loading profile:', e.message);
  }
  
  console.log('=== End Debug Info ===');
}

// 如何使用：
// 1. 在应用中导入这个文件
// 2. 在 Settings 页面的 useEffect 中调用 debugLanguageSettings()
// 3. 查看控制台输出
