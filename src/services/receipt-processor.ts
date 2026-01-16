/**
 * 收据处理器 - 完整流程
 * 
 * 这个文件负责处理从图片上传到最终结构化数据的完整流程
 * 架构设计：
 * 1. OCR 层（预留接口，暂未实现）
 * 2. 多模态 LLM 直接分析层（当前使用）
 * 3. 数据清洗和验证层
 */

import { Platform } from 'react-native';
import { getOpenAIConfig } from './openai-config';
import { getCategories } from './categories';
import { getCurrencies } from './currencies';
import { getPaymentMethods } from './payment-methods';
import { getProfile } from './profiles';
import type { Currency } from './currencies';
import { formatDateTimeISO, getCurrentLocalTimeISO, getTimezoneOffset, normalizeDateFromLLM } from '../utils/datetime';

/**
 * 收据数据结构
 */
export interface ReceiptItem {
  name: string;    // Item name
  amount: number;  // Quantity
  price: number;   // Unit price
}

export interface ReceiptData {
  merchant: string;        // 商家名称
  amount: number;          // 金额（总额）
  date?: string;           // 交易日期时间 (ISO 格式 YYYY-MM-DDTHH:MM)
  items?: ReceiptItem[];   // 购买项目列表 - 详细项目信息
  description?: string;    // 描述
  category?: string;       // 分类建议
  isNewCategory?: boolean; // 是否是新分类建议（不在现有分类列表中）
  is_income?: boolean;     // 是否是收入 (true = 收入, false/undefined = 支出)
  currency?: string;       // 货币代码 (USD, HKD, CNY, etc.)
  payment_method?: string | null; // 支付方式 (Cash, VISA, Apple Pay, etc.)
}

/**
 * OCR 识别结果（预留接口）
 */
export interface OCRResult {
  rawText: string;         // 识别的原始文本
  confidence?: number;     // 置信度 (0-1)
  language?: string;       // 识别的语言
}

/**
 * 处理进度回调
 */
export interface ProcessingProgress {
  step: 'converting' | 'ocr' | 'analyzing' | 'parsing' | 'complete';
  message: string;
  progress: number; // 0-100
}

/**
 * ============================================================
 * 步骤 1: 图片转 Base64
 * ============================================================
 * 
 * 平台兼容性说明：
 * - Web: 使用 Fetch API + FileReader
 * - Android: 使用 expo-file-system，支持 file:// 和 content:// URI
 * - iOS: 使用 expo-file-system，支持 file:// URI
 */
async function convertImageToBase64(imageUri: string): Promise<string> {
  try {
    console.log('[Receipt Processor] ===== Image Conversion Start =====');
    console.log('[Receipt Processor] Platform:', Platform.OS);
    console.log('[Receipt Processor] Original URI:', imageUri);
    
    // Web 平台使用 Fetch API + FileReader
    if (Platform.OS === 'web') {
      try {
        console.log('[Receipt Processor] Using web conversion method');
        const response = await fetch(imageUri);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const blob = await response.blob();
        console.log('[Receipt Processor] Blob size:', blob.size, 'bytes');
        console.log('[Receipt Processor] Blob type:', blob.type);
        
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            // Remove data:image/...;base64, prefix
            const base64 = base64data.split(',')[1];
            console.log('[Receipt Processor] ✅ Image converted to base64 (web), size:', base64.length);
            resolve(base64);
          };
          reader.onerror = (error) => {
            console.error('[Receipt Processor] FileReader error:', error);
            reject(new Error('Failed to read image as base64'));
          };
          reader.readAsDataURL(blob);
        });
      } catch (error: any) {
        console.error('[Receipt Processor] ❌ Web conversion failed:', error);
        throw new Error(`Failed to read image file on web: ${error.message}`);
      }
    }
    
    // Native 平台 (Android & iOS) 使用 expo-file-system
    console.log('[Receipt Processor] Using native conversion method');
    
    try {
      const FileSystem = require('expo-file-system');
      
      // 验证 FileSystem 模块加载成功
      if (!FileSystem || !FileSystem.readAsStringAsync) {
        throw new Error('expo-file-system module not properly loaded');
      }
      
      // expo-file-system 需要完整的 URI
      // Android: 支持 file:// 和 content:// (从图库选择时)
      // iOS: 支持 file://
      let normalizedUri = imageUri;
      
      // 确保 URI 格式正确
      if (Platform.OS === 'android') {
        // Android: content:// URIs 可以直接使用，file:// URIs 也可以
        if (!normalizedUri.startsWith('file://') && !normalizedUri.startsWith('content://')) {
          normalizedUri = `file://${normalizedUri}`;
        }
      } else if (Platform.OS === 'ios') {
        // iOS: 需要 file:// 前缀
        if (!normalizedUri.startsWith('file://')) {
          normalizedUri = `file://${normalizedUri}`;
        }
      }
      
      console.log('[Receipt Processor] Normalized URI:', normalizedUri);
      
      // 读取文件为 base64
      const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('[Receipt Processor] ✅ Image converted to base64 (native), size:', base64.length);
      return base64;
      
    } catch (error: any) {
      console.error('[Receipt Processor] ❌ Native conversion failed:', error);
      console.error('[Receipt Processor] Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      
      // 提供更有帮助的错误信息
      if (error.message?.includes('no such file')) {
        throw new Error('Image file not found. Please try selecting the image again.');
      } else if (error.message?.includes('permission')) {
        throw new Error('Permission denied. Please allow file access in your device settings.');
      } else if (error.message?.includes('not properly loaded')) {
        throw new Error('File system module not available. Please restart the app.');
      } else {
        throw new Error(`Failed to read image file: ${error.message || 'Unknown error'}`);
      }
    }
  } catch (error) {
    console.error('[Receipt Processor] ===== Image Conversion Failed =====');
    throw error;
  }
}

