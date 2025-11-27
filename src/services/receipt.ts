import * as FileSystem from 'expo-file-system';
import { sendChatCompletion, type ChatMessage } from './openai-client';
import { formatDateISO } from '../utils/datetime';

/**
 * 收据处理服务
 * 功能：
 * 1. 图片转 Base64（用于 API 传输）
 * 2. OCR 识别（通过 OpenAI Vision 或通用 OCR API）
 * 3. 调用 AI API 解析收据数据
 * 4. 结构化输出交易数据
 */

export interface ReceiptData {
  merchant: string; // 商家名称
  amount: number; // 金额
  date?: string; // 交易日期 (ISO 格式)
  items?: string[]; // 购买项目列表
  description?: string; // 描述
  category?: string; // 分类建议
}

export interface OCRResult {
  rawText: string; // OCR 识别的原始文本
  confidence?: number; // 置信度 (0-1)
}

/**
 * 第一步：读取图片文件并转换为 Base64
 * @param imageUri - 图片的本地 URI (如 file:///path/to/image.jpg)
 * @returns Base64 编码的图片数据
 */
export async function imageToBase64(imageUri: string): Promise<string> {
  try {
    // 处理不同平台的 URI 格式
    let filePath = imageUri;
    
    // 如果是 file:// URI，转换为本地路径
    if (filePath.startsWith('file://')) {
      filePath = decodeURIComponent(filePath.replace('file://', ''));
    }

    console.log('Reading image from:', filePath);
    const base64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return base64;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw new Error('Failed to read image file');
  }
}

/**
 * 第二步：执行 OCR 识别
 * 使用 OpenAI Vision API 识别收据中的文字
 * @param imageBase64 - Base64 编码的图片
 * @returns OCR 识别结果
 */
export async function performOCR(imageBase64: string): Promise<OCRResult> {
  try {
    const systemPrompt = `You are an OCR specialist. Extract all text from the receipt image clearly and accurately. 
    Return the text exactly as it appears, preserving line breaks and structure.`;

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Please perform OCR on this receipt image and extract all visible text.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ] as any, // any because ChatMessage type doesn't support image content
      },
    ];

    const response = await sendChatCompletion({
      messages,
      temperature: 0.1, // 低温度以获得更准确的识别
      max_tokens: 1000,
    });

    const extractedText = response.choices[0]?.message?.content || '';

    return {
      rawText: extractedText,
      confidence: 0.85, // 默认置信度，实际值取决于 API
    };
  } catch (error) {
    console.error('OCR failed:', error);
    throw new Error('Failed to perform OCR on image');
  }
}

/**
 * 第三步：解析 OCR 文本为结构化收据数据
 * 使用 AI 理解收据内容并提取关键信息
 * @param ocrText - OCR 识别的原始文本
 * @returns 解析后的收据数据
 */
export async function parseReceiptData(ocrText: string): Promise<ReceiptData> {
  try {
    const systemPrompt = `You are a receipt parsing specialist. Analyze the receipt text and extract key information.
    Return a JSON object with the following structure:
    {
      "merchant": "store/restaurant name",
      "amount": number (total amount in numeric format),
      "date": "YYYY-MM-DD" (if available, ISO format),
      "items": ["item1", "item2", ...] (list of purchased items if available),
      "description": "brief description of purchase",
      "category": "suggested category like Food, Shopping, Transport, etc"
    }
    
    Important:
    - Amount should be a number, not a string
    - If date is not found, omit the field
    - If items cannot be clearly identified, use empty array
    - Always provide a reasonable category guess`;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Please parse this receipt text and extract the information:\n\n${ocrText}`,
      },
    ];

    const response = await sendChatCompletion({
      messages,
      temperature: 0.5,
      max_tokens: 500,
    });

    const responseText = response.choices[0]?.message?.content || '{}';

    // 从 AI 响应中提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not find JSON in response');
    }

    const parsedData: ReceiptData = JSON.parse(jsonMatch[0]);

    // 数据验证和清理
    return sanitizeReceiptData(parsedData);
  } catch (error) {
    console.error('Failed to parse receipt data:', error);
    throw new Error('Failed to parse receipt information');
  }
}

/**
 * 清理和验证解析后的收据数据
 * @param data - 原始解析数据
 * @returns 清理后的数据
 */
function sanitizeReceiptData(data: ReceiptData): ReceiptData {
  return {
    merchant: String(data.merchant || '').trim() || 'Unknown Merchant',
    amount: Math.max(0, Number(data.amount) || 0),
    date: data.date ? formatDateISO(data.date) : undefined,
    items: Array.isArray(data.items) ? data.items.filter(Boolean) : [],
    description: String(data.description || '').trim(),
    category: String(data.category || '').trim() || 'Other',
  };
}

/**
 * 确保日期格式为 ISO 格式 (YYYY-MM-DD)
 * @param dateString - 输入的日期字符串
 * @returns ISO 格式的日期字符串
 */
// formatDateISO moved to `src/utils/datetime.ts`

/**
 * 完整流程：从图片到结构化数据
 * 这是主要的导出函数，UI 应该调用这个
 * @param imageUri - 图片 URI
 * @returns 最终的收据数据
 */
export async function processReceipt(imageUri: string): Promise<ReceiptData> {
  try {
    console.log('Starting receipt processing...');

    // 步骤 1: 转换图片为 Base64
    console.log('Step 1: Converting image to base64...');
    const base64Image = await imageToBase64(imageUri);

    // 步骤 2: 执行 OCR
    console.log('Step 2: Performing OCR...');
    const ocrResult = await performOCR(base64Image);
    console.log('OCR Result:', ocrResult);

    // 步骤 3: 解析收据数据
    console.log('Step 3: Parsing receipt data...');
    const receiptData = await parseReceiptData(ocrResult.rawText);
    console.log('Final receipt data:', receiptData);

    return receiptData;
  } catch (error) {
    console.error('Receipt processing failed:', error);
    throw error;
  }
}

/**
 * 使用示例：
 * 
 * import { processReceipt } from '@/src/services/receipt';
 * 
 * try {
 *   const receiptData = await processReceipt(imageUri);
 *   console.log('Merchant:', receiptData.merchant);
 *   console.log('Amount:', receiptData.amount);
 *   console.log('Category:', receiptData.category);
 *   
 *   // 然后可以将 receiptData 用于创建交易记录
 *   await addTransaction({
 *     amount: -receiptData.amount,
 *     merchant: receiptData.merchant,
 *     occurred_at: receiptData.date || new Date().toISOString(),
 *     category_id: getCategoryIdFromName(receiptData.category),
 *     source: 'ocr',
 *     note: receiptData.items?.join(', '),
 *   });
 * } catch (error) {
 *   Alert.alert('Error', error.message);
 * }
 */
