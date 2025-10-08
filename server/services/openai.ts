import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR
});

export class OpenAIService {
  private getAssistantId(assistantType: 'copilot' | 'scanning'): string {
    return assistantType === 'copilot' 
      ? process.env.ORION_COPILOT_ASSISTANT_ID!
      : process.env.ORION_SCANNING_ASSISTANT_ID!;
  }

  async streamAssistantResponse(
    query: string,
    context: any,
    assistantType: 'copilot' | 'scanning' = 'copilot',
    threadId: string | null = null,
    onChunk: (chunk: string) => void,
    onComplete: (threadId: string) => void,
    onError: (error: string) => void,
    images?: any[]
  ) {
    try {
      const assistantId = this.getAssistantId(assistantType);
      if (!assistantId) {
        throw new Error(`Missing assistant ID for type: ${assistantType}`);
      }

      // Create or retrieve thread
      let thread;
      if (threadId) {
        try {
          thread = await openai.beta.threads.retrieve(threadId);
        } catch {
          // If thread retrieval fails, create a new one
          thread = await openai.beta.threads.create();
        }
      } else {
        thread = await openai.beta.threads.create();
      }

      // Add context to the message if provided
      let fullMessage = query;
      console.log(`[DEBUG] OpenAI Service - Query: "${query}"`);
      console.log(`[DEBUG] OpenAI Service - Context keys:`, Object.keys(context || {}));
      if (context && Object.keys(context).length > 0) {
        fullMessage = `${query}\n\nContext:\n- Total forces: ${context.forcesCount || 0}\n- Active clusters: ${context.clustersCount || 0}`;
        if (context.recentForces?.length) {
          fullMessage += `\n- Recent forces: ${context.recentForces.slice(0, 3).map((f: any) => f.title).join(", ")}`;
        }
        
        // Include selected forces if provided
        if (context.selectedForces?.length > 0) {
          console.log(`[OpenAI Service] Including ${context.selectedForces.length} selected forces in context:`, 
            context.selectedForces.slice(0, 3).map((f: any) => f.title || 'Untitled'));
          
          // Make selected forces VERY prominent by putting them at the beginning
          fullMessage = `🎯 **USER HAS SELECTED ${context.selectedForces.length} SPECIFIC DRIVING FORCES FOR ANALYSIS:**

${context.selectedForces.map((force: any, index: number) => {
  let forceInfo = `${index + 1}. **${force.title || 'Untitled Force'}**`;
  if (force.type) forceInfo += ` (Type: ${force.type})`;
  if (force.dimension) forceInfo += ` [${force.dimension}]`;
  if (force.scope) forceInfo += ` - Scope: ${force.scope}`;
  if (force.impact) forceInfo += ` - Impact: ${force.impact}`;
  return forceInfo;
}).join('\n')}

🔥 **CRITICAL INSTRUCTION:** The user has SPECIFICALLY SELECTED these ${context.selectedForces.length} forces. Always refer to these when discussing "selected forces" or "my selected forces". DO NOT refer to the general database - only these specific forces above.

---

**USER'S QUESTION:** ${query}

**Additional Context:**
- Total forces in database: ${context.forcesCount || 0}
- Active clusters: ${context.clustersCount || 0}`;
          
          if (context.recentForces?.length) {
            fullMessage += `\n- Recent forces: ${context.recentForces.slice(0, 3).map((f: any) => f.title).join(", ")}`;
          }
        } else {
          console.log(`[OpenAI Service] No selected forces provided in context`);
        }
      }

      // Prepare message content (text + images if provided)
      let messageContent: any;
      
      if (images && images.length > 0) {
        // Use content array format for multimodal messages - Assistants API format
        messageContent = [
          {
            type: "text",
            text: fullMessage
          }
        ];
        
        // Add images to the content array using proper Assistants API format
        for (const image of images) {
          messageContent.push({
            type: "image_url",
            image_url: `data:${image.type};base64,${image.data}`
          });
        }
      } else {
        // Use simple text format for text-only messages
        messageContent = fullMessage;
      }

      // Debug: Log the final message content
      console.log(`[DEBUG-FINAL] Message being sent to OpenAI:`, typeof messageContent === 'string' ? messageContent.substring(0, 500) + '...' : 'NON-STRING CONTENT');
      
      // Add user message to thread
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: messageContent
      });

      // Create and stream the run
      const stream = await openai.beta.threads.runs.stream(thread.id, {
        assistant_id: assistantId,
      });

