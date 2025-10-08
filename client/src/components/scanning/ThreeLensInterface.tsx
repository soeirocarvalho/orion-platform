import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Search, Filter, Download, AlertCircle, Zap, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AdvancedSearchInterface } from "@/components/AdvancedSearchInterface";
import { VirtualizedSearchResults } from "@/components/VirtualizedSearchResults";
import { SavedSearches } from "@/components/SavedSearches";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppStore, useAppActions } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import type { DrivingForce, SearchResponse } from "@shared/schema";

// Network data structure for analytics
interface ForceNetworkData {
  nodes: Array<any>;
  edges: Array<any>;
  clusters: Array<{
    id: string;
    label: string;
    centerX: number;
    centerY: number;
    centerZ: number;
    color: string;
    size: number;
    quality?: number;
    forceCount: number;
  }>;
  layoutBounds: {
    xRange: [number, number];
    yRange: [number, number];
    zRange: [number, number];
  };
  metrics: {
    totalForces: number;
    totalClusters: number;
    assignedForces: number;
    unassignedForces: number;
    averageClusterSize: number;
    averageQuality: number;
    algorithm: string;
    isolatedClusters: number;
  };
}

interface ThreeLensInterfaceProps {
  projectId: string;
}

// Enhanced form schema with force selection validation
const projectFormSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .min(3, "Project name must be at least 3 characters")
    .max(100, "Project name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Project name can only contain letters, numbers, spaces, hyphens, and underscores"),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

