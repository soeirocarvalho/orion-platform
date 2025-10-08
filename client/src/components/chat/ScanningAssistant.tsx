import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { 
  Send, 
  User, 
  Scan,
  TrendingUp,
  Layers,
  BarChart3,
  Sparkles,
  Image as ImageIcon,
  X,
  FileImage,
  Paperclip,
  Check,
  AlertCircle
} from "lucide-react";
import type { DrivingForce, Cluster, ChatImage } from "@shared/schema";

interface ScanningAssistantProps {
  projectId: string;
  className?: string;
  context?: 'dashboard' | 'scanning';
  contextData?: {
    forcesCount?: number;
    clustersCount?: number;
    recentForces?: DrivingForce[];
    selectedLens?: string;
    viewMode?: string;
    selectedForces?: any[];
    selectedForcesCount?: number;
    batchErrorMessage?: string;
    missingForceIds?: string[];
    batchForcesCount?: number;
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  images?: ChatImage[];
  threadId?: string;
}

interface EditCommandConfirmation {
  command: string;
  field: string;
  value: string | number;
  target: string;
  affectedCount: number;
  originalMessage: string;
}

interface EditPreviewData {
  affectedForces: Array<{
    id: string;
    title: string;
    currentValues: Record<string, any>;
    newValues: Record<string, any>;
  }>;
  totalCount: number;
  summary: string;
}

export function ScanningAssistant({ projectId, className, context = 'scanning', contextData }: ScanningAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  
  // Edit command state
  const [pendingCommand, setPendingCommand] = useState<EditCommandConfirmation | null>(null);
  const [editPreview, setEditPreview] = useState<EditPreviewData | null>(null);
  const [isExecutingEdit, setIsExecutingEdit] = useState(false);
  
  const { toast } = useToast();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Get current project data for context
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/v1/projects"],
    enabled: !!projectId,
  });

  const { data: clustersData = [] } = useQuery<Cluster[]>({
    queryKey: [`/api/v1/clusters?project_id=${projectId}`],
    enabled: !!projectId,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Initialize with context-aware welcome message
  useEffect(() => {
    if (messages.length === 0 && projectId) {
      const project = projects.find(p => p.id === projectId);
      const welcomeContent = getWelcomeMessage(context, project?.name, contextData);
      
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: welcomeContent,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [projectId, messages.length, context, projects, contextData]);

  // Update welcome message when contextData changes (e.g., selected forces)
  useEffect(() => {
    if (messages.length > 0 && messages[0].id === 'welcome' && projectId) {
      const project = projects.find(p => p.id === projectId);
      const welcomeContent = getWelcomeMessage(context, project?.name, contextData);
      
      setMessages(prev => {
        const updatedMessages = [...prev];
        updatedMessages[0] = {
          ...updatedMessages[0],
          content: welcomeContent,
          timestamp: new Date(),
        };
        return updatedMessages;
      });
    }
  }, [contextData?.selectedForcesCount, contextData?.forcesCount, contextData?.clustersCount, context, projects, projectId]);

  const getWelcomeMessage = (context: string, projectName?: string, data?: any) => {
    const projectContext = projectName ? ` for ${projectName}` : '';
    
    if (context === 'dashboard') {
      return `Hello! I'm the ORION Scanning Intelligence Assistant. I can help you analyze your strategic intelligence data${projectContext}.

Current project overview:
- **${data?.forcesCount || 0} driving forces** analyzed
- **${data?.clustersCount || 0} strategic clusters** identified
- **View mode**: ${data?.viewMode === 'all' ? 'All forces including signals' : 'Curated forces only'}

I can help you:
🔍 **Analyze patterns** across your driving forces
📊 **Interpret cluster insights** and strategic implications  
🎯 **Explore STEEP dimensions** (Social, Technology, Economic, Environmental, Political)
🔮 **Identify connections** between megatrends, trends, and weak signals
💡 **Generate scenarios** and strategic recommendations

What would you like to explore about your strategic intelligence?`;
    } else {
      const selectedCount = data?.selectedForcesCount || 0;
      const selectedInfo = selectedCount > 0 ? 
        `\n\n**Currently selected**: ${selectedCount} driving forces ready for analysis` : '';
      
      return `Welcome to ORION Scanning Assistant!




How can I help you with your scanning analysis today?${selectedInfo}`;
    }
  };

  // Image utilities
  const isImageFile = (file: File): boolean => {
    return file.type.startsWith('image/');
  };

  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove the data:image/...;base64, prefix to get just the base64 data
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const imageFiles = Array.from(files).filter(isImageFile);
      setSelectedImages(prev => [...prev, ...imageFiles]);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const buildContextForAssistant = () => {
    const selectedForcesCount = contextData?.selectedForcesCount || 0;
    const selectedForcesAvailable = contextData?.selectedForces?.length || 0;
    
    // Send selected forces with essential fields, with reasonable limit for large selections
    const ASSISTANT_FORCES_LIMIT = Math.min(50, selectedForcesAvailable); // Allow up to 50 forces or all selected if fewer
    const selectedForcesForAssistant = contextData?.selectedForces?.slice(0, ASSISTANT_FORCES_LIMIT).map(force => ({
      id: force.id,
      title: force.title,
      type: force.type,
      dimension: force.dimension,
      scope: force.scope,
      impact: force.impact,
      // Only include essential fields to reduce payload size
    })) || [];
    
    console.log('[ScanningAssistant] Building context for assistant:', {
      selectedForcesCount,
      selectedForcesAvailable,
      forcesBeingSent: selectedForcesForAssistant.length,
      sampleTitles: selectedForcesForAssistant.slice(0, 3).map(f => f.title) || []
    });
    
    return {
      projectId,
      context,
      forcesCount: contextData?.forcesCount || 0,
      clustersCount: contextData?.clustersCount || clustersData.length || 0,
      recentForces: contextData?.recentForces?.slice(0, 5) || [],
      selectedLens: contextData?.selectedLens,
      viewMode: contextData?.viewMode,
      selectedForcesCount: selectedForcesCount,
      selectedForceIds: contextData?.selectedForces?.slice(0, ASSISTANT_FORCES_LIMIT).map(force => force.id) || [], // Send only IDs for security
      clusters: clustersData.slice(0, 10).map(c => ({
        id: c.id,
        label: c.label,
        size: c.size,
        method: c.method
      }))
    };
  };

  // Helper function to detect if a message is an edit command
  const isEditCommand = (message: string): boolean => {
    const editKeywords = [
      'change', 'set', 'update', 'mark', 'modify',
      'impact', 'type', 'dimension', 'steep', 'sentiment', 'ttm',
      'megatrend', 'trend', 'weak signal', 'wildcard',
      'social', 'technological', 'economic', 'environmental', 'political'
    ];
    
    const normalizedMessage = message.toLowerCase();
    return editKeywords.some(keyword => normalizedMessage.includes(keyword)) &&
           (normalizedMessage.includes(' to ') || normalizedMessage.includes(' as '));
  };

  // Function to parse edit commands and get preview
  const handleEditCommand = async (message: string) => {
    try {
      // Get selected force IDs from context
      const selectedForceIds = contextData?.selectedForces?.map(f => f.id) || [];
      
      // Get auth token for API requests
      const authToken = localStorage.getItem("auth_token");
      
      // Parse the command using backend service
      const parseResponse = await fetch('/api/v1/scanning/forces/parse-command', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          projectId,
          message,
          selectedForces: selectedForceIds
        })
      });

      if (!parseResponse.ok) {
        throw new Error('Failed to parse command');
      }

      const parseResult = await parseResponse.json();
      
      if (!parseResult.success || !parseResult.command) {
        toast({
          title: "Command not recognized",
          description: "I couldn't understand that edit command. Try being more specific.",
          variant: "destructive"
        });
        return false;
      }

      // Get preview of changes
      const previewResponse = await fetch('/api/v1/scanning/forces/bulk/preview', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(parseResult.bulkRequest)
      });

      if (!previewResponse.ok) {
        throw new Error('Failed to get preview');
      }

      const previewData = await previewResponse.json();
      
      // Set up confirmation state
      setPendingCommand({
        command: parseResult.command.action,
        field: parseResult.command.field,
        value: parseResult.command.value,
        target: parseResult.command.originalMessage,
        affectedCount: previewData.totalCount,
        originalMessage: message
      });
      
      setEditPreview(previewData);
      return true;
      
    } catch (error) {
      console.error('Error handling edit command:', error);
      toast({
        title: "Error processing command",
        description: "Sorry, I couldn't process that edit command. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  };

  // Function to execute confirmed edit
  const executeEditCommand = async () => {
    if (!pendingCommand || !editPreview) return;
    
    setIsExecutingEdit(true);
    
    try {
      // Parse command again to get bulk request
      const selectedForceIds = contextData?.selectedForces?.map(f => f.id) || [];
      
      // Get auth token for API requests
      const authToken = localStorage.getItem("auth_token");
      
      const parseResponse = await fetch('/api/v1/scanning/forces/parse-command', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          projectId,
          message: pendingCommand.originalMessage,
          selectedForces: selectedForceIds
        })
      });

      const parseResult = await parseResponse.json();
      
      // Execute the bulk edit
      const executeResponse = await fetch('/api/v1/scanning/forces/bulk/execute', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(parseResult.bulkRequest)
      });

      if (!executeResponse.ok) {
        throw new Error('Failed to execute edit');
      }

      const result = await executeResponse.json();
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/v1/driving-forces'] });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/driving-forces?project_id=${projectId}`] });
      
      // Show success message
      toast({
        title: "Edit completed successfully",
        description: `Updated ${result.updatedCount} driving forces`,
        variant: "default"
      });

      // Add success message to chat
      const successMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: `✅ **Edit completed successfully!**

I've updated **${result.updatedCount} driving forces** as requested:
- **Action**: ${pendingCommand.command} ${pendingCommand.field}
- **New value**: ${pendingCommand.value}
- **Applied to**: ${pendingCommand.affectedCount} forces

The changes have been saved and your data is now updated.`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, successMessage]);
      
      // Clear pending state
      setPendingCommand(null);
      setEditPreview(null);
      
    } catch (error) {
      console.error('Error executing edit:', error);
      toast({
        title: "Error executing edit",
        description: "Sorry, I couldn't complete the edit. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExecutingEdit(false);
    }
  };

  // Function to cancel edit command
  const cancelEditCommand = () => {
    setPendingCommand(null);
    setEditPreview(null);
    
    const cancelMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "assistant",
      content: "Edit command cancelled. No changes were made to your driving forces.",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, cancelMessage]);
  };

  const sendMessage = async (customContent?: string) => {
    const messageContent = customContent || input.trim();
    if ((!messageContent && selectedImages.length === 0) || isStreaming || !projectId) return;

    // Check if this is an edit command first
    if (messageContent && isEditCommand(messageContent) && context === 'scanning') {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: messageContent,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, userMessage]);
      setInput("");
      
      // Handle as edit command
      const handled = await handleEditCommand(messageContent);
      if (handled) {
        return; // Command was handled, don't proceed to regular chat
      }
      // If not handled, continue to regular chat flow
    }

    // Convert images to base64
    let chatImages: ChatImage[] = [];
    if (selectedImages.length > 0) {
      try {
        chatImages = await Promise.all(
          selectedImages.map(async (file) => ({
            data: await convertImageToBase64(file),
            type: file.type,
            name: file.name,
            size: file.size,
          }))
        );
      } catch (error) {
        console.error('Error converting images:', error);
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent || "[Images uploaded for analysis]",
      timestamp: new Date(),
      images: chatImages.length > 0 ? chatImages : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setSelectedImages([]);
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      const assistantContext = buildContextForAssistant();
      
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          query: messageContent,
          assistant_type: 'scanning', // Use scanning assistant
          ...(threadId && { thread_id: threadId }), // Only include if not null
          mode: context,
          context: assistantContext,
          images: chatImages.length > 0 ? chatImages : undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start chat stream');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "chunk") {
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
              } else if (data.type === "done") {
                if (data.threadId) {
                  setThreadId(data.threadId);
                }
                setIsStreaming(false);
                break;
              } else if (data.type === "error") {
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: "I apologize, but I encountered an error. Please try again." }
                      : msg
                  )
                );
                setIsStreaming(false);
                break;
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Scanning assistant stream error:', error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: "I apologize, but I encountered an error. Please try again." }
            : msg
        )
      );
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestedQuestions = context === 'dashboard' 
    ? [
        "Analyze the key patterns in my current clusters",
        "What are the most impactful driving forces?", 
        "Show me connections between different STEEP categories",
        "Generate scenarios based on my top clusters"
      ]
    : [
        "Present a list of the driving forces selected",
        "What patterns do you see in the driving forces selected?"
      ];

  return (
    <Card className={`flex flex-col h-full bg-background ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img 
              src="/orion_logo.png" 
              alt="ORION Logo" 
              className="w-6 h-6 object-contain rounded-full"
              data-testid="orion-logo-header"
            />
          </div>
          <div>
            <h3 className="font-semibold text-base" data-testid="scanning-assistant-title">
              Scanning Assistant
            </h3>
            <p className="text-xs text-muted-foreground">
              {context === 'dashboard' ? 'Strategic Analytics' : ''}
            </p>
          </div>
        </div>

      </div>

      {/* Chat Messages Area */}
      <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">Ready to analyze your strategic intelligence</p>
            </div>
          ) : (
            messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex items-start space-x-3 ${
                  message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
                data-testid={`message-${message.role}-${message.id}`}
              >
                <div className="flex-shrink-0">
                  {message.role === "assistant" ? (
                    <div className="w-8 h-8 flex items-center justify-center">
                      <img 
                        src="/orion_logo.png" 
                        alt="ORION Logo" 
                        className="w-6 h-6 object-contain rounded-full"
                        data-testid="orion-logo-message"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                <div className={`flex-1 max-w-2xl ${
                  message.role === 'user' ? 'text-right' : ''
                }`}>
                  <div className={`inline-block rounded-2xl px-4 py-2 ${
                    message.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  }`}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                      {message.role === "assistant" && isStreaming && message.content === "" && (
                        <span className="inline-block w-2 h-4 bg-current animate-pulse">|</span>
                      )}
                    </p>

                    {/* Image attachments */}
                    {message.images && message.images.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {message.images.map((image, idx) => (
                          <div key={idx} className="relative group">
                            <img 
                              src={`data:${image.type};base64,${image.data}`}
                              alt={image.name}
                              className="rounded-lg max-w-full h-auto max-h-48 object-contain border border-border/20"
                              data-testid={`scanning-message-image-${idx}`}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors" />
                            <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              {image.name} ({formatFileSize(image.size)})
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Suggested questions on first load */}
          {messages.length <= 1 && (
            <div className="space-y-2 mt-4">
              <p className="text-xs text-muted-foreground text-center">Try asking:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedQuestions.map((question, index) => (
                  <Button
                    key={index}
                    variant="outline" 
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => sendMessage(question)}
                    disabled={isStreaming}
                    data-testid={`suggested-question-${index}`}
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Edit Command Confirmation */}
      {pendingCommand && editPreview && (
        <div className="p-4 border-t border-border/50 bg-muted/50">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <h4 className="font-medium text-sm">Confirm Edit Command</h4>
            </div>
            
            <div className="bg-background p-3 rounded-lg border">
              <p className="text-sm mb-2">
                <strong>Command:</strong> {pendingCommand.originalMessage}
              </p>
              <p className="text-sm mb-2">
                <strong>Action:</strong> {pendingCommand.command} {pendingCommand.field} to "{pendingCommand.value}"
              </p>
              <p className="text-sm">
                <strong>Affected Forces:</strong> {pendingCommand.affectedCount}
              </p>
            </div>

            {editPreview.affectedForces.length > 0 && (
              <div className="bg-background p-3 rounded-lg border max-h-32 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground mb-2">Preview of changes:</p>
                <div className="space-y-1">
                  {editPreview.affectedForces.slice(0, 5).map(force => (
                    <div key={force.id} className="text-xs">
                      <span className="font-medium">{force.title}</span>
                      {Object.entries(force.newValues).map(([key, value]) => (
                        <span key={key} className="ml-2 text-muted-foreground">
                          → {key}: {value}
                        </span>
                      ))}
                    </div>
                  ))}
                  {editPreview.affectedForces.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      ... and {editPreview.affectedForces.length - 5} more forces
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Button
                onClick={executeEditCommand}
                disabled={isExecutingEdit}
                size="sm"
                className="flex-1"
                data-testid="confirm-edit-button"
              >
                {isExecutingEdit ? (
                  <>
                    <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin mr-2" />
                    Applying Changes...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 mr-2" />
                    Confirm & Apply
                  </>
                )}
              </Button>
              <Button
                onClick={cancelEditCommand}
                disabled={isExecutingEdit}
                variant="outline"
                size="sm"
                className="flex-1"
                data-testid="cancel-edit-button"
              >
                <X className="w-3 h-3 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border/50 p-4">
        {/* Selected Images Display */}
        {selectedImages.length > 0 && (
          <div className="mb-3">
            <div className="mb-2">
              <Badge variant="outline" className="text-xs">
                <ImageIcon className="w-3 h-3 mr-1" />
                {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {selectedImages.map((image, index) => (
                <div key={index} className="relative group">
                  <img 
                    src={URL.createObjectURL(image)}
                    alt={image.name}
                    className="w-full h-16 object-cover rounded-lg border border-border"
                    data-testid={`scanning-selected-image-${index}`}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`scanning-remove-image-${index}`}
                  >
                    <X className="w-2 h-2" />
                  </Button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 rounded-b-lg truncate">
                    {image.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${context === 'dashboard' ? 'strategic insights' : 'scanning analysis'}...`}
              disabled={isStreaming}
              className="pr-10"
              data-testid="scanning-assistant-input"
            />
            
            {/* Image Upload Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => imageInputRef.current?.click()}
              disabled={isStreaming}
              data-testid="scanning-image-upload-button"
              title="Upload images for analysis"
            >
              <ImageIcon className="w-3 h-3" />
            </Button>
            
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
          
          <Button
            onClick={() => sendMessage()}
            disabled={(!input.trim() && selectedImages.length === 0) || isStreaming}
            size="icon"
            data-testid="scanning-assistant-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        {isStreaming && (
          <div className="flex items-center space-x-2 mt-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            <span className="text-xs text-muted-foreground">Analyzing your strategic intelligence...</span>
          </div>
        )}
      </div>
    </Card>
  );
}