/**
 * ============================================================
 * 步骤 2: OCR 识别（预留接口，暂不实现）
 * ============================================================
 * 
 * 未来可以在这里集成：
 * - Tesseract.js (开源 OCR)
 * - Google Vision API
 * - AWS Textract
 * - Azure Computer Vision
 * 
 * 目前跳过此步骤，直接使用多模态 LLM
 */
async function performOCR(imageBase64: string): Promise<OCRResult> {
  console.log('[Receipt Processor] OCR step - Currently skipped, using multimodal LLM instead');
  
  // TODO: 实现 OCR 逻辑
  // 示例接口：
  // const result = await someOCRService.recognize(imageBase64);
  // return {
  //   rawText: result.text,
  //   confidence: result.confidence,
  //   language: result.language
  // };
  
  return {
    rawText: '', // OCR 暂未实现，返回空
    confidence: 0,
  };
}

/**
 * ============================================================
 * 步骤 3: 使用多模态 LLM 直接分析收据图片
 * ============================================================
 */
async function analyzeReceiptWithMultimodalLLM(
  imageBase64: string,
  existingCategories: string[],
  availableCurrencies: string[],
  availablePaymentMethods: string[]
): Promise<ReceiptData> {
  try {
    // 从 settings 读取用户配置
    const config = await getOpenAIConfig();
    
    if (!config) {
      throw new Error('OpenAI is not configured. Please go to Settings and configure your API.');
    }

    const { apiUrl, apiKey, receiptModel } = config;
    
    console.log('[Receipt Processor] Using model:', receiptModel);
    console.log('[Receipt Processor] API URL:', apiUrl);

    // Get user's preferred language from profile
    let userLanguage = 'en'; // default
    try {
      const profile = await getProfile();
      if (profile?.preferred_language) {
        userLanguage = profile.preferred_language;
      }
    } catch (error) {
      console.warn('[Receipt Processor] Failed to load user language, using default:', error);
    }
    console.log('[Receipt Processor] User language:', userLanguage);

    // 构建 API 请求
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const endpoint = `${baseUrl}/chat/completions`;

    // 构建 prompt - 要求 LLM 直接从图片中提取信息
    const categoryList = existingCategories.length > 0 
      ? existingCategories.join(', ') 
      : 'No existing categories';
    
    const currencyList = availableCurrencies.length > 0
      ? availableCurrencies.join(', ')
      : 'USD, HKD, CNY';
    
    const paymentMethodList = availablePaymentMethods.length > 0
      ? availablePaymentMethods.join(', ')
      : 'Cash, Credit Card, Debit Card, VISA, Mastercard, American Express, Apple Pay, Google Pay, PayPal, WeChat Pay, Alipay, Bank Transfer, Other';
    
    const currentLocalTime = getCurrentLocalTimeISO();
    const tzOffset = getTimezoneOffset();

    const systemPrompt = `You are a professional receipt analysis expert. Your task is to extract structured data from receipt images with maximum accuracy.

⚠️  CRITICAL OUTPUT REQUIREMENTS

1. Return ONLY raw JSON - NO markdown code blocks, NO explanations, NO extra text
2. Every field listed below MUST be present in your response
3. JSON must be syntactically valid and directly parseable
4. Use double quotes for all strings, proper number formatting

📋 REQUIRED JSON STRUCTURE

{
  "merchant": "Store Name",
  "amount": 45.67,
  "currency": "USD",
  "date": "2025-11-17T14:30",
  "items": [
    {"name": "Item Name", "amount": 2, "price": 12.50},
    {"name": "Another Item", "amount": 1, "price": 20.67}
  ],
  "description": "Brief purchase summary",
  "category": "category name",
  "isNewCategory": false,
  "is_income": false,
  "payment_method": "VISA"
}

📖 FIELD EXTRACTION RULES

- currency (required, string): Choose the currency code from the available list below.
  Extract from receipt symbols, text, or context. If the receipt does not clearly indicate the currency,
  infer it from the receipt's primary language and the user's language preference (${userLanguage}).
  Note: Some currency symbols (e.g. "$", "¥") are used in multiple countries and languages. Please carefully consider the receipt's language and context when inferring currency.
  Available: ${currencyList}
- amount (required, number): Total bill amount as a decimal (e.g., 12.34). NOT a string.
- date (required, string): ISO format YYYY-MM-DDTHH:MM. Use 24-hour time. If missing, use 12:00.
- category (required, string): Choose from list below, or suggest new one
  Available: ${categoryList}
- is_income (required, boolean): true if this is an INCOME/REFUND/DEPOSIT (money received). false if this is an EXPENSE/PAYMENT (money spent). Default to false.
- isNewCategory (required, boolean): true if you suggested new category, false otherwise
- items (required, array): Individual line items as objects with EXACT structure: 
  {name: "item name", amount: quantity (number), price: unit price (number)}
  If receipt shows "2 x $3.50", then amount=2, price=3.50
  If item quantity unclear, use amount=1
  Return empty array [] if no items visible
- payment_method (optional, string): Payment method used for this transaction.
  Look for payment information in the receipt footer/payment section.
  Choose from the available list below. If unclear or not visible on receipt, return null.
  Available: ${paymentMethodList}
- merchant (required, string): The store/restaurant name. Extract from receipt header or footer.
- description (required, string): Brief (1-2 sentence) summary of purchase

🌐 LANGUAGE GUIDANCE

User's selected language: ${userLanguage}

**Output Language:** Generate all text fields (merchant, description, item names, category) in the user's selected language (${userLanguage}).

**Currency Inference:** If the receipt doesn't clearly show currency, infer from the receipt's text language and user's language preference.

**RESPONSE FORMAT:**
Output NOTHING but the JSON object. No markdown formatting, no backticks, no explanation.
If you cannot extract information, use sensible defaults or empty values.`;

  // Add a short instruction to use user's local current time as a reference where needed
  const timeReferenceNote = `\n🕒 USER CURRENT LOCAL TIME (REFERENCE)\nThe user's current local time is: ${currentLocalTime} (timezone offset: ${tzOffset}).\nIf the receipt lacks a year or a time, use the user's current local date/time as a reference to fill missing fields.\nIf the receipt gives only month and day (e.g., 11/17 or Nov 17) but no year, assume the year is ${new Date().getFullYear()} unless context suggests otherwise.\nIf the receipt gives no time, assume 12:00 (noon) unless a more accurate time can be inferred from the receipt.\n`;

    const requestBody = {
      model: receiptModel,
      messages: [
        {
          role: 'system',
          content: systemPrompt + timeReferenceNote,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this receipt and return ONLY the JSON object with no other text:',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.2, // 极低温度确保一致输出
      max_tokens: 800,
      top_p: 0.9,
    };

    console.log('[Receipt Processor] Sending request to LLM...');
    console.log('[Receipt Processor] Current local time reference:', currentLocalTime, 'tz offset:', tzOffset);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Receipt Processor] API Error:', errorText);
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('[Receipt Processor] API Response received');
    console.log('[Receipt Processor] Status:', data.model);
    
    // 提取响应内容
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in API response');
    }

    console.log('[Receipt Processor] ===== LLM Raw Response =====');
    console.log(content);
    console.log('[Receipt Processor] ===== End Raw Response =====');

    // 解析 JSON（处理可能的 markdown 包装）
    const parsedData = parseJSONFromResponse(content);
    
    console.log('[Receipt Processor] ===== Parsed Data =====');
    console.log(JSON.stringify(parsedData, null, 2));
    console.log('[Receipt Processor] ===== End Parsed Data =====');
    
    // 验证和清洗数据
    const cleanedData = sanitizeReceiptData(parsedData, existingCategories);
    
    console.log('[Receipt Processor] Final receipt data:', cleanedData);
    return cleanedData;

  } catch (error: any) {
    console.error('[Receipt Processor] Analysis failed:', error);
    throw new Error(error.message || 'Failed to analyze receipt with AI');
  }
}

