import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View, Modal, TextInput, FlatList, Text, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';
import { Gradients } from '../constants/theme';
import { sendChatCompletion, ChatMessage } from '../src/services/openai-client';
import { allTools, getSystemPromptWithTime, Tool, parseMultipleToolCalls, isValidToolName } from '../src/services/chat-tools';
import { renderMarkdownAsReactNative } from '../src/utils/markdownHelper';

interface FloatingChatButtonProps {
  onPress?: () => void;
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  isToolCall?: boolean;
  isAIExplanation?: boolean;
  toolCall?: {
    name: string;
    arguments: any;
    isExpanded?: boolean;
    isExecuting?: boolean;
    result?: any;
    error?: string;
  };
}

interface PendingToolCall {
  name: string;
  arguments: any;
  description: string;
  isExpanded?: boolean;
  isExecuting?: boolean;
  result?: any;
  error?: string;
}

export default function FloatingChatButton({ onPress }: FloatingChatButtonProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);
  const [typingDots, setTypingDots] = useState('');
  const textInputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);
  const isLoadingMessages = useRef(false);

  // Load messages from AsyncStorage on component mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        isLoadingMessages.current = true;
        const storedMessages = await AsyncStorage.getItem('chatMessages');
        if (storedMessages) {
          const parsedMessages = JSON.parse(storedMessages);
          setMessages(parsedMessages);
          // Scroll to bottom after loading messages
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 100);
        }
      } catch (error) {
        console.error('Error loading chat messages:', error);
      } finally {
        isLoadingMessages.current = false;
      }
    };
    loadMessages();
  }, []);

  // Save messages to AsyncStorage whenever messages change
  useEffect(() => {
    if (!isLoadingMessages.current) {
      const saveMessages = async () => {
        try {
          // Create a serializable version of messages
          const serializableMessages = messages.map(msg => ({
            ...msg,
            toolCall: msg.toolCall ? {
              ...msg.toolCall,
              // Remove any non-serializable properties from arguments and result
              arguments: JSON.parse(JSON.stringify(msg.toolCall.arguments || {})),
              result: msg.toolCall.result ? JSON.parse(JSON.stringify(msg.toolCall.result)) : undefined,
            } : undefined,
          }));
          await AsyncStorage.setItem('chatMessages', JSON.stringify(serializableMessages));
        } catch (error) {
          console.error('Error saving chat messages:', error);
        }
      };
      saveMessages();
    }
  }, [messages]);

  useEffect(() => {
    let interval: number;
    if (isLoading) {
      interval = setInterval(() => {
        setTypingDots(prev => {
          if (prev === '...') return '';
          return prev + '.';
        });
      }, 500);
      // Scroll to end when loading starts
      scrollToEnd();
    } else {
      setTypingDots('');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  // Add keyboard listener to scroll to bottom when keyboard shows
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      // Delay to ensure layout has adjusted
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => {
      keyboardDidShowListener?.remove();
    };
  }, []);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Default action: show chat modal
      setModalVisible(true);
      // Scroll to bottom when modal opens
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 200);
    }
  };

  const scrollToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async () => {
    if (inputText.trim() && !isLoading) {
      const userMessage: Message = {
        id: Date.now().toString(),
        text: inputText,
        isUser: true,
      };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInputText('');
      setIsLoading(true);
      scrollToEnd();

      try {
        // Prepare messages for AI
        // Filter out tool call messages and replace with execution summary
        const chatMessages: ChatMessage[] = [
          { role: 'system', content: getSystemPromptWithTime() },
          ...updatedMessages.map(m => {
            if (m.isToolCall && m.toolCall) {
              // If the tool call has been executed with a result, include that context
              if (m.toolCall.result) {
                return {
                  role: 'assistant' as const,
                  content: `[Tool executed: ${m.toolCall.name} - Result: ${JSON.stringify(m.toolCall.result)}]`
                };
              }
              // If tool call is still pending or failed, skip it from context
              return null;
            }
            return {
              role: m.isUser ? 'user' as const : 'assistant' as const,
              content: m.isAIExplanation ? m.text : m.text
            };
          }).filter(Boolean) as ChatMessage[]
        ];

        // Call OpenAI WITHOUT tools parameter - let AI return JSON format
        const response = await sendChatCompletion({
          messages: chatMessages,
          temperature: 0.7,
        });

        const aiContent = response.choices[0].message.content || '';
        console.log('FloatingChatButton: AI response content:', aiContent);

        // Parse all tool calls from AI response (supports agent chaining)
        const toolCalls = parseMultipleToolCalls(aiContent);
        console.log('FloatingChatButton: Parsed tool calls:', toolCalls);

        if (toolCalls.length > 0) {
          // AI returned one or more tool calls
          // Display all of them as pending confirmations
          for (let i = 0; i < toolCalls.length; i++) {
            const toolCallData = toolCalls[i];
            
            // Show AI's explanation
            const explanationMessage: Message = {
              id: (Date.now() + i * 1000).toString(),
              text: toolCallData.explanation,
              isUser: false,
              isAIExplanation: true,
            };
            setMessages(prev => [...prev, explanationMessage]);
            
            // Only show tool confirmation for valid tools
            if (isValidToolName(toolCallData.toolName)) {
              const tool = allTools.find(t => t.name === toolCallData.toolName);
              if (tool) {
                const toolCallMessage: Message = {
                  id: (Date.now() + i * 1000 + 1).toString(),
                  text: 'Pending confirmation',
                  isUser: false,
                  isToolCall: true,
                  toolCall: {
                    name: tool.name,
                    arguments: toolCallData.parameters,
                    isExpanded: true,
                    isExecuting: false,
                  }
                };
                setMessages(prev => [...prev, toolCallMessage]);
              }
            } else {
              // Invalid tool name - show as regular message
              console.warn(`Tool "${toolCallData.toolName}" not found.`);
              const invalidToolMessage: Message = {
                id: (Date.now() + i * 1000 + 1).toString(),
                text: `⚠️ Tool not found: ${toolCallData.toolName}`,
                isUser: false,
              };
              setMessages(prev => [...prev, invalidToolMessage]);
            }
          }
          scrollToEnd();
        } else {
          // Regular message response (no tool calls detected)
          const aiResponse: Message = {
            id: (Date.now() + 1).toString(),
            text: aiContent || 'I received your message.',
            isUser: false,
          };
          setMessages(prev => [...prev, aiResponse]);
          scrollToEnd();
        }
      } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: 'Sorry, I encountered an error. Please try again.',
          isUser: false,
        };
        setMessages(prev => [...prev, errorMessage]);
        scrollToEnd();
      } finally {
        setIsLoading(false);
      }
    }
  };

  const confirmToolCall = async (messageId: string) => {
    // Find the message and update its tool call state
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.toolCall) {
        return {
          ...msg,
          toolCall: {
            ...msg.toolCall,
            isExecuting: true,
          }
        };
      }
      return msg;
    }));
    scrollToEnd();

    try {
      // Find the tool
      const message = messages.find(m => m.id === messageId);
      if (!message || !message.toolCall) return;

      const tool = allTools.find(t => t.name === message.toolCall!.name);
      if (tool) {
        const result = await tool.function(message.toolCall.arguments);
        
        // Update message with result
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId && msg.toolCall) {
            return {
              ...msg,
              toolCall: {
                ...msg.toolCall,
                isExecuting: false,
                result,
                isExpanded: false,
              }
            };
          }
          return msg;
        }));
        scrollToEnd();

        // Update the message with the result
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId && msg.toolCall) {
            return {
              ...msg,
              toolCall: {
                ...msg.toolCall,
                isExecuting: false,
                result,
                isExpanded: false,
              }
            };
          }
          return msg;
        }));
        scrollToEnd();

        // Check if there are any remaining pending tool calls
        // Give React time to update state before checking
        setTimeout(() => {
          setMessages(currentMessages => {
            const pendingToolCalls = currentMessages.filter(
              m => m.isToolCall && m.toolCall && !m.toolCall.result && !m.toolCall.error && !m.toolCall.isExecuting
            );

            // If no more pending tool calls, send results to AI
            if (pendingToolCalls.length === 0) {
              sendToolChainResultToAI(currentMessages, result, message.toolCall!.name);
            }

            return currentMessages;
          });
        }, 100);
      }
    } catch (error) {
      console.error('Error executing tool:', error);
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.toolCall) {
          return {
            ...msg,
            toolCall: {
              ...msg.toolCall,
              isExecuting: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          };
        }
        return msg;
      }));
      setIsLoading(false);
    }
  };

  const sendToolChainResultToAI = (messagesState: Message[], result: any, toolName: string) => {
    // Build the context with all messages including tool results
    const allMessages = messagesState.map(m => ({
      role: m.isUser ? 'user' as const : 'assistant' as const,
      content: m.isAIExplanation ? m.text : m.isToolCall && m.toolCall?.result ? `Tool ${m.toolCall.name} executed with result: ${JSON.stringify(m.toolCall.result)}` : m.text
    }));

    // Prepare context for AI - show the tool result and let AI decide what to do next
    // AI can either: 1) Call more tools if needed, or 2) Provide a summary
    const toolResultContext: ChatMessage[] = [
      { role: 'system', content: getSystemPromptWithTime() },
      ...allMessages,
      { 
        role: 'user', 
        content: `Tool executed: "${toolName}" with result: ${JSON.stringify(result, null, 2)}\n\nBased on this result, you can either:\n1. Call another tool if needed using the JSON format\n2. Provide a helpful summary if the task is complete`
      }
    ];

    // Send to AI and handle response
    (async () => {
      setIsLoading(true);
      scrollToEnd();
      
      try {
        const aiResponse = await sendChatCompletion({
          messages: toolResultContext,
          temperature: 0.7,
          max_tokens: 500
        });

        const aiContent = aiResponse.choices[0].message.content || '';
        console.log('FloatingChatButton: Tool chain AI response content:', aiContent);

        // Check if AI wants to call more tools
        const moreToolCalls = parseMultipleToolCalls(aiContent);
        console.log('FloatingChatButton: Tool chain parsed tool calls:', moreToolCalls);

        if (moreToolCalls.length > 0) {
          // AI wants to continue with more tool calls - add them as new pending confirmations
          console.log(`AI wants to execute ${moreToolCalls.length} more tool calls`);
          
          for (let i = 0; i < moreToolCalls.length; i++) {
            const toolCallData = moreToolCalls[i];
            
            // Show AI's explanation
            const explanationMessage: Message = {
              id: (Date.now() + i * 1000).toString(),
              text: toolCallData.explanation,
              isUser: false,
              isAIExplanation: true,
            };
            setMessages(prev => [...prev, explanationMessage]);
            
            // Show tool confirmation for valid tools
            if (isValidToolName(toolCallData.toolName)) {
              const tool = allTools.find(t => t.name === toolCallData.toolName);
              if (tool) {
                const toolCallMessage: Message = {
                  id: (Date.now() + i * 1000 + 1).toString(),
                  text: 'Pending confirmation',
                  isUser: false,
                  isToolCall: true,
                  toolCall: {
                    name: tool.name,
                    arguments: toolCallData.parameters,
                    isExpanded: true,
                    isExecuting: false,
                  }
                };
                setMessages(prev => [...prev, toolCallMessage]);
              }
            }
          }
          scrollToEnd();
        } else {
          // AI decided to provide summary/response instead of more tool calls
          const aiSummary: Message = {
            id: (Date.now() + 2).toString(),
            text: aiContent || 'Tool executed successfully.',
            isUser: false,
          };
          setMessages(prev => [...prev, aiSummary]);
          scrollToEnd();
        }
      } catch (aiError) {
        console.error('Error getting AI response after tool execution:', aiError);
        // Still show success even if AI response fails
        const successMessage: Message = {
          id: (Date.now() + 2).toString(),
          text: `Tool executed successfully.`,
          isUser: false,
        };
        setMessages(prev => [...prev, successMessage]);
        scrollToEnd();
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  const clearHistory = async () => {
    setMessages([]);
    setInputText('');
    try {
      await AsyncStorage.removeItem('chatMessages');
    } catch (error) {
      console.error('Error clearing chat messages:', error);
    }
  };

  const cancelToolCall = (messageId: string) => {
    // Update the message to show it was cancelled
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.toolCall) {
        return {
          ...msg,
          text: `Action cancelled`,
          toolCall: {
            ...msg.toolCall,
            isExpanded: false,
            error: 'Cancelled by user',
          }
        };
      }
      return msg;
    }));
    scrollToEnd();

    // Check if there are any remaining pending tool calls after cancellation
    setTimeout(() => {
      setMessages(currentMessages => {
        const pendingToolCalls = currentMessages.filter(
          m => m.isToolCall && m.toolCall && !m.toolCall.result && !m.toolCall.error && !m.toolCall.isExecuting
        );

        // If no more pending tool calls, send results to AI
        if (pendingToolCalls.length === 0) {
          // Get the cancelled message for context
          const cancelledMsg = currentMessages.find(m => m.id === messageId);
          sendToolChainResultToAI(currentMessages, null, cancelledMsg?.toolCall?.name || 'unknown');
        }

        return currentMessages;
      });
    }, 100);
  };

  const handleBackPress = () => {
    if (isInputFocused) {
      textInputRef.current?.blur();
    } else {
      closeModal();
    }
  };

  return (
    <>
      <LinearGradient
        colors={Gradients.primary.colors}
        start={Gradients.primary.start}
        end={Gradients.primary.end}
        style={styles.fabGradient}
      >
        <TouchableOpacity style={styles.fab} onPress={handlePress}>
          <Ionicons name="chatbubble-ellipses" size={24} color={Colors.white} />
        </TouchableOpacity>
      </LinearGradient>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleBackPress}
      >
        <View style={styles.fixedOverlay} />
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.modalContentWrapper}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Aura Assistant</Text>
                <TouchableOpacity onPress={closeModal}>
                  <Ionicons name="close" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>
            
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              ref={flatListRef}
              renderItem={({ item, index }) => (
                <View>
                  {item.isAIExplanation ? (
                    <View style={[styles.messageContainer, styles.aiMessage]}>
                      <Text style={[styles.messageText, styles.aiMessageText, { fontStyle: 'italic' }]}>
                        💭 {item.text}
                      </Text>
                    </View>
                  ) : item.isToolCall ? (
                    <View style={styles.toolCallContainer}>
                      {(() => {
                        const prefix = item.toolCall?.isExecuting
                          ? '🔄 '
                          : item.toolCall?.error
                            ? '❌ '
                            : item.toolCall?.result
                              ? '✅ '
                              : '⚙️ ';
                        const title = item.toolCall?.name || 'Tool action';
                        const headerText = `${prefix}${title}`;
                        return (
                          <TouchableOpacity 
                            style={styles.toolCallHeader}
                            onPress={() => setMessages(prev => prev.map(msg => 
                              msg.id === item.id && msg.toolCall
                                ? { ...msg, toolCall: { ...msg.toolCall, isExpanded: !msg.toolCall.isExpanded } }
                                : msg
                            ))}
                          >
                            <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.toolCallText} numberOfLines={1}>
                              {headerText}
                            </Text>
                          </View>
                          <Ionicons 
                            name={item.toolCall?.isExpanded ? "chevron-up" : "chevron-down"} 
                            size={16} 
                            color={Colors.textSecondary} 
                          />
                          </TouchableOpacity>
                        );
                      })()}
                      
                      {item.toolCall?.isExpanded && (
                        <View style={styles.toolCallDetails}>
                          <Text style={styles.toolCallDescription}>
                            Tool: {item.toolCall.name}{'\n'}
                            Parameters: {JSON.stringify(item.toolCall.arguments, null, 2)}
                          </Text>
                          
                          {item.toolCall.isExecuting && (
                            <Text style={styles.executingText}>Executing...</Text>
                          )}
                          
                          {item.toolCall.result && (
                            <View style={styles.resultContainer}>
                              <Text style={styles.resultLabel}>✅ Success:</Text>
                              <Text style={styles.resultText}>{JSON.stringify(item.toolCall.result, null, 2)}</Text>
                            </View>
                          )}
                          
                          {item.toolCall.error && (
                            <View style={styles.errorContainer}>
                              <Text style={styles.errorLabel}>❌ Error:</Text>
                              <Text style={styles.errorText}>{item.toolCall.error}</Text>
                            </View>
                          )}
                          
                          {!item.toolCall.isExecuting && !item.toolCall.result && !item.toolCall.error && (
                            <View style={styles.toolCallButtons}>
                              <TouchableOpacity 
                                style={[styles.toolButton, styles.confirmButton]} 
                                onPress={() => confirmToolCall(item.id)}
                              >
                                <Text style={styles.confirmButtonText}>Confirm</Text>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={[styles.toolButton, styles.cancelButton]} 
                                onPress={() => cancelToolCall(item.id)}
                              >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  ) : (
                    <>
                      {item.isUser ? (
                        <LinearGradient
                          colors={Gradients.userMessage.colors}
                          start={Gradients.userMessage.start}
                          end={Gradients.userMessage.end}
                          style={[styles.messageContainer, styles.userMessage]}
                        >
                          <Text style={[styles.messageText, styles.userMessageText]}>{item.text}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={[styles.messageContainer, styles.aiMessage]}>
                          {renderMarkdownAsReactNative(item.text, Colors.textPrimary)}
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
              ListFooterComponent={
                isLoading ? (
                  <View style={[styles.messageContainer, styles.aiMessage]}>
                    <Text style={[styles.messageText, styles.aiMessageText]}>Aura Assistant is typing{typingDots}</Text>
                  </View>
                ) : null
              }
              style={styles.messagesList}
            />
            
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.clearButton} onPress={clearHistory}>
                <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TextInput
                ref={textInputRef}
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type your message..."
                placeholderTextColor={Colors.textSecondary}
                onSubmitEditing={sendMessage}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                editable={!isLoading}
              />
              <TouchableOpacity 
                style={[
                  styles.sendButtonWrapper,
                  (isLoading || !inputText.trim()) && styles.sendButtonWrapperDisabled
                ]} 
                onPress={sendMessage} 
                disabled={isLoading || !inputText.trim()}
              >
                {(isLoading || !inputText.trim()) ? (
                  <View style={[styles.sendButton, styles.sendButtonDisabled]}>
                    <Ionicons name="send" size={20} color={Colors.white} />
                  </View>
                ) : (
                  <LinearGradient
                    colors={Gradients.primary.colors}
                    start={Gradients.primary.start}
                    end={Gradients.primary.end}
                    style={styles.sendButton}
                  >
                    <Ionicons name="send" size={20} color={Colors.white} />
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabGradient: {
    position: 'absolute',
    right: 16,
    bottom: 152,
    width: 48,
    height: 48,
    borderRadius: 24,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    opacity: 0.6,
  },
  fab: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fixedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContentWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    width: '95%',
    height: '80%',
    padding: 15,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  messagesList: {
    flex: 1,
    marginBottom: 20,
  },
  messageContainer: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: undefined, // Will be overridden by gradient in LinearGradient
    borderRadius: 10,
    maxWidth: '85%',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(220, 225, 232, 0.65)',
    maxWidth: '85%',
  },
  messageText: {
    fontSize: 16,
  },
  userMessageText: {
    color: Colors.white,
  },
  aiMessageText: {
    color: Colors.textPrimary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    paddingTop: 10,
  },
  clearButton: {
    width: 46,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 0,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginRight: 10,
    color: Colors.textPrimary,
  },
  sendButtonWrapper: {
    borderRadius: 22,
    width: 44,
    height: 44,
    overflow: 'hidden',
  },
  sendButtonWrapperDisabled: {
    opacity: 0.5,
  },
  sendButton: {
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  toolCallContainer: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    width: '85%',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(220, 225, 232, 0.65)',
  },
  toolCallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  toolCallText: {
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },
  toolCallDetails: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    paddingTop: 10,
  },
  toolCallDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  executingText: {
    fontSize: 14,
    color: Colors.primary,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  resultContainer: {
    backgroundColor: Colors.white,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  resultLabel: {
    fontSize: 12,
    color: Colors.success || Colors.primary,
    fontWeight: 'bold',
    marginBottom: 5,
    padding: 1,
  },
  resultText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontFamily: 'monospace',
  },
  errorContainer: {
    backgroundColor: Colors.gray100,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  errorLabel: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: 'bold',
    marginBottom: 5,
    padding: 1,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
  },
  toolCallButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  toolButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    minWidth: 80,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  confirmButtonText: {
    color: Colors.white,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: Colors.gray300,
  },
  cancelButtonText: {
    color: Colors.textPrimary,
  },
});
