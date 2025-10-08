import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  User, 
  Paperclip,
  Plus,
  Image as ImageIcon,
  X,
  FileImage,
  Link,
  Link2Off
} from "lucide-react";
import type { ChatImage, DrivingForce } from "@shared/schema";
import { useOrionCopilotProjectMode, useOrionCopilotThreadId, useAppActions } from "@/lib/store";

interface ORIONCopilotProps {
  projectId?: string;
  className?: string;
  projectData?: {
    project?: any;
    forcesCount?: number;
    clustersCount?: number;
    recentForces?: DrivingForce[];
    viewMode?: string;
    selectedForces?: any[];
    selectedForcesCount?: number;
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  files?: File[];
  images?: ChatImage[];
  threadId?: string;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

export function ORIONCopilot({ projectId, className, projectData }: ORIONCopilotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  
  // Use global store for project mode and thread state
  const isProjectModeActive = useOrionCopilotProjectMode();
  const threadId = useOrionCopilotThreadId();
  const { setOrionCopilotProjectMode, setOrionCopilotThreadId } = useAppActions();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset mode and thread when project changes to prevent cross-project bleed
  useEffect(() => {
    if (projectId) {
      // Reset to standalone mode and clear thread when project changes
      setOrionCopilotProjectMode(false);
      setOrionCopilotThreadId(null);
    }
  }, [projectId, setOrionCopilotProjectMode, setOrionCopilotThreadId]);

  // Initialize with welcome message (always show, even without project)
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeContent = getWelcomeMessage(projectData);
      
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: welcomeContent,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [projectId, messages.length, projectData]);

  // Update welcome message when projectData changes (e.g., selected forces)
  useEffect(() => {
    if (messages.length > 0 && messages[0].id === 'welcome' && projectId) {
      const welcomeContent = getWelcomeMessage(projectData);
      
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
  }, [projectData?.selectedForcesCount, projectData?.forcesCount, projectData?.clustersCount, projectId]);

  const getWelcomeMessage = (data?: any) => {
    const projectName = data?.project?.name || 'No project selected';
    const selectedForcesCount = data?.selectedForcesCount || 0;
    const totalForcesCount = data?.forcesCount || 0;
    
    let modeText = "";
    if (isProjectModeActive && data?.project) {
      modeText = `\n\n**🔗 Project Integration ACTIVE**\n- Using: **${projectName}**\n- Selected forces: **${selectedForcesCount}** ready for analysis`;
    } else if (data?.project) {
      modeText = `\n\n**📊 Project Available**: ${projectName} (${totalForcesCount} forces)`;
      if (selectedForcesCount > 0) {
        modeText += `\n- You have **${selectedForcesCount} forces selected** - say "use my selected forces" to integrate them!`;
      }
    }
    
    return `Hello! I'm ORION Copilot, your strategic foresight and innovation assistant.

**Mode**: ${isProjectModeActive ? 'Project-Integrated' : 'Standalone'} (using comprehensive ORION.AI database)${modeText}

Just say "Hi" or "Hello" to start!`;
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      const imageFiles = newFiles.filter(isImageFile);
      const documentFiles = newFiles.filter(f => !isImageFile(f));
      
      setSelectedImages(prev => [...prev, ...imageFiles]);
      setSelectedFiles(prev => [...prev, ...documentFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const buildContextForAssistant = () => {
    if (!isProjectModeActive || !projectData) {
      return {
        integrationMode: 'standalone',
        projectId: null,
        context: 'copilot'
      };
    }
    
    const selectedForcesCount = projectData?.selectedForcesCount || 0;
    const selectedForcesAvailable = projectData?.selectedForces?.length || 0;
    
    // SECURITY: Send only force IDs, let backend fetch full content server-side
    const ASSISTANT_FORCES_LIMIT = Math.min(50, selectedForcesAvailable);
    const selectedForceIds = projectData?.selectedForces?.slice(0, ASSISTANT_FORCES_LIMIT).map((force: any) => force.id) || [];
    
    console.log('[ORIONCopilot] Building secure context for assistant:', {
      integrationMode: 'project',
      projectId,
      selectedForcesCount,
      forceIds: selectedForceIds.length,
      sampleIds: selectedForceIds.slice(0, 3)
    });
    
    return {
      integrationMode: 'project',
      projectId,
      context: 'copilot',
      selectedForceIds: selectedForceIds, // SECURITY: Send only IDs, not full content
      selectedForcesCount: selectedForcesCount,
      viewMode: projectData?.viewMode,
    };
  };

  // Toggle project mode
  const toggleProjectMode = () => {
    setOrionCopilotProjectMode(!isProjectModeActive);
    
    // Update welcome message when mode changes
    if (messages.length > 0 && messages[0].id === 'welcome') {
      const welcomeContent = getWelcomeMessage(projectData);
      
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
  };

  // Check for user commands to activate project mode
  const checkForProjectCommands = (content: string) => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('use my selected forces') || 
        lowerContent.includes('integrate my forces') ||
        lowerContent.includes('use project forces')) {
      if (!isProjectModeActive && projectData?.selectedForcesCount && projectData.selectedForcesCount > 0) {
        setOrionCopilotProjectMode(true);
        return true;
      }
    }
    return false;
  };

  const sendMessage = async (customContent?: string) => {
    const messageContent = customContent || input.trim();
    if ((!messageContent && selectedFiles.length === 0 && selectedImages.length === 0) || isStreaming) return;

    // Check if user is requesting project integration
    const activatedProjectMode = checkForProjectCommands(messageContent);

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
      content: messageContent || (selectedImages.length > 0 ? "[Images uploaded]" : "[Files uploaded]"),
      timestamp: new Date(),
      files: selectedFiles.length > 0 ? [...selectedFiles] : undefined,
      images: chatImages.length > 0 ? chatImages : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setSelectedFiles([]);
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
      
      // Use POST method for better support of Assistant API
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId || null, // Allow null for standalone mode
          query: messageContent,
          assistant_type: 'copilot',
          thread_id: threadId,
          mode: 'general',
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
                  setOrionCopilotThreadId(data.threadId);
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
      console.error('Chat stream error:', error);
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>

      {/* Chat Messages Area */}
      <ScrollArea className="flex-1 px-4 py-6" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <img 
                src="/orion_logo.png" 
                alt="ORION Logo" 
                className="w-12 h-12 mx-auto mb-4 object-contain"
                data-testid="orion-logo-welcome"
              />
              <p className="text-muted-foreground text-lg">How can I help you today?</p>
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
                              className="rounded-lg max-w-full h-auto max-h-64 object-contain border border-border/20"
                              data-testid={`message-image-${idx}`}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors" />
                            <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              {image.name} ({formatFileSize(image.size)})
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* File attachments */}
                    {message.files && message.files.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {message.files.map((file, idx) => (
                          <div key={idx} className="text-xs bg-background/20 rounded px-2 py-1 flex items-center space-x-1">
                            <Paperclip className="w-3 h-3" />
                            <span>{file.name}</span>
                            <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border/50 p-4">
        <div className="max-w-3xl mx-auto">
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
                      className="w-full h-20 object-cover rounded-lg border border-border"
                      data-testid={`selected-image-${index}`}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`remove-image-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 rounded-b-lg truncate">
                      {image.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected Files Display */}
          {selectedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center space-x-2 bg-muted rounded-lg px-3 py-2 text-sm">
                  <Paperclip className="w-4 h-4" />
                  <span>{file.name}</span>
                  <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="h-auto p-0 w-4 h-4"
                    data-testid={`remove-file-${index}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          {/* Persistent Mode Status Badge */}
          <div className="mb-3">
            <Badge 
              variant={isProjectModeActive ? "default" : "secondary"} 
              className={`${isProjectModeActive ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500 hover:bg-gray-600'} text-white font-medium`}
            >
              {isProjectModeActive ? (
                <Link className="w-3 h-3 mr-1" />
              ) : (
                <Link2Off className="w-3 h-3 mr-1" />
              )}
              {isProjectModeActive ? 'Project Mode' : 'Standalone Mode'}
            </Badge>
          </div>

          {/* Project Mode Toggle - Enhanced */}
          {projectData?.project && (
            <div className={`mb-3 rounded-lg border transition-colors ${
              isProjectModeActive 
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
                : 'bg-muted/30 border-border'
            }`}>
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full transition-colors ${
                      isProjectModeActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}>
                      {isProjectModeActive ? (
                        <Link className="w-4 h-4 text-white" />
                      ) : (
                        <Link2Off className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        {isProjectModeActive ? '🔗 Project Integration Active' : '📊 Project Available'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isProjectModeActive 
                          ? `Connected to ${projectData.project.name} with ${projectData.selectedForcesCount || 0} selected forces`
                          : `${projectData.project.name} • ${projectData.selectedForcesCount || 0} forces selected • ${projectData.forcesCount || 0} total`
                        }
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={isProjectModeActive ? "destructive" : "default"}
                    size="sm"
                    onClick={toggleProjectMode}
                    disabled={!projectData?.selectedForcesCount}
                    className="shrink-0 min-w-[100px]"
                    data-testid="toggle-project-mode"
                  >
                    {isProjectModeActive ? (
                      <>
                        <Link2Off className="w-3 h-3 mr-1" />
                        Disconnect
                      </>
                    ) : (
                      <>
                        <Link className="w-3 h-3 mr-1" />
                        Connect
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Enhanced status message */}
                {!projectData?.selectedForcesCount && !isProjectModeActive && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
                    💡 Select forces in the Scanning page to enable project integration
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Input Box */}
          <div className="relative flex items-end space-x-2">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                placeholder={isProjectModeActive ? "Message ORION.AI with your project context..." : "Message ORION.AI in standalone mode..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                className="pr-12 rounded-2xl border-border/50 focus:border-primary min-h-[48px] py-3"
                data-testid="copilot-input"
              />
              
              {/* Upload Buttons */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  data-testid="image-upload-button"
                  title="Upload images"
                >
                  <ImageIcon className="w-4 h-4" />
                </Button>
                
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  data-testid="file-upload-button"
                  title="Upload files"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                accept="image/*,.txt,.pdf,.doc,.docx,.xlsx,.csv,.json"
              />
            </div>
            
            <Button 
              onClick={() => sendMessage()}
              disabled={(!input.trim() && selectedFiles.length === 0 && selectedImages.length === 0) || isStreaming}
              size="icon"
              className="rounded-full h-12 w-12"
              data-testid="copilot-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}