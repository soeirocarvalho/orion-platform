import { useCallback, useRef } from "react";

export interface SSEMessage {
  type: string;
  content?: string;
  error?: string;
  [key: string]: any;
}

export interface SSEOptions {
  onMessage: (data: SSEMessage) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private controller: AbortController | null = null;

  connect(url: string, options: SSEOptions) {
    this.disconnect();

    this.controller = new AbortController();
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      options.onOpen?.();
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        options.onMessage(data);
      } catch (error) {
        options.onError?.(new Error("Failed to parse SSE message"));
      }
    };

    this.eventSource.onerror = (event) => {
      const error = new Error("SSE connection error");
      options.onError?.(error);
    };

    this.eventSource.onclose = () => {
      options.onClose?.();
    };

    // Handle abort signal
    this.controller.signal.addEventListener("abort", () => {
      this.disconnect();
    });

    return this.controller;
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

export function useSSE() {
  const clientRef = useRef<SSEClient>(new SSEClient());

  const startStream = useCallback(async (url: string, options: SSEOptions) => {
    return new Promise<void>((resolve, reject) => {
      const enhancedOptions: SSEOptions = {
        ...options,
        onMessage: (data) => {
          options.onMessage(data);
          if (data.type === "done") {
            resolve();
          } else if (data.type === "error") {
            reject(new Error(data.error || "Stream error"));
          }
        },
        onError: (error) => {
          options.onError?.(error);
          reject(error);
        },
      };

      clientRef.current.connect(url, enhancedOptions);
    });
  }, []);

  const stopStream = useCallback(() => {
    clientRef.current.disconnect();
  }, []);

  const isStreaming = useCallback(() => {
    return clientRef.current.isConnected();
  }, []);

  return {
    startStream,
    stopStream,
    isStreaming,
  };
}

// Higher-level hook for chat streaming
export function useChatStream() {
  const { startStream, stopStream, isStreaming } = useSSE();

  const streamChatResponse = useCallback(async (
    projectId: string,
    query: string,
    mode: string = "general",
    onChunk: (content: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ) => {
    const url = `/api/v1/chat/stream?project_id=${encodeURIComponent(projectId)}&query=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`;

    try {
      await startStream(url, {
        onMessage: (data) => {
          switch (data.type) {
            case "chunk":
              onChunk(data.content || "");
              break;
            case "done":
              onComplete?.();
              break;
            case "error":
              onError?.(new Error(data.error || "Chat stream error"));
              break;
          }
        },
        onError: (error) => {
          onError?.(error);
        },
      });
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Unknown error"));
    }
  }, [startStream]);

  return {
    streamChatResponse,
    stopStream,
    isStreaming,
  };
}

// Utility for job progress streaming
export function useJobProgress() {
  const { startStream, stopStream } = useSSE();

  const streamJobProgress = useCallback(async (
    jobId: string,
    onProgress: (progress: number, status: string) => void,
    onComplete?: (result: any) => void,
    onError?: (error: Error) => void
  ) => {
    const url = `/api/v1/jobs/${jobId}/stream`;

    try {
      await startStream(url, {
        onMessage: (data) => {
          switch (data.type) {
            case "progress":
              onProgress(data.progress || 0, data.status || "unknown");
              break;
            case "complete":
              onComplete?.(data.result);
              break;
            case "error":
              onError?.(new Error(data.error || "Job stream error"));
              break;
          }
        },
        onError: (error) => {
          onError?.(error);
        },
      });
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Unknown error"));
    }
  }, [startStream]);

  return {
    streamJobProgress,
    stopStream,
  };
}

export default SSEClient;
