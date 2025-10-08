import React, { useMemo, useState, useCallback } from "react";
import { List } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, ExternalLink, Calendar, TrendingUp, Tag, Search } from "lucide-react";
import type { SearchResponse } from "@shared/schema";

interface VirtualizedSearchResultsProps {
  searchResults: SearchResponse;
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onForceClick?: (force: any) => void;
  height?: number;
  itemHeight?: number;
}

const FORCE_TYPES = [
  { value: "M", label: "Megatrends", color: "bg-blue-100 text-blue-800" },
  { value: "T", label: "Trends", color: "bg-green-100 text-green-800" },
  { value: "WS", label: "Weak Signals", color: "bg-yellow-100 text-yellow-800" },
  { value: "WC", label: "Wildcards", color: "bg-red-100 text-red-800" },
  { value: "S", label: "Signals", color: "bg-purple-100 text-purple-800" },
];

const CLUSTER_CATEGORIES = [
  { value: "Social", label: "Social", color: "bg-chart-1/20 text-chart-1" },
  { value: "Technological", label: "Technological", color: "bg-chart-2/20 text-chart-2" },
  { value: "Economic", label: "Economic", color: "bg-chart-3/20 text-chart-3" },
  { value: "Environmental", label: "Environmental", color: "bg-chart-4/20 text-chart-4" },
  { value: "Political", label: "Political", color: "bg-chart-5/20 text-chart-5" },
];

const SENTIMENTS = [
  { value: "Positive", label: "Positive", color: "bg-green-100 text-green-800" },
  { value: "Negative", label: "Negative", color: "bg-red-100 text-red-800" },
  { value: "Neutral", label: "Neutral", color: "bg-gray-100 text-gray-800" },
];

interface ForceDetailDialogProps {
  force: any;
  isOpen: boolean;
  onClose: () => void;
}