/**
 * ============================================================
 * 辅助函数：从 LLM 响应中提取 JSON
 * ============================================================
 */
function parseJSONFromResponse(content: string): any {
  console.log('[Receipt Processor] Parsing response content...');
  console.log('[Receipt Processor] Content length:', content.length);
  console.log('[Receipt Processor] Content preview:', content.substring(0, 200));
  
  try {
    // 尝试直接解析
    const directParse = JSON.parse(content);
    console.log('[Receipt Processor] ✅ Successfully parsed JSON directly');
    return directParse;
  } catch (e) {
    console.log('[Receipt Processor] Direct parse failed, trying alternative methods...');
  }
  
  // 方法 1: 尝试从 markdown 代码块中提取
  const markdownPatterns = [
    /```json\s*([\s\S]*?)\s*```/,
    /```\s*([\s\S]*?)\s*```/,
  ];
  
  for (const pattern of markdownPatterns) {
    const match = content.match(pattern);
    if (match) {
      try {
        const jsonStr = match[1];
        console.log('[Receipt Processor] Found JSON in markdown block');
        const parsed = JSON.parse(jsonStr);
        console.log('[Receipt Processor] ✅ Successfully parsed JSON from markdown');
        return parsed;
      } catch (e) {
        console.log('[Receipt Processor] Failed to parse markdown JSON block:', (e as Error).message);
      }
    }
  }
  
  // 方法 2: 尝试找到第一个 { 和最后一个 }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    try {
      const jsonStr = content.substring(firstBrace, lastBrace + 1);
      console.log('[Receipt Processor] Extracted potential JSON substring');
      const parsed = JSON.parse(jsonStr);
      console.log('[Receipt Processor] ✅ Successfully parsed extracted JSON');
      return parsed;
    } catch (e) {
      console.log('[Receipt Processor] Failed to parse extracted JSON:', (e as Error).message);
    }
  }
  
  // 方法 3: 清理常见的 LLM 响应问题
  try {
    // 移除注释和控制字符
    let cleaned = content
      .replace(/\/\/.*$/gm, '') // 移除 // 注释
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除 /* */ 注释
      .trim();
    
    // 尝试解析清理后的内容
    const parsed = JSON.parse(cleaned);
    console.log('[Receipt Processor] ✅ Successfully parsed cleaned JSON');
    return parsed;
  } catch (e) {
    console.log('[Receipt Processor] Failed to parse cleaned JSON:', (e as Error).message);
  }
  
  // 所有方法都失败了
  console.error('[Receipt Processor] ❌ Could not extract valid JSON from response');
  console.error('[Receipt Processor] Full response content:', content);
  throw new Error(`Could not extract JSON from response. Response was: ${content.substring(0, 100)}...`);
}

