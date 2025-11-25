import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfile, updateProfile } from '../services/profiles';
import { useAuth } from './AuthProvider';

type LanguageContextType = {
  currentLanguage: string;
  changeLanguage: (lang: string) => Promise<void>;
  t: (key: string, options?: any) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = '@aura_spend_language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n, t } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize language: prioritize Supabase profile if logged in, otherwise use AsyncStorage
  useEffect(() => {
    if (authLoading) return; // Wait for auth to finish loading
    
    initializeLanguage();
  }, [authLoading, session]);

  const initializeLanguage = async () => {
    try {
      // If user is logged in, try to load from profile first
      if (session) {
        console.log('[LanguageProvider] User logged in, loading language from profile...');
        const profile = await getProfile();
        console.log('[LanguageProvider] Profile data:', profile);
        console.log('[LanguageProvider] Preferred language:', profile?.preferred_language);
        
        if (profile?.preferred_language) {
          console.log('[LanguageProvider] Using profile language:', profile.preferred_language);
          await i18n.changeLanguage(profile.preferred_language);
          setCurrentLanguage(profile.preferred_language);
          // Sync to AsyncStorage
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, profile.preferred_language);
          console.log('[LanguageProvider] Language initialized to:', profile.preferred_language);
          setIsInitialized(true);
          return;
        }
      }
      
      // Fallback: load from AsyncStorage
      console.log('[LanguageProvider] Loading language from AsyncStorage...');
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage) {
        console.log('[LanguageProvider] Using AsyncStorage language:', savedLanguage);
        await i18n.changeLanguage(savedLanguage);
        setCurrentLanguage(savedLanguage);
      } else {
        console.log('[LanguageProvider] No saved language found, using default');
      }
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize language:', error);
      setIsInitialized(true);
    }
  };

  const changeLanguage = async (lang: string) => {
    try {
      // Change i18n language
      await i18n.changeLanguage(lang);
      setCurrentLanguage(lang);

      // Save to AsyncStorage
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);

      // If user is logged in, save to profile
      if (session) {
        try {
          await updateProfile({ preferred_language: lang });
        } catch (error) {
          console.error('Failed to save language to profile:', error);
          // Continue even if profile update fails
        }
      }
    } catch (error) {
      console.error('Failed to change language:', error);
      throw error;
    }
  };

  return (
    <LanguageContext.Provider value={{ currentLanguage, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
