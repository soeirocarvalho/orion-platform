import { useState, useEffect, useMemo, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { 
  Search, 
  Filter, 
  SlidersHorizontal, 
  Tags, 
  Calendar,
  TrendingUp,
  Save,
  X,
  ChevronDown,
  Check
} from "lucide-react";
import { useAppStore, useAppActions } from "@/lib/store";
import { apiRequest } from "@/lib/queryClient";
import type { SearchQuery, SearchResponse, FacetCounts } from "@shared/schema";

interface SearchInterfaceProps {
  projectId: string;
  onResultsChange?: (results: SearchResponse) => void;
  onInfiniteLoadingChange?: (props: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
    isLoading: boolean;
  }) => void;
  initialQuery?: Partial<SearchQuery>;
  compact?: boolean;
}

const CLUSTER_CATEGORIES = [
  { value: "Social", label: "Social", color: "bg-chart-1/20 text-chart-1" },
  { value: "Technological", label: "Technological", color: "bg-chart-2/20 text-chart-2" },
  { value: "Economic", label: "Economic", color: "bg-chart-3/20 text-chart-3" },
  { value: "Environmental", label: "Environmental", color: "bg-chart-4/20 text-chart-4" },
  { value: "Political", label: "Political", color: "bg-chart-5/20 text-chart-5" },
];

const FORCE_TYPES = [
  { value: "M", label: "Megatrends" },
  { value: "T", label: "Trends" },
  { value: "WS", label: "Weak Signals" },
  { value: "WC", label: "Wildcards" },
  { value: "S", label: "Signals" },
];

const SENTIMENTS = [
  { value: "Positive", label: "Positive", color: "bg-green-100 text-green-800" },
  { value: "Negative", label: "Negative", color: "bg-red-100 text-red-800" },
  { value: "Neutral", label: "Neutral", color: "bg-gray-100 text-gray-800" },
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "impact", label: "Impact" },
  { value: "created_at", label: "Created Date" },
  { value: "updated_at", label: "Updated Date" },
  { value: "title", label: "Title" },
];