/**
 * ============================================================
 * 辅助函数：清洗和验证收据数据
 * ============================================================
 */
function sanitizeReceiptData(data: any, existingCategories: string[]): ReceiptData {
  // 确保所有必需字段存在且格式正确
  const category = String(data.category || 'Other').trim();
  const isNewCategory = data.isNewCategory === true || !existingCategories.includes(category);
  
  // 处理 currency - 验证并提供默认值
  let currency = String(data.currency || 'USD').trim().toUpperCase();
  const validCurrencies = ['USD', 'HKD', 'CNY', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
  if (!validCurrencies.includes(currency)) {
    console.warn('[Receipt Processor] Invalid currency:', currency, '- defaulting to USD');
    currency = 'USD';
  }
  
  // 处理 items - 新格式是对象数组
  let items: ReceiptItem[] = [];
  if (Array.isArray(data.items)) {
    items = data.items
      .map((item: any) => {
        // 支持对象格式或字符串格式
        if (typeof item === 'object' && item !== null && item.name) {
          return {
            name: String(item.name || '').trim(),
            amount: Math.max(0, Number(item.amount) || 1),
            price: Math.max(0, Number(item.price) || 0),
          };
        } else if (typeof item === 'string') {
          return {
            name: String(item).trim(),
            amount: 1,
            price: 0,
          };
        }
        return null;
      })
      .filter((item: any) => item !== null && item.name);
  }
  
  // Handle payment_method - allow null if not provided
  const paymentMethod = data.payment_method ? String(data.payment_method).trim() : null;
  
  const normalizedDate = normalizeDateFromLLM(data.date);
  return {
    merchant: String(data.merchant || 'Unknown Merchant').trim(),
    amount: Math.max(0, Number(data.amount) || 0),
    date: normalizedDate,
    items: items,
    description: String(data.description || '').trim(),
    category: category,
    is_income: data.is_income === true,
    isNewCategory: isNewCategory,
    currency: currency,
    payment_method: paymentMethod,
  };
}

// Date/time related logic was moved to `src/utils/datetime.ts`

/**
 * ============================================================
 * 主函数：处理收据图片（完整流程）
 * ============================================================
 * 
 * @param imageUri - 图片的本地 URI
 * @param onProgress - 可选的进度回调函数
 * @returns 结构化的收据数据
 * 
 * 使用示例：
 * ```typescript
 * import { processReceiptImage } from '@/src/services/receipt-processor';
 * 
 * try {
 *   const receiptData = await processReceiptImage(imageUri, (progress) => {
 *     console.log(`${progress.step}: ${progress.message} (${progress.progress}%)`);
 *   });
 *   
 *   // 使用收据数据
 *   setAmount(receiptData.amount.toString());
 *   setMerchant(receiptData.merchant);
 *   // ...
 * } catch (error) {
 *   Alert.alert('Error', error.message);
 * }
 * ```
 */
export async function processReceiptImage(
  imageUri: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ReceiptData> {
  try {
    console.log('[Receipt Processor] ===== Starting receipt processing =====');
    console.log('[Receipt Processor] Image URI:', imageUri);

    // 步骤 1: 转换图片为 Base64
    onProgress?.({
      step: 'converting',
      message: 'Converting image...',
      progress: 10,
    });
    const base64Image = await convertImageToBase64(imageUri);

    // 步骤 2: OCR（当前跳过）
    onProgress?.({
      step: 'ocr',
      message: 'OCR processing (skipped)...',
      progress: 30,
    });
    // const ocrResult = await performOCR(base64Image); // 暂时跳过

    // 步骤 3: 获取现有分类列表、货币列表和支付方式列表
    let existingCategories: string[] = [];
    let availableCurrencies: string[] = [];
    let availablePaymentMethods: string[] = [];
    try {
      const categories = await getCategories();
      existingCategories = categories.map(c => c.name);
      console.log('[Receipt Processor] Loaded existing categories:', existingCategories);
    } catch (error) {
      console.warn('[Receipt Processor] Failed to load categories, proceeding without them:', error);
    }
    
    try {
      const currencies = await getCurrencies();
      availableCurrencies = currencies.map((c: Currency) => c.code);
      console.log('[Receipt Processor] Loaded available currencies:', availableCurrencies);
    } catch (error) {
      console.warn('[Receipt Processor] Failed to load currencies, using defaults:', error);
      availableCurrencies = ['USD', 'HKD', 'CNY'];
    }
    
    try {
      const paymentMethods = await getPaymentMethods();
      availablePaymentMethods = paymentMethods.map(m => m.name);
      console.log('[Receipt Processor] Loaded available payment methods:', availablePaymentMethods);
    } catch (error) {
      console.warn('[Receipt Processor] Failed to load payment methods, using defaults:', error);
      availablePaymentMethods = ['Cash', 'Credit Card', 'Debit Card', 'VISA', 'Mastercard', 'American Express', 'Apple Pay', 'Google Pay', 'PayPal', 'WeChat Pay', 'Alipay', 'Bank Transfer', 'Other'];
    }

    // 步骤 4: 使用多模态 LLM 直接分析
    onProgress?.({
      step: 'analyzing',
      message: 'Analyzing receipt with AI...',
      progress: 50,
    });
    const receiptData = await analyzeReceiptWithMultimodalLLM(base64Image, existingCategories, availableCurrencies, availablePaymentMethods);

    // 步骤 5: 完成
    onProgress?.({
      step: 'complete',
      message: 'Processing complete!',
      progress: 100,
    });

    console.log('[Receipt Processor] ===== Processing complete =====');
    return receiptData;

  } catch (error: any) {
    console.error('[Receipt Processor] ===== Processing failed =====');
    console.error('[Receipt Processor] Error:', error);
    
    // 提供更友好的错误信息
    if (error.message.includes('not configured')) {
      throw new Error('Please configure OpenAI API in Settings first');
    } else if (error.message.includes('API request failed')) {
      throw new Error('Failed to connect to AI service. Please check your API settings.');
    } else {
      throw new Error(error.message || 'Failed to process receipt');
    }
  }
}

/**
 * ============================================================
 * 导出类型和主函数
 * ============================================================
 */
