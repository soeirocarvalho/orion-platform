import { BulkEditRequest, BulkEditFilters, BulkEditFields } from "@shared/schema";

export interface EditCommand {
  action: 'update' | 'change' | 'set' | 'mark';
  field: 'impact' | 'type' | 'steep' | 'scope' | 'ttm' | 'sentiment';
  value: string | number;
  filters: BulkEditFilters;
  confidence: number; // 0-1 confidence score
  originalMessage: string;
}

export class CommandParserService {
  
  parseEditCommand(message: string, projectId: string, selectedForces?: string[]): EditCommand | null {
    const normalizedMessage = message.toLowerCase().trim();
    
    // Define command patterns with their corresponding actions
    const patterns = [
      {
        regex: /(?:change|set|update)\s+(?:the\s+)?impact\s+(?:of\s+)?(.+?)\s+to\s+(\d+)/i,
        field: 'impact' as const,
        action: 'update' as const,
        valueIndex: 2,
        targetIndex: 1
      },
      {
        regex: /(?:mark|set|change)\s+(.+?)\s+as\s+(megatrends?|trends?|weak\s+signals?|wildcards?)/i,
        field: 'type' as const,
        action: 'mark' as const,
        valueIndex: 2,
        targetIndex: 1
      },
      {
        regex: /(?:set|change|update)\s+(?:the\s+)?(?:time\s+to\s+market|ttm)\s+(?:of\s+)?(.+?)\s+to\s+(.+)/i,
        field: 'ttm' as const,
        action: 'set' as const,
        valueIndex: 2,
        targetIndex: 1
      },
      {
        regex: /(?:set|change|update)\s+(?:the\s+)?(?:dimension|steep)\s+(?:of\s+)?(.+?)\s+to\s+(social|technological|economic|environmental|political)/i,
        field: 'steep' as const,
        action: 'set' as const,
        valueIndex: 2,
        targetIndex: 1
      },
      {
        regex: /(?:set|change|update)\s+(?:the\s+)?sentiment\s+(?:of\s+)?(.+?)\s+to\s+(positive|negative|neutral)/i,
        field: 'sentiment' as const,
        action: 'set' as const,
        valueIndex: 2,
        targetIndex: 1
      }
    ];

    for (const pattern of patterns) {
      const match = normalizedMessage.match(pattern.regex);
      if (match) {
        const target = match[pattern.targetIndex];
        const rawValue = match[pattern.valueIndex];
        
        // Parse the value based on field type
        let value: string | number;
        if (pattern.field === 'impact') {
          value = parseInt(rawValue);
          if (isNaN(value) || value < 1 || value > 10) {
            continue; // Invalid impact score
          }
        } else if (pattern.field === 'type') {
          value = this.mapTypeValue(rawValue);
          if (!value) continue; // Invalid type
        } else if (pattern.field === 'steep') {
          value = this.capitalizeDimension(rawValue);
        } else if (pattern.field === 'sentiment') {
          value = this.capitalizeSentiment(rawValue);
        } else {
          value = rawValue;
        }

        // Parse the target to determine filters
        const filters = this.parseTarget(target, selectedForces);
        
        return {
          action: pattern.action,
          field: pattern.field,
          value,
          filters,
          confidence: this.calculateConfidence(match, target),
          originalMessage: message
        };
      }
    }

    return null; // No matching pattern found
  }

  private mapTypeValue(typeText: string): string | null {
    const typeMap: Record<string, string> = {
      'megatrend': 'M',
      'megatrends': 'M',
      'trend': 'T',
      'trends': 'T',
      'weak signal': 'WS',
      'weak signals': 'WS',
      'wildcard': 'WC',
      'wildcards': 'WC'
    };
    
    return typeMap[typeText.toLowerCase()] || null;
  }

  private capitalizeDimension(dimension: string): string {
    const dimensionMap: Record<string, string> = {
      'social': 'Social',
      'technological': 'Technological',
      'economic': 'Economic',
      'environmental': 'Environmental',
      'political': 'Political'
    };
    
    return dimensionMap[dimension.toLowerCase()] || dimension;
  }

  private capitalizeSentiment(sentiment: string): string {
    const sentimentMap: Record<string, string> = {
      'positive': 'Positive',
      'negative': 'Negative',
      'neutral': 'Neutral'
    };
    
    return sentimentMap[sentiment.toLowerCase()] || sentiment;
  }

  private parseTarget(target: string, selectedForces?: string[]): BulkEditFilters {
    const filters: BulkEditFilters = {};
    
    // Check for "selected" keyword
    if (target.includes('selected')) {
      filters.selectedOnly = true;
      if (selectedForces) {
        filters.forceIds = selectedForces;
      }
    }

    // Check for position indicators (first/last N)
    const positionMatch = target.match(/(first|last)\s+(\d+)/i);
    if (positionMatch) {
      filters.position = positionMatch[1].toLowerCase() as 'first' | 'last';
      filters.count = parseInt(positionMatch[2]);
    }

    // Check for "all" with specific dimension
    const allDimensionMatch = target.match(/all\s+(.+?)\s+forces?/i);
    if (allDimensionMatch) {
      const dimension = allDimensionMatch[1].toLowerCase();
      
      // Check if it's a STEEP dimension
      const steepDimensions = ['social', 'technological', 'economic', 'environmental', 'political'];
      if (steepDimensions.includes(dimension)) {
        filters.steep = [this.capitalizeDimension(dimension)];
      }
      
      // Check if it's a force type
      const typeValue = this.mapTypeValue(dimension);
      if (typeValue) {
        filters.type = [typeValue];
      }
    }

    // If no specific targeting found and no selected forces specified, default to selected
    if (Object.keys(filters).length === 0) {
      filters.selectedOnly = true;
      if (selectedForces) {
        filters.forceIds = selectedForces;
      }
    }

    return filters;
  }

  private calculateConfidence(match: RegExpMatchArray, target: string): number {
    let confidence = 0.7; // Base confidence
    
    // Boost confidence for specific targeting
    if (target.includes('selected') || target.includes('first') || target.includes('last')) {
      confidence += 0.2;
    }
    
    // Boost confidence for "all X forces" patterns
    if (target.includes('all') && target.includes('forces')) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  // Helper method to convert EditCommand to BulkEditRequest
  createBulkEditRequest(command: EditCommand, projectId: string): BulkEditRequest {
    const updates: BulkEditFields = {};
    updates[command.field] = command.value;
    
    return {
      projectId,
      filters: command.filters,
      updates
    };
  }

  // Test if a message might be an edit command (for assistant to recognize intent)
  isEditCommand(message: string): boolean {
    const editKeywords = [
      'change', 'set', 'update', 'mark', 'modify',
      'impact', 'type', 'dimension', 'steep', 'sentiment', 'ttm',
      'megatrend', 'trend', 'weak signal', 'wildcard',
      'social', 'technological', 'economic', 'environmental', 'political'
    ];
    
    const normalizedMessage = message.toLowerCase();
    return editKeywords.some(keyword => normalizedMessage.includes(keyword)) &&
           (normalizedMessage.includes(' to ') || normalizedMessage.includes(' as '));
  }
}

export const commandParserService = new CommandParserService();