export function SearchInterface({ 
  projectId, 
  onResultsChange, 
  onInfiniteLoadingChange,
  initialQuery = {},
  compact = false 
}: SearchInterfaceProps) {
  // Selection state
  const selectedForcesArray = useAppStore(state => state.selectedForces);
  const selectedForces = useMemo(() => new Set(selectedForcesArray), [selectedForcesArray]);
  const { toggleForceSelection, selectForces, clearSelection } = useAppActions();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState<SearchQuery>({
    q: "",
    projectId,
    page: 1,
    pageSize: 50,
    sort: "relevance",
    sortOrder: "desc",
    includeFacets: true,
    includeEmbeddings: false,
    types: ["M", "T", "WS", "WC"], // Default to curated forces only, exclude signals (S)
    ...initialQuery,
  });

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(searchQuery.tags || []);
  const [searchInput, setSearchInput] = useState(searchQuery.q || "");

  // Debounce search input for API calls
  const debouncedSearchInput = useDebounce(searchInput, 300);

  // Update search query when debounced input changes
  useEffect(() => {
    setSearchQuery(prev => ({ ...prev, q: debouncedSearchInput, page: 1 }));
  }, [debouncedSearchInput]);

  // Build API URL for search
  const buildSearchUrl = useCallback((query: SearchQuery) => {
    const params = new URLSearchParams();
    
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value)) {
          value.forEach(item => params.append(key, String(item)));
        } else {
          params.set(key, String(value));
        }
      }
    });
    
    return `/api/v1/forces/search?${params.toString()}`;
  }, []);

  // Execute search query with infinite loading
  const searchResults = useInfiniteQuery<SearchResponse>({
    queryKey: ["/api/v1/forces/search", searchQuery],
    queryFn: async ({ pageParam = 1 }) => {
      const queryWithPage = { ...searchQuery, page: pageParam as number };
      const url = buildSearchUrl(queryWithPage);
      const response = await apiRequest("GET", url);
      const data = await response.json();
      return data;
    },
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.page + 1 : undefined;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
    initialPageParam: 1,
  });

  // Create combined search response from infinite query data
  const combinedSearchResponse = useMemo(() => {
    if (!searchResults.data?.pages.length) return null;
    
    const allForces = searchResults.data.pages.flatMap(page => page.forces);
    const firstPage = searchResults.data.pages[0];
    const lastPage = searchResults.data.pages[searchResults.data.pages.length - 1];
    
    return {
      forces: allForces,
      total: firstPage.total,
      page: lastPage.page,
      pageSize: firstPage.pageSize,
      totalPages: firstPage.totalPages,
      hasMore: lastPage.hasMore,
      facets: firstPage.facets, // Use facets from first page
      took: searchResults.data.pages.reduce((sum, page) => sum + page.took, 0),
    };
  }, [searchResults.data]);

  // Call onResultsChange when results change
  useEffect(() => {
    if (combinedSearchResponse && onResultsChange) {
      onResultsChange(combinedSearchResponse);
    }
  }, [combinedSearchResponse, onResultsChange]);

  // Call onInfiniteLoadingChange when infinite loading state changes
  useEffect(() => {
    if (onInfiniteLoadingChange) {
      onInfiniteLoadingChange({
        hasNextPage: searchResults.hasNextPage || false,
        isFetchingNextPage: searchResults.isFetchingNextPage || false,
        fetchNextPage: searchResults.fetchNextPage,
        isLoading: searchResults.isLoading || false,
      });
    }
  }, [
    searchResults.hasNextPage, 
    searchResults.isFetchingNextPage, 
    searchResults.fetchNextPage, 
    searchResults.isLoading, 
    onInfiniteLoadingChange
  ]);

  // Available tags from facets for autocomplete
  const availableTags = useMemo(() => {
    if (!combinedSearchResponse?.facets?.tags) return [];
    return Object.keys(combinedSearchResponse.facets.tags)
      .filter(tag => tag.toLowerCase().includes(tagInput.toLowerCase()))
      .slice(0, 10);
  }, [combinedSearchResponse?.facets?.tags, tagInput]);

  // Filter update handlers
  const updateSearchQuery = useCallback((updates: Partial<SearchQuery>) => {
    setSearchQuery(prev => ({ ...prev, ...updates, page: 1 }));
  }, []);

  const toggleArrayFilter = useCallback((field: keyof SearchQuery, value: string) => {
    setSearchQuery(prev => {
      const currentArray = (prev[field] as string[]) || [];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(item => item !== value)
        : [...currentArray, value];
      return { ...prev, [field]: newArray.length > 0 ? newArray : undefined, page: 1 };
    });
  }, []);

  const addTag = useCallback((tag: string) => {
    if (tag && !selectedTags.includes(tag)) {
      const newTags = [...selectedTags, tag];
      setSelectedTags(newTags);
      updateSearchQuery({ tags: newTags });
      setTagInput("");
    }
  }, [selectedTags, updateSearchQuery]);

  const removeTag = useCallback((tag: string) => {
    const newTags = selectedTags.filter(t => t !== tag);
    setSelectedTags(newTags);
    updateSearchQuery({ tags: newTags.length > 0 ? newTags : undefined });
  }, [selectedTags, updateSearchQuery]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery({
      q: "",
      projectId,
      page: 1,
      pageSize: 50,
      sort: "relevance",
      sortOrder: "desc",
      includeFacets: true,
      includeEmbeddings: false,
      types: ["M", "T", "WS", "WC"], // Maintain curated forces default when clearing
    });
    setSearchInput(""); // Clear the input field too
    setSelectedTags([]);
    setTagInput("");
  }, [projectId]);

  // Render filter section
  const renderFilters = () => {
    if (!showFilters) return null;

    const facets = combinedSearchResponse?.facets;

    return (
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg" data-testid="filters-title">
              Search Filters
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cluster Categories */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Cluster Categories</Label>
            <div className="flex flex-wrap gap-2">
              {CLUSTER_CATEGORIES.map((category) => (
                <Badge
                  key={category.value}
                  variant={searchQuery.steep?.includes(category.value as "Social" | "Technological" | "Economic" | "Environmental" | "Political") ? "default" : "outline"}
                  className={`cursor-pointer transition-colors ${
                    searchQuery.steep?.includes(category.value as "Social" | "Technological" | "Economic" | "Environmental" | "Political") ? category.color : ""
                  }`}
                  onClick={() => toggleArrayFilter("steep", category.value as "Social" | "Technological" | "Economic" | "Environmental" | "Political")}
                  data-testid={`filter-steep-${category.value.toLowerCase()}`}
                >
                  {category.label}
                  {facets?.steep?.[category.value] && (
                    <span className="ml-1 text-xs">({facets.steep[category.value]})</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Force Types */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Force Types</Label>
            <div className="flex flex-wrap gap-2">
              {FORCE_TYPES.map((type) => (
                <Badge
                  key={type.value}
                  variant={searchQuery.types?.includes(type.value as "M" | "T" | "WS" | "WC" | "S") ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleArrayFilter("types", type.value as "M" | "T" | "WS" | "WC" | "S")}
                  data-testid={`filter-type-${type.value.toLowerCase()}`}
                >
                  {type.label}
                  {facets?.types?.[type.value] && (
                    <span className="ml-1 text-xs">({facets.types[type.value]})</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Sentiments */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Sentiment</Label>
            <div className="flex flex-wrap gap-2">
              {SENTIMENTS.map((sentiment) => (
                <Badge
                  key={sentiment.value}
                  variant={searchQuery.sentiments?.includes(sentiment.value as "Positive" | "Negative" | "Neutral") ? "default" : "outline"}
                  className={`cursor-pointer transition-colors ${
                    searchQuery.sentiments?.includes(sentiment.value as "Positive" | "Negative" | "Neutral") ? sentiment.color : ""
                  }`}
                  onClick={() => toggleArrayFilter("sentiments", sentiment.value as "Positive" | "Negative" | "Neutral")}
                  data-testid={`filter-sentiment-${sentiment.value.toLowerCase()}`}
                >
                  {sentiment.label}
                  {facets?.sentiments?.[sentiment.value] && (
                    <span className="ml-1 text-xs">({facets.sentiments[sentiment.value]})</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Impact Range */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Impact Range: {searchQuery.impactMin || 1} - {searchQuery.impactMax || 10}
            </Label>
            <div className="px-2">
              <Slider
                min={1}
                max={10}
                step={0.1}
                value={[searchQuery.impactMin || 1, searchQuery.impactMax || 10]}
                onValueChange={([min, max]) => 
                  updateSearchQuery({ impactMin: Math.max(1, min), impactMax: Math.max(1, max) })
                }
                data-testid="slider-impact-range"
              />
            </div>
            {facets?.impactRanges && (
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>1-3: {facets.impactRanges["1-3"]}</span>
                <span>4-6: {facets.impactRanges["4-6"]}</span>
                <span>7-8: {facets.impactRanges["7-8"]}</span>
                <span>9-10: {facets.impactRanges["9-10"]}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Tags</Label>
            <div className="space-y-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    data-testid="button-add-tag"
                  >
                    <Tags className="mr-2 h-4 w-4" />
                    Add tag...
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search tags..."
                      value={tagInput}
                      onValueChange={setTagInput}
                    />
                    <CommandEmpty>No tags found.</CommandEmpty>
                    <CommandGroup>
                      {availableTags.map((tag) => (
                        <CommandItem
                          key={tag}
                          value={tag}
                          onSelect={() => addTag(tag)}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              selectedTags.includes(tag) ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          {tag}
                          {facets?.tags?.[tag] && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {facets.tags[tag]}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer"
                      data-testid={`selected-tag-${tag}`}
                    >
                      {tag}
                      <X
                        className="ml-1 h-3 w-3"
                        onClick={() => removeTag(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Selection handlers
  const handleSelectAll = () => {
    const allCurrentPageIds = combinedSearchResponse?.forces.map(force => force.id) || [];
    selectForces(allCurrentPageIds, 'add');
  };

  const handleClearSelection = () => {
    clearSelection();
  };

  const currentPageSelectedCount = combinedSearchResponse?.forces.filter(force => selectedForces.has(force.id)).length || 0;
  const totalSelectedCount = selectedForces.size;

  // Render selection controls
  const renderSelectionControls = () => {
    if (!combinedSearchResponse) return null;

    return (
      <div className="flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center space-x-4">
          <div className="text-sm">
            <span className="font-medium text-blue-600">{totalSelectedCount}</span>
            <span className="text-muted-foreground ml-1">forces selected</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={currentPageSelectedCount === combinedSearchResponse.forces.length}
              data-testid="button-select-all-search"
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSelection}
              disabled={totalSelectedCount === 0}
              data-testid="button-clear-selection-search"
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Render results summary
  const renderResultsSummary = () => {
    if (!combinedSearchResponse) return null;

    const { total, page, pageSize, took } = combinedSearchResponse;
    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, total);

    return (
      <div className="flex items-center justify-between mb-4" data-testid="results-summary">
        <div className="text-sm text-muted-foreground">
          Showing {startItem}-{endItem} of {total.toLocaleString()} results
          <span className="ml-2 text-xs">({took}ms)</span>
        </div>
        <div className="flex items-center space-x-2">
          <Label htmlFor="sort-select" className="text-sm">Sort by:</Label>
          <Select
            value={searchQuery.sort}
            onValueChange={(value) => updateSearchQuery({ sort: value as any })}
          >
            <SelectTrigger className="w-32" id="sort-select" data-testid="select-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder='Search: keyword AND keyword OR "exact phrase"'
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
              <div className="text-xs text-muted-foreground mt-1 ml-9">
                Use AND, OR operators and "quotes" for exact phrases
              </div>
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {renderFilters()}

      {/* Selection Controls */}
      {renderSelectionControls()}

      {/* Results Summary */}
      {renderResultsSummary()}

      {/* Loading State */}
      {searchResults.isLoading && (
        <div className="text-center py-8" data-testid="loading-state">
          <div className="text-muted-foreground">Searching...</div>
        </div>
      )}

      {/* Error State */}
      {searchResults.error && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="text-destructive" data-testid="error-state">
              Search failed: {searchResults.error.message}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {combinedSearchResponse && (
        <div className="space-y-3" data-testid="search-results">
          {combinedSearchResponse.forces.map((force: any) => (
            <Card key={force.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <Checkbox
                        checked={selectedForces.has(force.id)}
                        onCheckedChange={() => toggleForceSelection(force.id)}
                        className="mt-1"
                        data-testid={`checkbox-force-${force.id}`}
                      />
                      <div className="flex-1">
                        <h3 
                          className="font-semibold text-base leading-tight"
                          data-testid={`force-title-${force.id}`}
                        >
                          {force.title}
                        </h3>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Badge variant="outline" className="text-xs">
                        {FORCE_TYPES.find(t => t.value === force.type)?.label || force.type}
                      </Badge>
                      {force.impact && (
                        <Badge variant="secondary" className="text-xs">
                          Impact: {force.impact}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="ml-7">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {force.text}
                    </p>
                  </div>
                  
                  <div className="ml-7 flex items-center space-x-4 pt-2">
                    <Badge 
                      className={
                        CLUSTER_CATEGORIES.find(c => c.value === force.steep)?.color || 
                        "bg-muted text-muted-foreground"
                      }
                    >
                      {force.steep}
                    </Badge>
                    
                    {force.sentiment && (
                      <Badge 
                        className={
                          SENTIMENTS.find(s => s.value === force.sentiment)?.color || 
                          "bg-muted text-muted-foreground"
                        }
                      >
                        {force.sentiment}
                      </Badge>
                    )}
                    
                    {force.ttm && (
                      <span className="text-xs text-muted-foreground">
                        {force.ttm}
                      </span>
                    )}
                    
                    {force.tags && force.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {force.tags.slice(0, 3).map((tag: string, index: number) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {force.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{force.tags.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {combinedSearchResponse && combinedSearchResponse.totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={searchQuery.page <= 1}
            onClick={() => updateSearchQuery({ page: searchQuery.page - 1 })}
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          
          <span className="text-sm text-muted-foreground px-4">
            Page {searchQuery.page} of {combinedSearchResponse.totalPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            disabled={searchQuery.page >= combinedSearchResponse.totalPages}
            onClick={() => updateSearchQuery({ page: searchQuery.page + 1 })}
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}