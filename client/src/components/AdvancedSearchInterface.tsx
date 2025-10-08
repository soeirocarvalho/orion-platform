import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Search, 
  Filter, 
  SlidersHorizontal, 
  Layers, 
  TrendingUp,
  Save,
  X,
  ChevronDown,
  Check,
  Target,
  Plus,
  Minus,
  RotateCcw,
  Loader2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useAppStore, useAppActions } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import type { SearchQuery, SearchResponse, FacetCounts, DrivingForce } from "@shared/schema";

interface AdvancedSearchInterfaceProps {
  projectId: string;
  onFiltersChange?: (filters: AdvancedSearchFilters) => void;
  compact?: boolean;
  showResultsCount?: boolean;
}

// Enhanced filters that match SearchQuery capabilities
export interface AdvancedSearchFilters {
  search: string;
  types: string[];
  steep: string[];
  sentiments: string[];
  tags: string[];
  impactMin: number;
  impactMax: number;
  sort: string;
  dimensions?: string[];
}

const DIMENSIONS = [
  { value: "Digital & AI", label: "Digital & AI", color: "bg-chart-1/20 text-chart-1" },
  { value: "Business", label: "Business", color: "bg-chart-2/20 text-chart-2" },
  { value: "Climate Change", label: "Climate Change", color: "bg-chart-3/20 text-chart-3" },
  { value: "Consumer", label: "Consumer", color: "bg-chart-4/20 text-chart-4" },
  { value: "Technology Acceleration", label: "Technology Acceleration", color: "bg-chart-5/20 text-chart-5" },
  { value: "Resources", label: "Resources", color: "bg-chart-1/20 text-chart-1" },
  { value: "Space", label: "Space", color: "bg-chart-2/20 text-chart-2" },
  { value: "Mobility", label: "Mobility", color: "bg-chart-3/20 text-chart-3" },
  { value: "Work", label: "Work", color: "bg-chart-4/20 text-chart-4" },
  { value: "Health", label: "Health", color: "bg-chart-5/20 text-chart-5" },
  { value: "Security", label: "Security", color: "bg-chart-1/20 text-chart-1" },
  { value: "Urban", label: "Urban", color: "bg-chart-2/20 text-chart-2" },
  { value: "Finance", label: "Finance", color: "bg-chart-3/20 text-chart-3" },
  { value: "Education", label: "Education", color: "bg-chart-4/20 text-chart-4" },
  { value: "Media", label: "Media", color: "bg-chart-5/20 text-chart-5" },
  { value: "Food", label: "Food", color: "bg-chart-1/20 text-chart-1" },
  { value: "Energy", label: "Energy", color: "bg-chart-2/20 text-chart-2" },
  { value: "Policy", label: "Policy", color: "bg-chart-3/20 text-chart-3" },
  { value: "Social", label: "Social", color: "bg-chart-4/20 text-chart-4" },
  { value: "Governance", label: "Governance", color: "bg-chart-5/20 text-chart-5" },
];