const ForceDetailDialog: React.FC<ForceDetailDialogProps> = ({ force, isOpen, onClose }) => {
  if (!force) return null;

  const forceType = FORCE_TYPES.find(t => t.value === force.type);
  const clusterCategory = CLUSTER_CATEGORIES.find(c => c.value === force.steep);
  const sentiment = SENTIMENTS.find(s => s.value === force.sentiment);
  
  // Use cluster name if available, otherwise fall back to STEEP category
  const clusterInfo = force.clusterLabel ? {
    label: force.clusterLabel,
    color: "bg-blue-100 text-blue-800" // Default cluster color
  } : clusterCategory;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold pr-8">
            {force.title}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Header badges */}
            <div className="flex flex-wrap gap-2">
              {forceType && (
                <Badge className={forceType.color}>
                  {forceType.label}
                </Badge>
              )}
              
              {clusterInfo && (
                <Badge className={clusterInfo.color}>
                  {clusterInfo.label}
                </Badge>
              )}
              
              {sentiment && (
                <Badge className={sentiment.color}>
                  {sentiment.label}
                </Badge>
              )}
              
              {force.impact && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Impact: {force.impact}
                </Badge>
              )}
              
              {force.ttm && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {force.ttm}
                </Badge>
              )}
            </div>

            {/* Main content */}
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground mb-2">Description</h3>
                <p className="text-sm leading-relaxed">{force.text}</p>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {force.scope && (
                  <div>
                    <span className="font-medium text-muted-foreground">Scope:</span>
                    <span className="ml-2">{force.scope}</span>
                  </div>
                )}
                
                {force.source && (
                  <div>
                    <span className="font-medium text-muted-foreground">Source:</span>
                    <span className="ml-2">{force.source}</span>
                  </div>
                )}
                
                <div>
                  <span className="font-medium text-muted-foreground">Created:</span>
                  <span className="ml-2">
                    {new Date(force.createdAt).toLocaleDateString()}
                  </span>
                </div>
                
                <div>
                  <span className="font-medium text-muted-foreground">Updated:</span>
                  <span className="ml-2">
                    {new Date(force.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Tags */}
              {force.tags && force.tags.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {force.tags.map((tag: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Relevance score for search results */}
              {force.relevanceScore && (
                <div>
                  <span className="font-medium text-sm text-muted-foreground">Relevance Score:</span>
                  <span className="ml-2 text-sm">
                    {(force.relevanceScore * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

interface ForceRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    forces: any[];
    onForceClick: (force: any) => void;
    isItemLoaded: (index: number) => boolean;
  };
}

const ForceRow = ({ index, style, data }: ForceRowProps) => {
  const { forces, onForceClick, isItemLoaded } = data;
  const force = forces[index];
  const isLoaded = isItemLoaded(index);

  if (!isLoaded) {
    // Loading placeholder
    return (
      <div style={style} className="p-2">
        <Card>
          <CardContent className="p-4">
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-full"></div>
              <div className="h-3 bg-muted rounded w-2/3"></div>
              <div className="flex gap-2 mt-2">
                <div className="h-6 bg-muted rounded w-16"></div>
                <div className="h-6 bg-muted rounded w-20"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!force) return <div style={style} />;

  const forceType = FORCE_TYPES.find(t => t.value === force.type);
  const clusterCategory = CLUSTER_CATEGORIES.find(c => c.value === force.steep);
  const sentiment = SENTIMENTS.find(s => s.value === force.sentiment);
  
  // Use cluster name if available, otherwise fall back to STEEP category
  const clusterInfo = force.clusterLabel ? {
    label: force.clusterLabel,
    color: "bg-blue-100 text-blue-800" // Default cluster color
  } : clusterCategory;

  return (
    <div style={style} className="p-2">
      <Card 
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => onForceClick(force)}
        data-testid={`force-row-${force.id}`}
      >
        <CardContent className="p-4">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-semibold text-sm leading-tight flex-1">
                {force.title}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Eye className="h-3 w-3" />
                </Button>
                {force.source && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground line-clamp-2">
              {force.text}
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {forceType && (
                  <Badge className={`text-xs ${forceType.color}`}>
                    {forceType.label}
                  </Badge>
                )}
                
                {clusterInfo && (
                  <Badge className={`text-xs ${clusterInfo.color}`}>
                    {clusterInfo.label}
                  </Badge>
                )}
                
                {sentiment && (
                  <Badge className={`text-xs ${sentiment.color}`}>
                    {sentiment.label}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {force.impact && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {force.impact}
                  </span>
                )}
                {force.ttm && (
                  <span>{force.ttm}</span>
                )}
              </div>
            </div>

            {/* Tags preview */}
            {force.tags && force.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {force.tags.slice(0, 3).map((tag: string, index: number) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {force.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{force.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
            
            {/* Relevance score */}
            {force.relevanceScore && (
              <div className="text-xs text-muted-foreground">
                Relevance: {(force.relevanceScore * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const VirtualizedSearchResults: React.FC<VirtualizedSearchResultsProps> = ({
  searchResults,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onForceClick,
  height = 600,
  itemHeight = 180,
}) => {
  const [selectedForce, setSelectedForce] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  const forces = searchResults.forces || [];
  const itemCount = hasNextPage ? forces.length + 1 : forces.length;

  const isItemLoaded = useCallback((index: number) => {
    return !!forces[index];
  }, [forces]);

  const handleForceClick = useCallback((force: any) => {
    setSelectedForce(force);
    setShowDetails(true);
    onForceClick?.(force);
  }, [onForceClick]);

  const listData = useMemo(() => ({
    forces,
    onForceClick: handleForceClick,
    isItemLoaded,
  }), [forces, handleForceClick, isItemLoaded]);

  if (isLoading && forces.length === 0) {
    return (
      <div className="space-y-4" data-testid="virtualized-loading">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded w-20"></div>
                  <div className="h-6 bg-muted rounded w-24"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (forces.length === 0) {
    return (
      <Card data-testid="no-results">
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No results found</p>
            <p className="text-sm">Try adjusting your search terms or filters</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div 
        className="border rounded-lg overflow-hidden"
        data-testid="virtualized-search-results"
      >
        <InfiniteLoader
          isItemLoaded={isItemLoaded}
          itemCount={itemCount}
          loadMoreItems={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
            return Promise.resolve();
          }}
        >
          {({ onItemsRendered, ref }) => (
            <List
              ref={ref}
              height={height}
              itemCount={itemCount}
              itemSize={itemHeight}
              onItemsRendered={onItemsRendered}
              itemData={listData}
              overscanCount={5}
            >
              {ForceRow as any}
            </List>
          )}
        </InfiniteLoader>
      </div>

      {isFetchingNextPage && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">
                Loading more results...
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ForceDetailDialog
        force={selectedForce}
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
      />
    </div>
  );
};

export default VirtualizedSearchResults;