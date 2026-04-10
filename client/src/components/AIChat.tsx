import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  MessageCircle, 
  Send, 
  Camera, 
  Image as ImageIcon, 
  Loader2, 
  Bot,
  User,
  Plus,
  Trash2,
  RotateCcw
} from 'lucide-react';
import type { ChatConversation, ChatMessage } from '@shared/schema';

interface AIChatProps {
  children?: React.ReactNode;
  className?: string;
}

export function AIChat({ children, className }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();

  // Fetch conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ChatConversation[]>({
    queryKey: ['/api/chat/conversations'],
    enabled: isOpen && !!user,
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat/conversations', selectedConversation, 'messages'],
    enabled: isOpen && !!selectedConversation,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-select first conversation or create new one
  useEffect(() => {
    if (conversations.length > 0 && !selectedConversation) {
      setSelectedConversation(conversations[0].id);
    }
  }, [conversations, selectedConversation]);

  // Create new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      return apiRequest('/api/chat/conversations', 'POST', { title });
    },
    onSuccess: async (response) => {
      const newConversation = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
      setSelectedConversation(newConversation.id);
      haptic.success();
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to create new conversation',
        variant: 'destructive',
      });
    },
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, imageUrl }: { message: string; imageUrl?: string }) => {
      return apiRequest(`/api/chat/conversations/${selectedConversation}/messages`, 'POST', {
        content: message,
        imageUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/chat/conversations', selectedConversation, 'messages'] 
      });
      setMessage('');
      haptic.success();
    },
    onError: (error: any) => {
      haptic.error();
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to send message';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Delete conversation
  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return apiRequest(`/api/chat/conversations/${conversationId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
      if (selectedConversation === conversations.find(c => c.id === selectedConversation)?.id) {
        setSelectedConversation(null);
      }
      haptic.delete();
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
    },
  });

  // Upload image
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/chat/upload-image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload image');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setIsUploading(false);
      haptic.upload();
      // Send message with uploaded image
      sendMessageMutation.mutate({
        message: message || 'Please analyze this image',
        imageUrl: data.imageUrl,
      });
    },
    onError: () => {
      setIsUploading(false);
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to upload image',
        variant: 'destructive',
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedConversation) return;
    
    sendMessageMutation.mutate({ message });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Please select an image smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    uploadImageMutation.mutate(file);
  };

  const handleNewConversation = () => {
    const title = `Chat ${new Date().toLocaleString()}`;
    createConversationMutation.mutate(title);
  };

  if (!user) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button
            variant="outline"
            size="icon"
            className={`fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg bg-yellow-400 hover:bg-yellow-500 border-yellow-500 z-50 ${className}`}
            data-testid="button-ai-chat"
          >
            <MessageCircle className="h-6 w-6 text-black" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl w-full h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-yellow-600" />
            A-SAFE AI Assistant
          </DialogTitle>
          <DialogDescription>
            Get instant help with safety barriers, product recommendations, and technical guidance
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Conversations Sidebar */}
          <div className="w-64 flex flex-col border-r">
            <div className="flex items-center justify-between p-2 border-b">
              <h3 className="font-medium text-sm">Conversations</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleNewConversation}
                disabled={createConversationMutation.isPending}
                data-testid="button-new-conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            <ScrollArea className="flex-1">
              {conversationsLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  No conversations yet
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer group ${
                        selectedConversation === conversation.id
                          ? 'bg-yellow-50 border border-yellow-200'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedConversation(conversation.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{conversation.title}</p>
                        <p className="text-xs text-gray-500">
                          {conversation.createdAt ? new Date(conversation.createdAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversationMutation.mutate(conversation.id);
                        }}
                        disabled={deleteConversationMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedConversation ? (
              <>
                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                      <Bot className="h-12 w-12 text-yellow-600 mb-4" />
                      <h3 className="font-medium mb-2">Start a conversation</h3>
                      <p className="text-sm text-gray-500 mb-4">
                        Ask me about A-SAFE products, installation guidance, or upload screenshots for analysis
                      </p>
                      <div className="flex gap-2">
                        <Badge variant="outline">Product recommendations</Badge>
                        <Badge variant="outline">Technical specs</Badge>
                        <Badge variant="outline">Installation help</Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${
                            msg.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="flex-shrink-0">
                              <div className="h-8 w-8 rounded-full bg-yellow-100 flex items-center justify-center">
                                <Bot className="h-4 w-4 text-yellow-600" />
                              </div>
                            </div>
                          )}
                          
                          <div
                            className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-900'
                            }`}
                          >
                            {msg.imageUrl && (
                              <div className="mb-2">
                                <img
                                  src={msg.imageUrl}
                                  alt="Uploaded screenshot"
                                  className="rounded max-w-full h-auto"
                                />
                              </div>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-xs mt-1 ${
                              msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                            }`}>
                              {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                            </p>
                          </div>
                          
                          {msg.role === 'user' && (
                            <div className="flex-shrink-0">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                <User className="h-4 w-4 text-blue-600" />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Input Area */}
                <div className="border-t p-4">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Ask about safety barriers, upload screenshots, or get technical help..."
                      disabled={sendMessageMutation.isPending || isUploading}
                      data-testid="input-chat-message"
                      className="flex-1"
                    />
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      data-testid="input-image-upload"
                    />
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={sendMessageMutation.isPending || isUploading}
                          data-testid="button-upload-image"
                        >
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Upload Screenshot</TooltipContent>
                    </Tooltip>
                    
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!message.trim() || sendMessageMutation.isPending || isUploading}
                      data-testid="button-send-message"
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Select a conversation to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}