export function ThreeLensInterface({ projectId }: ThreeLensInterfaceProps) {
  const [activeCategory, setActiveCategory] = useState("search");
  const [activeTab, setActiveTab] = useState("megatrends");
  const [filters, setFilters] = useState({
    steep: "all",
    timeHorizon: "all",
    search: "",
  });
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  
  // Selection state
  const selectedForcesArray = useAppStore(state => state.selectedForces);
  const selectedForces = useMemo(() => new Set(selectedForcesArray), [selectedForcesArray]);
  const { toggleForceSelection, selectForces, clearSelection, setCurrentProject } = useAppActions();
  
  // Clear selection only when project actually changes (not on initial mount)
  const prevProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevProjectIdRef.current !== null && prevProjectIdRef.current !== projectId) {
      console.log('[ThreeLensInterface] Project changed, clearing selection:', { from: prevProjectIdRef.current, to: projectId });
      clearSelection();
    }
    prevProjectIdRef.current = projectId;
  }, [projectId, clearSelection]);
  
  // Pagination state for each tab
  const [pagination, setPagination] = useState({
    megatrends: { page: 0, itemsPerPage: 20 },
    trends: { page: 0, itemsPerPage: 20 },
    weak_signals: { page: 0, itemsPerPage: 20 },
    wildcards: { page: 0, itemsPerPage: 20 },
    signals: { page: 0, itemsPerPage: 20 },
  });

  // Dialog and form state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Form handling with enhanced validation
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
    },
    mode: "onChange", // Enable real-time validation
  });

  // Enhanced validation for force selection
  const validateForceSelection = () => {
    if (selectedForces.size === 0) {
      toast({
        title: "No Forces Selected",
        description: "Please select at least one driving force before creating a project.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // Enhanced save handler with validation
  const handleSaveAsProject = () => {
    if (!validateForceSelection()) {
      return;
    }
    setSaveDialogOpen(true);
  };

  // Enhanced mutation with better error handling
  const duplicateProjectMutation = useMutation({
    mutationFn: async (data: ProjectFormValues) => {
      // Final validation before API call
      if (selectedForces.size === 0) {
        throw new Error("No forces selected for project creation");
      }
      
      const response = await apiRequest(
        "POST",
        `/api/v1/projects/${projectId}/duplicate`,
        {
          name: data.name.trim(),
          selectedForceIds: Array.from(selectedForces),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        // Create error with both status and message for better handling
        const error = new Error(errorData.message || errorData.error || 'Failed to create project');
        (error as any).status = response.status;
        (error as any).data = errorData;
        throw error;
      }
      
      return response.json();
    },
    onSuccess: (newProject: any) => {
      toast({
        title: "Project Created Successfully",
        description: `"${newProject.name}" has been created with ${selectedForces.size} selected forces. Switching to new project...`,
      });
      setSaveDialogOpen(false);
      form.reset();
      clearSelection();
      
      // Enhanced project switching with feedback
      setTimeout(() => {
        setCurrentProject(newProject.id);
        setLocation("/scanning");
        
        // Additional success feedback after switch
        setTimeout(() => {
          toast({
            title: "Project Switch Complete",
            description: `Now viewing project: "${newProject.name}". You can start analyzing your selected forces.`,
          });
        }, 500);
      }, 300);
    },
    onError: (error: any) => {
      console.error("Failed to create project:", error);
      
      // Enhanced error handling with deterministic status code detection
      let title = "Failed to Create Project";
      let description = "An error occurred while creating the project. Please try again.";
      
      // Handle 409 Conflict (duplicate name) deterministically
      if (error.status === 409) {
        title = "Project Name Already Exists";
        description = `A project with the name "${form.getValues('name')}" already exists. Please choose a different name.`;
        
        // Set focus back to name field
        setTimeout(() => {
          const nameField = document.querySelector('[data-testid="input-project-name"]') as HTMLInputElement;
          if (nameField) nameField.focus();
        }, 100);
      } else if (error.message) {
        // Handle other specific error types by message (as fallback)
        if (error.message.includes("forces not found")) {
          title = "Invalid Force Selection";
          description = "Some selected forces are no longer available. Please refresh and try again.";
        } else if (error.message.includes("default project")) {
          title = "Cannot Duplicate Default Project";
          description = "Full duplication from the default project is not allowed. Please select specific forces to duplicate.";
        } else {
          description = error.message;
        }
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  // Create API URLs for different data types
  const createCuratedApiUrl = (lens: string, page: number = 0, limit: number = 20) => {
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    if (filters.steep !== 'all') params.append('steep', filters.steep);
    if (filters.search) params.append('search', filters.search);
    params.append('lens', lens);
    params.append('includeSignals', 'false'); // Exclude signals for curated forces
    params.append('limit', limit.toString());
    params.append('offset', (page * limit).toString());
    
    // Add type filters for WS and WC separation
    if (lens === 'weak_signals') params.append('type', 'WS');
    if (lens === 'wildcards') params.append('type', 'WC');
    
    return `/api/v1/scanning/forces?${params.toString()}`;
  };

  const createSignalsApiUrl = (page: number = 0, limit: number = 20) => {
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    if (filters.steep !== 'all') params.append('steep', filters.steep);
    if (filters.search) params.append('search', filters.search);
    params.append('includeSignals', 'true'); // Include signals
    params.append('limit', limit.toString());
    params.append('offset', (page * limit).toString());
    // Add filter to only get signals (type 'S')
    params.append('type', 'S');
    return `/api/v1/scanning/forces?${params.toString()}`;
  };

  // Separate queries for each curated lens with pagination
  const megatrendsQuery = useQuery<{
    forces: DrivingForce[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>({
    queryKey: ["/api/v1/scanning/forces", projectId, "megatrends", filters, pagination.megatrends.page],
    queryFn: async () => {
      const response = await apiRequest("GET", createCuratedApiUrl("megatrends", pagination.megatrends.page, pagination.megatrends.itemsPerPage));
      return response.json();
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

  const trendsQuery = useQuery<{
    forces: DrivingForce[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>({
    queryKey: ["/api/v1/scanning/forces", projectId, "trends", filters, pagination.trends.page],
    queryFn: async () => {
      const response = await apiRequest("GET", createCuratedApiUrl("trends", pagination.trends.page, pagination.trends.itemsPerPage));
      return response.json();
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

  const weakSignalsQuery = useQuery<{
    forces: DrivingForce[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>({
    queryKey: ["/api/v1/scanning/forces", projectId, "weak_signals", filters, pagination.weak_signals.page],
    queryFn: async () => {
      const response = await apiRequest("GET", createCuratedApiUrl("weak_signals", pagination.weak_signals.page, pagination.weak_signals.itemsPerPage));
      return response.json();
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

  const wildcardsQuery = useQuery<{
    forces: DrivingForce[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>({
    queryKey: ["/api/v1/scanning/forces", projectId, "wildcards", filters, pagination.wildcards.page],
    queryFn: async () => {
      const response = await apiRequest("GET", createCuratedApiUrl("wildcards", pagination.wildcards.page, pagination.wildcards.itemsPerPage));
      return response.json();
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

  // Query for non-curated signals
  const signalsQuery = useQuery<{
    forces: DrivingForce[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>({
    queryKey: ["/api/v1/scanning/forces", projectId, "signals", filters, pagination.signals.page],
    queryFn: async () => {
      const response = await apiRequest("GET", createSignalsApiUrl(pagination.signals.page, pagination.signals.itemsPerPage));
      return response.json();
    },
    enabled: !!projectId && activeCategory === "signals",
    staleTime: 1000 * 60 * 5,
  });

  // Add query for network data to get accurate cluster count (like Dashboard)
  const { data: networkData } = useQuery<ForceNetworkData | null>({
    queryKey: [`/api/v1/analytics/force-network/${projectId}`],
    enabled: !!projectId,
  });

  // Calculate curated forces totals (cast to numbers to avoid string concatenation)
  const curatedTotal = Number(megatrendsQuery.data?.total || 0) 
    + Number(trendsQuery.data?.total || 0) 
    + Number(weakSignalsQuery.data?.total || 0)
    + Number(wildcardsQuery.data?.total || 0);
  const signalsTotal = Number(signalsQuery.data?.total || 0);

  // Get current tab's data for curated forces
  const getCurrentCuratedTabData = () => {
    switch (activeTab) {
      case "megatrends": return megatrendsQuery;
      case "trends": return trendsQuery;
      case "weak_signals": return weakSignalsQuery;
      case "wildcards": return wildcardsQuery;
      default: return megatrendsQuery;
    }
  };

  const getLensLabel = (lens: string) => {
    switch (lens) {
      case "megatrends": return "Megatrends";
      case "trends": return "Trends";
      case "weak_signals": return "Weak Signals";
      case "wildcards": return "Wildcards";
      default: return lens;
    }
  };

  const getSteepColor = (steep: string) => {
    const colors: { [key: string]: string } = {
      "Social": "bg-chart-1/20 text-chart-1",
      "Technological": "bg-chart-2/20 text-chart-2",
      "Economic": "bg-chart-3/20 text-chart-3",
      "Environmental": "bg-chart-4/20 text-chart-4",
      "Political": "bg-chart-5/20 text-chart-5",
    };
    return colors[steep] || "bg-muted text-muted-foreground";
  };

  const getSentimentColor = (sentiment: string) => {
    const colors: { [key: string]: string } = {
      "Positive": "bg-chart-2/20 text-chart-2",
      "Negative": "bg-destructive/20 text-destructive",
      "Neutral": "bg-muted text-muted-foreground",
    };
    return colors[sentiment] || "bg-muted text-muted-foreground";
  };

  // Helper function to convert type codes to full names
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

  // Get forces for specific tab
  const getFilteredForces = (tabType: string) => {
    switch (tabType) {
      case "megatrends":
        return megatrendsQuery.data?.forces || [];
      case "trends":
        return trendsQuery.data?.forces || [];
      case "weak_signals":
        return weakSignalsQuery.data?.forces || [];
      case "wildcards":
        return wildcardsQuery.data?.forces || [];
      case "signals":
        return signalsQuery.data?.forces || [];
      default:
        return [];
    }
  };

  // Get pagination data for specific tab
  const getPaginationData = (tabType: string) => {
    let query, currentPage;
    switch (tabType) {
      case "megatrends":
        query = megatrendsQuery;
        currentPage = pagination.megatrends.page;
        break;
      case "trends":
        query = trendsQuery;
        currentPage = pagination.trends.page;
        break;
      case "weak_signals":
        query = weakSignalsQuery;
        currentPage = pagination.weak_signals.page;
        break;
      case "wildcards":
        query = wildcardsQuery;
        currentPage = pagination.wildcards.page;
        break;
      case "signals":
        query = signalsQuery;
        currentPage = pagination.signals.page;
        break;
      default:
        query = megatrendsQuery;
        currentPage = 0;
    }
    
    const total = query.data?.total || 0;
    const itemsPerPage = 20;
    const totalPages = Math.ceil(total / itemsPerPage);
    const hasNextPage = currentPage < totalPages - 1;
    const hasPrevPage = currentPage > 0;
    
    return {
      currentPage,
      totalPages,
      total,
      itemsPerPage,
      hasNextPage,
      hasPrevPage,
      isLoading: query.isLoading
    };
  };

  // Handle page changes
  const handlePageChange = (tabType: string, newPage: number) => {
    setPagination(prev => ({
      ...prev,
      [tabType]: {
        ...prev[tabType as keyof typeof prev],
        page: Math.max(0, newPage)
      }
    }));
  };

  // Extract first 2 paragraphs from text for tooltip
  const getDescriptionPreview = (text: string | null | undefined): string => {
    if (!text) return "No description available";
    
    // Split by double newlines first (paragraph separators)
    const paragraphsByDoubleNewline = text.split(/\n\s*\n/);
    if (paragraphsByDoubleNewline.length >= 2) {
      return paragraphsByDoubleNewline.slice(0, 2).join('\n\n').trim();
    }
    
    // If no double newlines, split by single newlines and group
    const sentences = text.split(/\n/);
    if (sentences.length >= 2) {
      return sentences.slice(0, 2).join('\n').trim();
    }
    
    // If no newlines, split by sentence endings and take first 2 sentences
    const sentenceEndings = text.split(/(?<=[.!?])\s+/);
    if (sentenceEndings.length >= 2) {
      return sentenceEndings.slice(0, 2).join(' ').trim();
    }
    
    // If text is too short, return as is but limit to reasonable length
    return text.length > 300 ? text.substring(0, 300) + '...' : text;
  };

  // Debug logging
  useEffect(() => {
    console.log('[DEBUG] ThreeLensInterface - Component state:', {
      activeCategory,
      activeTab,
      projectId,
      curatedTotal,
      signalsTotal,
      megatrends: megatrendsQuery.data?.total || 0,
      trends: trendsQuery.data?.total || 0,
      weakSignals: weakSignalsQuery.data?.total || 0,
      wildcards: wildcardsQuery.data?.total || 0,
    });
  }, [activeCategory, activeTab, curatedTotal, signalsTotal]);

  // Selection handlers
  const handleSelectAll = (forces: DrivingForce[], checked: boolean) => {
    const forceIds = forces.map(f => f.id).filter((id): id is string => Boolean(id));
    if (checked) {
      selectForces(forceIds, 'add');
    } else {
      selectForces(forceIds, 'remove');
    }
  };

  const isAllSelected = (forces: DrivingForce[]) => {
    return forces.length > 0 && forces.every(force => force.id && selectedForces.has(force.id));
  };

  const isSomeSelected = (forces: DrivingForce[]) => {
    return forces.some(force => force.id && selectedForces.has(force.id));
  };

  const getSelectAllState = (forces: DrivingForce[]) => {
    const allSelected = isAllSelected(forces);
    const someSelected = isSomeSelected(forces);
    if (allSelected) return true;
    if (someSelected) return 'indeterminate' as const;
    return false;
  };

  // Reusable ForceTable component with pagination
  const ForceTable = ({ forces: tableForcesToShow, tabType, isLoading }: { forces: DrivingForce[], tabType: string, isLoading?: boolean }) => {
    const paginationData = getPaginationData(tabType);
    const selectedCount = selectedForces.size;
    
    return (
      <div>
        {/* Selection Toolbar */}
        {selectedCount > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
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
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAsProject}
                  disabled={selectedForces.size === 0}
                  data-testid="button-save-as-project"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Save as New Project
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  data-testid="button-export-selected"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export Selected
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
                    checked={getSelectAllState(tableForcesToShow)}
                    onCheckedChange={(checked) => handleSelectAll(tableForcesToShow, checked === true)}
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
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading forces...
                </td>
              </tr>
            ) : tableForcesToShow.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No driving forces found. Import data to get started.
                </td>
              </tr>
            ) : (
              tableForcesToShow.map((force: DrivingForce) => (
                <tr key={force.id} className={`hover:bg-muted/50 ${force.id && selectedForces.has(force.id) ? 'bg-muted/30' : ''}`} data-testid={`force-row-${force.id}`}>
                  <td className="py-3 px-4">
                    <Checkbox
                      checked={force.id ? selectedForces.has(force.id) : false}
                      onCheckedChange={() => force.id && toggleForceSelection(force.id)}
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
      {paginationData.total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div className="text-sm text-muted-foreground">
            Showing {paginationData.currentPage * paginationData.itemsPerPage + 1} to {Math.min((paginationData.currentPage + 1) * paginationData.itemsPerPage, paginationData.total)} of {paginationData.total} forces
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(tabType, paginationData.currentPage - 1)}
              disabled={!paginationData.hasPrevPage || paginationData.isLoading}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {paginationData.currentPage + 1} of {paginationData.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(tabType, paginationData.currentPage + 1)}
              disabled={!paginationData.hasNextPage || paginationData.isLoading}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Save As New Project Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-save-project">
          <DialogHeader>
            <DialogTitle>Save as New Project</DialogTitle>
            <DialogDescription>
              Create a new project with the <strong>{selectedForces.size}</strong> selected driving forces.
              {selectedForces.size > 0 ? (
                <span className="block text-sm text-green-600 dark:text-green-400 mt-1">
                  ✓ Ready to create project with your selection
                </span>
              ) : (
                <span className="block text-sm text-red-600 dark:text-red-400 mt-1">
                  ⚠ Please select at least one force before proceeding
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => {
              // Final client-side validation
              if (selectedForces.size === 0) {
                toast({
                  title: "No Forces Selected",
                  description: "Please select at least one driving force before creating a project.",
                  variant: "destructive",
                });
                return;
              }
              duplicateProjectMutation.mutate(data);
            })} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter project name..." 
                        {...field} 
                        data-testid="input-project-name"
                      />
                    </FormControl>
                    <FormDescription>
                      Choose a descriptive name for your new project. Names must be unique.
                    </FormDescription>
                    {form.formState.errors.name && (
                      <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                        {form.formState.errors.name.message}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSaveDialogOpen(false)}
                  data-testid="button-cancel-save"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={duplicateProjectMutation.isPending || selectedForces.size === 0 || !form.formState.isValid}
                  data-testid="button-confirm-save"
                >
                  {duplicateProjectMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating Project...
                    </>
                  ) : (
                    `Create Project with ${selectedForces.size} Force${selectedForces.size === 1 ? '' : 's'}`
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
    );
  };

  return (
    <Card>
      <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
        {/* Top-level category tabs */}
        <div className="border-b border-border">
          <TabsList className="grid w-full grid-cols-2 bg-transparent h-auto p-0">
            <TabsTrigger 
              value="search" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-6 py-4"
              data-testid="tab-advanced-search"
            >
              <Zap className="w-4 h-4 mr-2" />
              Advanced Search
              {searchResults && (
                <Badge variant="secondary" className="ml-2">
                  {searchResults.total.toLocaleString()}
                </Badge>
              )}
            </TabsTrigger>
            {/* Curated Forces tab hidden per user request */}
            <TabsTrigger 
              value="signals" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-6 py-4"
              data-testid="tab-signals"
            >
              Non-Curated Signals
              <Badge variant="secondary" className="ml-2">
                {signalsTotal.toLocaleString()}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="curated" className="mt-0">
          {/* Sub-tabs for curated forces (Three-Lens Framework) */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="border-b border-border">
              <TabsList className="grid w-full grid-cols-4 bg-transparent h-auto p-0">
                <TabsTrigger 
                  value="megatrends" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-6 py-3"
                  data-testid="tab-megatrends"
                >
                  Megatrends
                  <Badge variant="secondary" className="ml-2">
                    {megatrendsQuery.data?.total || 0}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="trends" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-6 py-3"
                  data-testid="tab-trends"
                >
                  Trends
                  <Badge variant="secondary" className="ml-2">
                    {trendsQuery.data?.total || 0}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="weak_signals" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-6 py-3"
                  data-testid="tab-weak-signals"
                >
                  Weak Signals
                  <Badge variant="secondary" className="ml-2">
                    {weakSignalsQuery.data?.total || 0}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="wildcards" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-6 py-3"
                  data-testid="tab-wildcards"
                >
                  Wildcards
                  <Badge variant="secondary" className="ml-2">
                    {wildcardsQuery.data?.total || 0}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6">
              {/* Filters */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <Select 
                    value={filters.steep} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, steep: value }))}
                  >
                    <SelectTrigger className="w-48" data-testid="filter-cluster">
                      <SelectValue placeholder="All Cluster Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cluster Categories</SelectItem>
                      <SelectItem value="Social">Social</SelectItem>
                      <SelectItem value="Technological">Technological</SelectItem>
                      <SelectItem value="Economic">Economic</SelectItem>
                      <SelectItem value="Environmental">Environmental</SelectItem>
                      <SelectItem value="Political">Political</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select 
                    value={filters.timeHorizon} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, timeHorizon: value }))}
                  >
                    <SelectTrigger className="w-48" data-testid="filter-time-horizon">
                      <SelectValue placeholder="All Time Horizons" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time Horizons</SelectItem>
                      <SelectItem value="0-2">0-2 years</SelectItem>
                      <SelectItem value="2-5">2-5 years</SelectItem>
                      <SelectItem value="5+">5+ years</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 transform -translate-y-1/2" />
                    <Input
                      placeholder="Search forces..."
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      className="pl-10 w-64"
                      data-testid="input-search"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button variant="secondary" size="sm" data-testid="button-filter">
                    <Filter className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" size="sm" data-testid="button-export">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Curated Forces Content */}
              <TabsContent value="megatrends" className="mt-0">
                <ForceTable 
                  forces={getFilteredForces("megatrends")} 
                  tabType="megatrends"
                  isLoading={megatrendsQuery.isLoading}
                />
              </TabsContent>

              <TabsContent value="trends" className="mt-0">
                <ForceTable 
                  forces={getFilteredForces("trends")} 
                  tabType="trends"
                  isLoading={trendsQuery.isLoading}
                />
              </TabsContent>

              <TabsContent value="weak_signals" className="mt-0">
                <ForceTable 
                  forces={getFilteredForces("weak_signals")} 
                  tabType="weak_signals"
                  isLoading={weakSignalsQuery.isLoading}
                />
              </TabsContent>

              <TabsContent value="wildcards" className="mt-0">
                <ForceTable 
                  forces={getFilteredForces("wildcards")} 
                  tabType="wildcards"
                  isLoading={wildcardsQuery.isLoading}
                />
              </TabsContent>
            </div>
          </Tabs>
        </TabsContent>

        <TabsContent value="signals" className="mt-0">
          <div className="p-6">
            {/* Filters for signals */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <Select 
                  value={filters.steep} 
                  onValueChange={(value) => setFilters(prev => ({ ...prev, steep: value }))}
                >
                  <SelectTrigger className="w-48" data-testid="filter-cluster-signals">
                    <SelectValue placeholder="All Cluster Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cluster Categories</SelectItem>
                    <SelectItem value="Social">Social</SelectItem>
                    <SelectItem value="Technological">Technological</SelectItem>
                    <SelectItem value="Economic">Economic</SelectItem>
                    <SelectItem value="Environmental">Environmental</SelectItem>
                    <SelectItem value="Political">Political</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <Input
                    placeholder="Search signals..."
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10 w-64"
                    data-testid="input-search-signals"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Button variant="secondary" size="sm" data-testid="button-filter-signals">
                  <Filter className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="sm" data-testid="button-export-signals">
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Non-Curated Signals Content */}
            {signalsTotal === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>No non-curated signals found.</strong> Signals represent the raw, unprocessed data from various sources before they are analyzed and curated into the strategic intelligence categories (Megatrends, Trends, Weak Signals & Wildcards). Import signal data to populate this section.
                </AlertDescription>
              </Alert>
            ) : (
              <ForceTable 
                forces={getFilteredForces("signals")} 
                tabType="signals"
                isLoading={signalsQuery.isLoading}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="search" className="mt-0">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">Advanced Search</h2>
              </div>
              <SavedSearches 
                projectId={projectId}
                currentQuery={{ 
                  q: "", 
                  projectId, 
                  page: 1, 
                  pageSize: 50,
                  sort: "relevance",
                  sortOrder: "desc",
                  includeFacets: true,
                  includeEmbeddings: false
                }}
                onLoadSearch={() => {}}
                compact={true}
              />
            </div>
            
            {/* Advanced Search Interface with its own search box and filters */}
            <AdvancedSearchInterface
              projectId={projectId}
              compact={false}
              showResultsCount={true}
            />
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}