      for await (const event of stream) {
        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content) {
            for (const content of delta.content) {
              if (content.type === 'text' && content.text?.value) {
                onChunk(content.text.value);
              }
            }
          }
        } else if (event.event === 'thread.run.completed') {
          onComplete(thread.id);
          return;
        } else if (event.event === 'thread.run.failed') {
          throw new Error(event.data.last_error?.message || 'Assistant run failed');
        }
      }
      
      onComplete(thread.id);
    } catch (error) {
      console.error("OpenAI Assistant streaming error:", error);
      onError("I apologize, but I encountered an error processing your request. Please try again.");
    }
  }

  // Legacy method for backward compatibility - now uses Assistant API
  async streamResponse(
    query: string,
    context: any,
    mode: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void
  ) {
    await this.streamAssistantResponse(
      query,
      context,
      'copilot',
      null,
      onChunk,
      () => onComplete(),
      (error) => {
        onChunk(error);
        onComplete();
      }
    );
  }

  // This method is no longer needed as prompts are handled by the Assistant API
  // The system prompts are now configured in the OpenAI Assistant settings
  private buildSystemPrompt(context: any, mode: string): string {
    // Kept for backward compatibility with other methods that might still use Chat Completions
    const basePrompt = `You are ORION, an AI strategic intelligence analyst specializing in futures research and scenario planning. You help analyze driving forces, trends, and strategic implications.

Current project context:
- Total driving forces: ${context.forcesCount}
- Active clusters: ${context.clustersCount}
- Recent forces: ${context.recentForces?.map((f: any) => `${f.title} (${f.steep}, Impact: ${f.impact})`).join(", ")}
- Key clusters: ${context.clusters?.map((c: any) => c.label).join(", ")}

Guidelines:
- Provide strategic insights based on the data
- Focus on implications and scenarios
- Be concise but analytical
- Highlight patterns and connections
- Suggest actionable next steps when appropriate`;

    switch (mode) {
      case "summarize":
        return basePrompt + "\n\nFocus on summarizing key insights and patterns from the provided cluster or data set.";
      case "labels":
        return basePrompt + "\n\nFocus on suggesting meaningful labels and categorizations for the driving forces or clusters.";
      case "risks":
        return basePrompt + "\n\nFocus on identifying uncertainties, risks, and potential disruptions from the strategic intelligence.";
      default:
        return basePrompt + "\n\nProvide comprehensive strategic analysis and answer the user's specific question.";
    }
  }

  async generateClusterLabels(forces: any[]): Promise<string[]> {
    try {
      const forceTitles = forces.map(f => f.title).slice(0, 20).join(", ");
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: "You are an expert in strategic foresight. Generate 3-5 concise, meaningful labels for this cluster of driving forces. Return only the labels as a JSON array."
        }, {
          role: "user",
          content: `Generate cluster labels for these driving forces: ${forceTitles}`
        }],
        response_format: { type: "json_object" },
        temperature: 1.0,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result.labels || [`Cluster ${Date.now()}`];
    } catch (error) {
      console.error("Label generation error:", error);
      return [`Cluster ${Date.now()}`];
    }
  }

  async analyzeSentiment(text: string): Promise<{
    rating: number,
    confidence: number,
    sentiment: string
  }> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a sentiment analysis expert. Analyze the sentiment of the text and provide a rating from 1 to 5 stars, confidence score between 0 and 1, and sentiment label (Positive/Negative/Neutral). Respond with JSON in this format: { 'rating': number, 'confidence': number, 'sentiment': string }",
          },
          {
            role: "user",
            content: text,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 1.0,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");

      return {
        rating: Math.max(1, Math.min(5, Math.round(result.rating || 3))),
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
        sentiment: result.sentiment || "Neutral",
      };
    } catch (error) {
      console.error("Sentiment analysis error:", error);
      return {
        rating: 3,
        confidence: 0.5,
        sentiment: "Neutral"
      };
    }
  }

  async generateEmbedding(text: string, model: string = "text-embedding-3-large"): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model,
        input: text.replace(/\n/g, " ").trim(),
        encoding_format: "float",
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("OpenAI embedding error:", error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async generateEmbeddingsBatch(
    texts: string[], 
    model: string = "text-embedding-3-large",
    batchSize: number = 100
  ): Promise<number[][]> {
    const results: number[][] = [];
    
    // Process in batches to respect API limits
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const cleanedBatch = batch.map(text => text.replace(/\n/g, " ").trim());
      
      try {
        const response = await openai.embeddings.create({
          model,
          input: cleanedBatch,
          encoding_format: "float",
        });

        const embeddings = response.data.map(item => item.embedding);
        results.push(...embeddings);
        
        // Add small delay between batches to respect rate limits
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`OpenAI batch embedding error for batch ${i}:`, error);
        
        // If batch fails, try individual requests
        for (const text of cleanedBatch) {
          try {
            const embedding = await this.generateEmbedding(text, model);
            results.push(embedding);
          } catch (individualError) {
            console.error(`Failed to generate embedding for text: ${text.substring(0, 100)}...`, individualError);
            // Return zero vector as fallback
            results.push(new Array(model === "text-embedding-3-large" ? 3072 : 1536).fill(0));
          }
        }
      }
    }
    
    return results;
  }

  async generateEmbeddingForForce(force: any, model: string = "text-embedding-3-large"): Promise<number[]> {
    // Combine title and text for embedding generation
    const combinedText = `${force.title}\n\n${force.text}`;
    return this.generateEmbedding(combinedText, model);
  }

  async calculateCosineSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error("Embeddings must have the same dimension");
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}

export const openaiService = new OpenAIService();