const FORCE_TYPES = [
  { value: "M", label: "Megatrends", shortLabel: "Mega" },
  { value: "T", label: "Trends", shortLabel: "Trends" },
  { value: "WS", label: "Weak Signals", shortLabel: "Weak" },
  { value: "WC", label: "Wildcards", shortLabel: "Wild" },
  { value: "S", label: "Signals", shortLabel: "Signals" },
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

export function AdvancedSearchInterface({ 
  projectId, 
  onFiltersChange, 
  compact = false,
  showResultsCount = true
}: AdvancedSearchInterfaceProps) {
  
  // Get global scanning filters state and selection using stable selectors
  const scanningFilters = useAppStore(useCallback((state) => state.scanningFilters, []));
  const selectedForcesArray = useAppStore(useCallback((state) => state.selectedForces, []));
  const selectedForces = useMemo(() => new Set(selectedForcesArray), [selectedForcesArray]);
  const { setScanningFilters, selectForces, clearSelection } = useAppActions();
  const { toast } = useToast();
  
  // Local state for advanced filters - stable initial values
  const [searchInput, setSearchInput] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["M", "T", "WS", "WC"]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("relevance");
  const [showFilters, setShowFilters] = useState(false);
  
  // Selection operation state
  const [isSelectionLoading, setIsSelectionLoading] = useState(false);
  const [selectedSelectionMode, setSelectedSelectionMode] = useState<'replace' | 'add' | 'remove'>('replace');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 20;

  // Use refs to track initialization and prevent infinite loops
  const isInitializedRef = useRef(false);
  const lastSyncedFiltersRef = useRef<string>("");

  // Helper functions for Type and Dimension display
  const getTypeDisplayName = (type: string | undefined) => {
    if (!type) return "Unknown";
    switch (type) {
      case "M":
        return "Megatrend";
      case "T":
        return "Trend";
      case "WS":
        return "Weak Signal";
      case "WC":
        return "Wildcard";
      case "S":
        return "Signal";
      default:
        return type || "Unknown";
    }
  };

  const getTypeColor = (type: string | undefined) => {
    if (!type) return "bg-muted text-muted-foreground";
    const colors: { [key: string]: string } = {
      "M": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      "T": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      "WS": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      "WC": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      "S": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    };
    return colors[type] || "bg-muted text-muted-foreground";
  };

  // Use static dimensions list (no API call needed)
  const dimensions = DIMENSIONS;

  // Debounce search input for API calls
  const debouncedSearchInput = useDebounce(searchInput, 300);

  // Build search query for facets
  const searchQueryParams: SearchQuery = useMemo(() => ({
    q: debouncedSearchInput || "*", // Use wildcard to show all results when no search term
    projectId,
    page: 1,
    pageSize: 50,
    sort: sortBy as any,
    sortOrder: "desc",
    includeFacets: true,
    includeEmbeddings: false,
    types: selectedTypes as any,
    dimensions: selectedDimensions.length > 0 ? selectedDimensions : undefined,
  }), [debouncedSearchInput, projectId, sortBy, selectedTypes, selectedDimensions]);

  // Build search query for results table
  const resultsQueryParams: SearchQuery = useMemo(() => ({
    q: debouncedSearchInput || "*", // Use wildcard to show all results when no search term
    projectId,
    page: currentPage + 1,
    pageSize,
    sort: sortBy as any,
    sortOrder: "desc",
    includeFacets: false,
    includeEmbeddings: false,
    types: selectedTypes as any,
    dimensions: selectedDimensions.length > 0 ? selectedDimensions : undefined,
  }), [debouncedSearchInput, projectId, sortBy, selectedTypes, selectedDimensions, currentPage, pageSize]);

  // Build API URL for search (used for facets)
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

  // Fetch facets for filter options
  const facetsQuery = useInfiniteQuery<SearchResponse>({
    queryKey: ["/api/v1/forces/search", searchQueryParams],
    queryFn: async ({ pageParam = 1 }) => {
      const queryWithPage = { ...searchQueryParams, page: pageParam as number };
      const url = buildSearchUrl(queryWithPage);
      const response = await apiRequest("GET", url);
      return response.json();
    },
    getNextPageParam: () => undefined, // We only need first page for facets
    enabled: !!projectId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
    initialPageParam: 1,
  });

  // Fetch search results for table display
  const searchResultsQuery = useQuery<SearchResponse>({
    queryKey: ["/api/v1/forces/search", resultsQueryParams],
    queryFn: async () => {
      const url = buildSearchUrl(resultsQueryParams);
      const response = await apiRequest("GET", url);
      return response.json();
    },
    enabled: !!projectId,
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const facets = facetsQuery.data?.pages[0]?.facets;
  const totalResults = facetsQuery.data?.pages[0]?.total || 0;
  const searchResults = searchResultsQuery.data;
  const searchForces = searchResults?.forces || [];
  const isSearchLoading = searchResultsQuery.isLoading;

  // Create advanced filters object
  const currentFilters: AdvancedSearchFilters = useMemo(() => ({
    search: debouncedSearchInput,
    types: selectedTypes,
    steep: [],
    sentiments: [],
    tags: [],
    impactMin: 1,
    impactMax: 10,
    sort: sortBy,
    dimensions: selectedDimensions,
  }), [debouncedSearchInput, selectedTypes, selectedDimensions, sortBy]);

  // Initialize local state from global state on mount only
  useEffect(() => {
    if (!isInitializedRef.current) {
      setSearchInput(scanningFilters.search || "");
      setSelectedTypes(scanningFilters.types || ["M", "T", "WS", "WC"]);
      setSelectedDimensions(scanningFilters.dimensions || []);
      setSortBy(scanningFilters.sort || "relevance");
      isInitializedRef.current = true;
    }
  }, []);

  // Update parent component when filters change - use stable callback
  const stableOnFiltersChange = useCallback(onFiltersChange || (() => {}), []);
  
  useEffect(() => {
    if (isInitializedRef.current && onFiltersChange) {
      stableOnFiltersChange(currentFilters);
    }
  }, [currentFilters, stableOnFiltersChange, onFiltersChange]);

  // Update global scanning filters when local filters change - debounced and stable
  useEffect(() => {
    if (!isInitializedRef.current) return;
    
    // Create a stable representation of current filters to prevent unnecessary updates
    const newFilters = {
      search: debouncedSearchInput,
      types: selectedTypes,
      steep: [],
      sentiments: [],
      tags: [],
      impactRange: [1, 10] as [number, number],
      sort: sortBy,
      dimensions: selectedDimensions,
      // Keep existing legacy fields for backward compatibility  
      lens: scanningFilters.lens || "all",
      timeHorizon: scanningFilters.timeHorizon || "all",
      sentimentFilter: 'all',
    };
    
    // Only update if filters actually changed to prevent loops
    const filtersString = JSON.stringify(newFilters);
    if (filtersString !== lastSyncedFiltersRef.current) {
      lastSyncedFiltersRef.current = filtersString;
      setScanningFilters(newFilters);
    }
  }, [debouncedSearchInput, selectedTypes, selectedDimensions, sortBy, setScanningFilters, scanningFilters.lens, scanningFilters.timeHorizon]);


  // Filter update handlers
  const toggleArrayFilter = useCallback((currentArray: string[], value: string, setter: (arr: string[]) => void) => {
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    setter(newArray);
  }, []);


  // Helper functions for table
  const toggleForceSelection = useCallback((forceId: string) => {
    if (selectedForces.has(forceId)) {
      selectForces([forceId], 'remove');
    } else {
      selectForces([forceId], 'add');
    }
  }, [selectedForces, selectForces]);

  const handleSelectAll = useCallback((forces: DrivingForce[], checked: boolean) => {
    const forceIds = forces.map(f => f.id);
    if (checked) {
      selectForces(forceIds, 'add');
    } else {
      selectForces(forceIds, 'remove');
    }
  }, [selectForces]);

  const isAllSelected = useCallback((forces: DrivingForce[]) => {
    return forces.length > 0 && forces.every(force => selectedForces.has(force.id));
  }, [selectedForces]);

  const isSomeSelected = useCallback((forces: DrivingForce[]) => {
    return forces.some(force => selectedForces.has(force.id));
  }, [selectedForces]);

  const getSelectAllState = useCallback((forces: DrivingForce[]) => {
    const allSelected = isAllSelected(forces);
    const someSelected = isSomeSelected(forces);
    if (allSelected) return true;
    if (someSelected) return 'indeterminate' as const;
    return false;
  }, [isAllSelected, isSomeSelected]);

  const getSentimentColor = useCallback((sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'neutral': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  }, []);

  const getDescriptionPreview = useCallback((text: string | null) => {
    if (!text) return "No description available";
    return text.length > 300 ? text.substring(0, 300) + "..." : text;
  }, []);

  // Pagination handlers
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  const totalPages = Math.ceil(totalResults / pageSize);
  const hasNextPage = currentPage < totalPages - 1;
  const hasPrevPage = currentPage > 0;

  // Clear all filters - resets both local and global state
  const clearFilters = useCallback(() => {
    const defaultFilters = {
      search: "",
      types: ["M", "T", "WS", "WC"] as string[],
      steep: [] as string[],
      sentiments: [] as string[],
      tags: [] as string[],
      impactRange: [1, 10] as [number, number],
      sort: "relevance",
      dimensions: [] as string[],
      // Keep legacy fields
      lens: "all" as const,
      timeHorizon: "all" as const,
      sentimentFilter: "all",
    };
    
    // Update local state
    setSearchInput(defaultFilters.search);
    setSelectedTypes(defaultFilters.types);
    setSelectedDimensions(defaultFilters.dimensions);
    setSortBy(defaultFilters.sort);
    setCurrentPage(0);
    
    // Update global state
    const filtersString = JSON.stringify(defaultFilters);
    lastSyncedFiltersRef.current = filtersString;
    setScanningFilters(defaultFilters);
  }, [setScanningFilters]);

  // Function to fetch all matching force IDs for selection
  const fetchAllMatchingForceIds = useCallback(async (): Promise<string[]> => {
    const allForceIds: string[] = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000; // Large page size to minimize requests

    while (hasMore) {
      const queryForSelection: SearchQuery = {
        ...searchQueryParams,
        page,
        pageSize,
        includeFacets: false, // Don't need facets for selection
        includeEmbeddings: false,
      };

      const url = buildSearchUrl(queryForSelection);
      const response = await apiRequest("GET", url);
      const data: SearchResponse = await response.json();
      
      if (!data || !data.forces) {
        throw new Error(`Failed to fetch forces: Invalid response`);
      }

      const pageForceIds = data.forces?.map(force => force.id) || [];
      allForceIds.push(...pageForceIds);
      
      // Check if there are more pages
      hasMore = data.forces?.length === pageSize && allForceIds.length < data.total;
      page++;
      
      // Safety check to prevent infinite loops
      if (page > 100) {
        console.warn('Reached maximum page limit (100) when fetching force IDs');
        break;
      }
    }

    return allForceIds;
  }, [searchQueryParams, buildSearchUrl]);

  // Handle applying filtered results as selection
  const handleApplySelection = useCallback(async (mode: 'replace' | 'add' | 'remove') => {
    if (totalResults === 0) {
      toast({
        title: "No results to select",
        description: "Your current filters don't match any forces.",
        variant: "destructive",
      });
      return;
    }

    setIsSelectionLoading(true);
    try {
      const forceIds = await fetchAllMatchingForceIds();
      
      if (forceIds.length === 0) {
        toast({
          title: "No forces found",
          description: "No forces match your current filters.",
          variant: "destructive",
        });
        return;
      }

      // Track which mode we're using for loading state
      setSelectedSelectionMode(mode);
      
      // Apply the selection using the global store action
      selectForces(forceIds, mode);
      
      // Show success message
      const actionText = mode === 'replace' ? 'Selected' : mode === 'add' ? 'Added' : 'Removed';
      const preposition = mode === 'remove' ? 'from' : 'to';
      
      toast({
        title: `${actionText} ${forceIds.length.toLocaleString()} forces`,
        description: `${actionText} ${forceIds.length.toLocaleString()} forces ${mode === 'replace' ? 'as your selection' : `${preposition} your selection`}.`,
      });
    } catch (error) {
      console.error('Failed to apply selection:', error);
      toast({
        title: "Selection failed",
        description: error instanceof Error ? error.message : "Failed to apply selection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSelectionLoading(false);
    }
  }, [totalResults, fetchAllMatchingForceIds, selectForces, toast]);

  // Render filters section
  const renderFilters = () => {
    if (!showFilters) return null;

    return (
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg" data-testid="advanced-filters-title">
              Advanced Search Filters
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              data-testid="button-clear-advanced-filters"
            >
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Force Types */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Force Types</Label>
            <div className="flex flex-wrap gap-2">
              {FORCE_TYPES.map((type) => (
                <Badge
                  key={type.value}
                  variant={selectedTypes.includes(type.value) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleArrayFilter(selectedTypes, type.value, setSelectedTypes)}
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

          {/* Dimensions */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Dimensions</Label>
            <div className="space-y-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    data-testid="button-select-dimensions"
                  >
                    <Layers className="mr-2 h-4 w-4" />
                    {selectedDimensions.length > 0 
                      ? `${selectedDimensions.length} dimension${selectedDimensions.length > 1 ? 's' : ''} selected`
                      : "Select dimensions..."
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0">
                  <Command>
                    <CommandInput placeholder="Search dimensions..." />
                    <CommandEmpty>No dimensions found.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-y-auto">
                      {dimensions.map((dimension) => (
                        <CommandItem
                          key={dimension.value}
                          value={dimension.label}
                          onSelect={() => toggleArrayFilter(selectedDimensions, dimension.value, setSelectedDimensions)}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              selectedDimensions.includes(dimension.value) ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{dimension.label}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedDimensions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedDimensions.map((dimensionValue) => {
                    const dimension = dimensions.find(d => d.value === dimensionValue);
                    return (
                      <Badge
                        key={dimensionValue}
                        variant="secondary"
                        className="cursor-pointer"
                        data-testid={`selected-dimension-${dimensionValue}`}
                      >
                        {dimension?.label || dimensionValue}
                        <X
                          className="ml-1 h-3 w-3"
                          onClick={() => toggleArrayFilter(selectedDimensions, dimensionValue, setSelectedDimensions)}
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sort Options */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Sort by</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48" data-testid="select-advanced-sort">
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
        </CardContent>
      </Card>
    );
  };

  // Render compact version
  if (compact) {
    return (
      <div className="space-y-3">
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder='Search forces: keyword AND keyword OR "exact phrase"'
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                  data-testid="input-advanced-search"
                />
              </div>
              <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-advanced-filters"
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
              {showResultsCount && (
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {totalResults.toLocaleString()} results
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Compact Selection Controls - HIDDEN per user request */}
        {/* <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center justify-between space-x-3">
              <div className="flex items-center space-x-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Use as Selection</span>
                <Badge variant="outline" className="text-xs">
                  {selectedForces.size} selected
                </Badge>
              </div>
              <div className="flex items-center space-x-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSelectionLoading || totalResults === 0}
                  onClick={() => handleApplySelection('replace')}
                  data-testid="button-compact-selection-replace"
                  className="h-8 px-2"
                >
                  {isSelectionLoading && selectedSelectionMode === 'replace' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  <span className="sr-only">Replace Selection</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSelectionLoading || totalResults === 0}
                  onClick={() => handleApplySelection('add')}
                  data-testid="button-compact-selection-add"
                  className="h-8 px-2"
                >
                  {isSelectionLoading && selectedSelectionMode === 'add' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  <span className="sr-only">Add to Selection</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSelectionLoading || totalResults === 0}
                  onClick={() => handleApplySelection('remove')}
                  data-testid="button-compact-selection-remove"
                  className="h-8 px-2"
                >
                  {isSelectionLoading && selectedSelectionMode === 'remove' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                  <span className="sr-only">Remove from Selection</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card> */}
        
        {/* Filters in compact mode */}
        {renderFilters()}
      </div>
    );
  }

  // Render selection controls
  const renderSelectionControls = () => {
    const selectionModes = [
      { 
        mode: 'replace' as const, 
        label: 'Replace Selection', 
        icon: RotateCcw, 
        description: `Select these ${totalResults.toLocaleString()} forces`,
        variant: 'default' as const
      },
      { 
        mode: 'add' as const, 
        label: 'Add to Selection', 
        icon: Plus, 
        description: `Add ${totalResults.toLocaleString()} forces to selection`,
        variant: 'outline' as const
      },
      { 
        mode: 'remove' as const, 
        label: 'Remove from Selection', 
        icon: Minus, 
        description: `Remove ${totalResults.toLocaleString()} forces from selection`,
        variant: 'outline' as const
      },
    ];

    return (
      <Card className="border-2 border-dashed border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Use Filtered Results as Selection</CardTitle>
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedForces.size.toLocaleString()} currently selected
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Results Preview */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium mb-1">Preview</div>
            <div className="text-sm text-muted-foreground">
              {totalResults === 0 ? (
                "No forces match your current filters"
              ) : (
                `${totalResults.toLocaleString()} forces match your current search and filter criteria`
              )}
            </div>
          </div>

          {/* Selection Mode Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {selectionModes.map(({ mode, label, icon: Icon, description, variant }) => (
              <Button
                key={mode}
                variant={variant}
                size="sm"
                disabled={isSelectionLoading || totalResults === 0}
                onClick={() => handleApplySelection(mode)}
                className="h-auto p-3 flex flex-col items-start space-y-1"
                data-testid={`button-selection-${mode}`}
              >
                <div className="flex items-center space-x-2 w-full">
                  {isSelectionLoading && selectedSelectionMode === mode ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  <span className="font-medium">{label}</span>
                </div>
                <div className="text-xs text-muted-foreground text-left">
                  {description}
                </div>
              </Button>
            ))}
          </div>

          {/* Help Text */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <strong>Tip:</strong> Adjust your search and filters above, then use these controls to select the matching forces for analysis with the Scanning Intelligence Assistant.
          </div>
        </CardContent>
      </Card>
    );
  };

  // Render results table
  const renderResultsTable = () => {
    const selectedCount = selectedForces.size;
    
    return (
      <Card>
        <CardContent className="p-0">
          {/* Selection Toolbar */}
          {selectedCount > 0 && (
            <div className="bg-primary/10 border-b border-primary/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium" data-testid="selection-count">
                    {selectedCount} force{selectedCount === 1 ? '' : 's'} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    data-testid="button-clear-selection"
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground w-12">
                    <Checkbox
                      checked={getSelectAllState(searchForces)}
                      onCheckedChange={(checked) => handleSelectAll(searchForces, checked === true)}
                      aria-label="Select all forces on this page"
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Title</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Dimension</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Scope</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Impact</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-border">
              {isSearchLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Loading forces...
                  </td>
                </tr>
              ) : searchForces.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    {debouncedSearchInput || selectedDimensions.length > 0 || selectedTypes.length < 4
                      ? "No forces match your search criteria. Try adjusting your filters."
                      : "Loading forces..."
                    }
                  </td>
                </tr>
              ) : (
                searchForces.map((force: any) => (
                  <tr key={force.id} className={`hover:bg-muted/50 ${selectedForces.has(force.id) ? 'bg-muted/30' : ''}`} data-testid={`force-row-${force.id}`}>
                    <td className="py-3 px-4">
                      <Checkbox
                        checked={selectedForces.has(force.id)}
                        onCheckedChange={() => toggleForceSelection(force.id)}
                        aria-label={`Select ${force.title}`}
                        data-testid={`checkbox-force-${force.id}`}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <TooltipProvider>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <p className="font-medium text-sm" data-testid={`force-title-${force.id}`}>
                                {force.title}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {force.text ? force.text.substring(0, 100) + "..." : "No description available"}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent 
                            side="right" 
                            align="start"
                            className="max-w-md p-4 bg-popover border border-border rounded-lg shadow-lg z-50"
                          >
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm text-foreground mb-2">{force.title}</h4>
                              <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {getDescriptionPreview(force.text)}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={getTypeColor(force.type)} data-testid={`force-type-${force.id}`}>
                        {getTypeDisplayName(force.type)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className="bg-muted text-muted-foreground" data-testid={`force-dimension-${force.id}`}>
                        {force.dimension || 'Unassigned'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className="w-full bg-muted rounded-full h-2 mr-2 max-w-20">
                          <div 
                            className="bg-chart-1 h-2 rounded-full" 
                            style={{ width: `${(force.magnitude || 0) * 10}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground" data-testid={`force-magnitude-${force.id}`}>
                          {force.magnitude || "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className="w-full bg-muted rounded-full h-2 mr-2 max-w-20">
                          <div 
                            className="bg-chart-3 h-2 rounded-full" 
                            style={{ width: `${(force.distance || 0) * 10}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground" data-testid={`force-distance-${force.id}`}>
                          {force.distance || "N/A"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalResults > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, totalResults)} of {totalResults} forces
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={!hasPrevPage || isSearchLoading}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!hasNextPage || isSearchLoading}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
                placeholder='Search forces: keyword AND keyword OR "exact phrase"'
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
                data-testid="input-advanced-search"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-advanced-filters"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
            {showResultsCount && (
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {totalResults.toLocaleString()} results
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters - positioned immediately after search header */}
      {renderFilters()}

      {/* Results Table */}
      {!compact && renderResultsTable()}

      {/* Selection Controls - positioned at bottom after table */}
      {renderSelectionControls()}
    </div>
  );
}