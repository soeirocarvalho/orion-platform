import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, User, Bot } from "lucide-react";
import { useSSE } from "@/lib/sse";

interface AIChatProps {
  projectId?: string;
  className?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function AIChat({ projectId, className }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { startStream, stopStream } = useSSE();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming || !projectId) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      await startStream(
        `/api/v1/chat/stream?project_id=${projectId}&query=${encodeURIComponent(userMessage.content)}`,
        {
          onMessage: (data) => {
            if (data.type === "chunk") {
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: msg.content + data.content }
                    : msg
                )
              );
            } else if (data.type === "done") {
              setIsStreaming(false);
            } else if (data.type === "error") {
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: "I apologize, but I encountered an error. Please try again." }
                    : msg
                )
              );
              setIsStreaming(false);
            }
          },
          onError: () => {
            setIsStreaming(false);
          },
        }
      );
    } catch (error) {
      setIsStreaming(false);
    }
  };

  const handleQuickAction = (action: string) => {
    const queries: { [key: string]: string } = {
      summarize: "Summarize the key insights from the current project data",
      labels: "Suggest better labels for the existing clusters",
      risks: "Identify potential risks and uncertainties in the driving forces",
    };

    setInput(queries[action] || "");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="border-b border-border p-4 flex-shrink-0">
        <h3 className="text-lg font-semibold flex items-center" data-testid="chat-title">
          <MessageSquare className="w-5 h-5 mr-2" />
          AI Strategic Analyst
        </h3>
      </div>
      
      <div className="flex flex-col flex-1 min-h-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef} data-testid="chat-messages">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Start a conversation with your AI Strategic Analyst</p>
                <p className="text-sm">Ask about trends, clusters, or request analysis</p>
              </div>
            )}

            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex items-start space-x-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                data-testid={`message-${message.role}-${message.id}`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                
                <div className={`rounded-lg p-3 max-w-md ${
                  message.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted"
                }`}>
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                    {message.role === "assistant" && isStreaming && message.content === "" && (
                      <span className="streaming-indicator">●</span>
                    )}
                  </p>
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border flex-shrink-0">
          <div className="flex items-center space-x-2 mb-3">
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => handleQuickAction("summarize")}
              data-testid="quick-action-summarize"
            >
              Summarize
            </Button>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => handleQuickAction("labels")}
              data-testid="quick-action-labels"
            >
              Labels
            </Button>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => handleQuickAction("risks")}
              data-testid="quick-action-risks"
            >
              Risks
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <Input
              ref={inputRef}
              placeholder="Ask about clusters, trends, or request analysis..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || !projectId}
              className="flex-1"
              data-testid="chat-input"
            />
            <Button 
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming || !projectId}
              size="icon"
              data-testid="chat-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          
          {!projectId && (
            <p className="text-xs text-muted-foreground mt-2">
              Select a project to start chatting
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
