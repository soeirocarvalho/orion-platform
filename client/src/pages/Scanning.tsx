import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { ThreeLensInterface } from "@/components/scanning/ThreeLensInterface";
import { ScanningAssistant } from "@/components/chat/ScanningAssistant";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentProject, useViewMode, useScanningFilters, useAppStore, useAppActions } from "@/lib/store";
import { Plus, Upload, FileText } from "lucide-react";

export default function Scanning() {
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  // Use the selected project from store or find the first project with forces
  const selectedProjectId = useCurrentProject();
  const viewMode = useViewMode();
  const scanningFilters = useScanningFilters();
  const selectedForces = useAppStore((state) => state.selectedForces);
  const { selectForces } = useAppActions();

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/v1/projects"],
  });
  
  // Fallback logic: find first project with forces if no project selected
  const currentProjectId = useMemo(() => {
    if (selectedProjectId) return selectedProjectId;
    
    // Ensure projects is an array and has data
    const projectsArray = Array.isArray(projects) ? projects : [];
    if (projectsArray.length === 0) return null;
    
    console.log('[Scanning] Available projects:', projectsArray.map(p => ({ id: p.id, name: p.name, isDefault: p.isDefault })));
    
    // Priority 1: Use the default project (most likely to have forces)
    const defaultProject = projectsArray.find((p: any) => p.isDefault);
    if (defaultProject) {
      console.log(`[Scanning] Selected default project: ${defaultProject.id} (${defaultProject.name})`);
      return defaultProject.id;
    }
    
    // Priority 2: Use project with ORION in the name
    const orionProject = projectsArray.find((p: any) => 
      p.name && p.name.toLowerCase().includes('orion')
    );
    if (orionProject) {
      console.log(`[Scanning] Selected ORION project: ${orionProject.id} (${orionProject.name})`);
      return orionProject.id;
    }
    
    // Priority 3: Use first available project
    const firstProject = projectsArray[0];
    if (firstProject) {
      console.log(`[Scanning] Selected first available project: ${firstProject.id} (${firstProject.name})`);
      return firstProject.id;
    }
    
    return null;
  }, [selectedProjectId, projects]);

  // Get forces data for context
  const { data: forcesResponse } = useQuery<{
    forces: any[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>({
    queryKey: ["/api/v1/scanning/forces", currentProjectId, viewMode],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (currentProjectId) queryParams.append('project_id', currentProjectId);
      
      if (viewMode === "all") {
        queryParams.append('includeSignals', 'true');
        queryParams.append('limit', '10000');
      } else {
        queryParams.append('limit', '5000');
      }
      
      const url = `/api/v1/scanning/forces?${queryParams.toString()}`;
      const res = await apiRequest('GET', url);
      const data = await res.json();
      return data;
    },
    enabled: !!currentProjectId,
    staleTime: 0,
  });

  const forces = forcesResponse?.forces || [];

  // Calculate missing force IDs that aren't in the current forces array
  const missingForceIds = useMemo(() => {
    if (!selectedForces.length) return [];
    
    const existingForceIds = new Set(forces.map(force => force.id));
    return selectedForces.filter(id => !existingForceIds.has(id));
  }, [selectedForces, forces]);

  // Fetch missing force details using batch API with chunking for large requests
  const { data: batchForcesResponse, isLoading: isBatchLoading, error: batchError } = useQuery<{
    forces: any[];
  }>({
    queryKey: ["/api/v1/forces/batch", missingForceIds],
    queryFn: async () => {
      if (!missingForceIds.length) return { forces: [] };
      
      // Chunk IDs to respect API limit of 100 IDs per request
      const BATCH_SIZE = 100;
      const chunks = [];
      for (let i = 0; i < missingForceIds.length; i += BATCH_SIZE) {
        chunks.push(missingForceIds.slice(i, i + BATCH_SIZE));
      }
      
      // Fetch all chunks in parallel
      const chunkPromises = chunks.map(async (chunk) => {
        const queryParams = new URLSearchParams();
        queryParams.append('ids', chunk.join(','));
        if (currentProjectId) queryParams.append('project_id', currentProjectId);
        
        const url = `/api/v1/forces/batch?${queryParams.toString()}`;
        
        try {
          const res = await apiRequest('GET', url);
          const data = await res.json();
          return data;
        } catch (error: any) {
          if (error.message?.includes('404')) {
            // Some forces not found - this is expected, return partial results
            return { forces: [] };
          }
          throw new Error(`Failed to fetch batch forces (chunk ${chunk.length} IDs)`);
        }
      });
      
      // Wait for all chunks and merge results
      const results = await Promise.all(chunkPromises);
      const allForces = results.flatMap(result => result.forces || []);
      
      return { forces: allForces };
    },
    enabled: missingForceIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const batchForces = batchForcesResponse?.forces || [];

  // Get complete selected forces data by merging existing forces with batch-fetched forces
  const selectedForcesData = useMemo(() => {
    const selectedSet = new Set(selectedForces);
    
    // Get forces from current forces array
    const existingSelectedForces = forces.filter(force => selectedSet.has(force.id));
    
    // Get forces from batch fetch
    const batchSelectedForces = batchForces.filter(force => selectedSet.has(force.id));
    
    // Merge and deduplicate by ID
    const forceMap = new Map();
    
    // Add existing forces first
    existingSelectedForces.forEach(force => forceMap.set(force.id, force));
    
    // Add batch forces (won't override existing due to Map behavior)
    batchSelectedForces.forEach(force => {
      if (!forceMap.has(force.id)) {
        forceMap.set(force.id, force);
      }
    });
    
    return Array.from(forceMap.values());
  }, [forces, batchForces, selectedForces]);

  // Get clusters data
  const { data: clustersData = [] } = useQuery<any[]>({
    queryKey: [`/api/v1/clusters?project_id=${currentProjectId}`],
    enabled: !!currentProjectId,
  });

  const importMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const authToken = localStorage.getItem("auth_token");
      
      if (!authToken) {
        throw new Error("Authentication required. Please log in again.");
      }
      
      const response = await fetch("/api/v1/scanning/import", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        body: data,
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to import file");
      }
      
      return response.json();
    },
    onSuccess: (importResult) => {
      setIsImportDialogOpen(false);
      
      // Auto-select imported forces
      if (importResult.forces && importResult.forces.length > 0) {
        const importedForceIds = importResult.forces.map((force: any) => force.id);
        selectForces(importedForceIds, 'add');
        
        toast({
          title: "Data imported successfully",
          description: `Imported ${importResult.count} driving forces. They have been automatically selected for analysis.`,
        });
      } else {
        toast({
          title: "Data imported successfully",
          description: "Your driving forces have been imported and are ready for processing.",
        });
      }
      
      // Invalidate queries after selection to ensure UI updates correctly
      queryClient.invalidateQueries({ queryKey: ["/api/v1/scanning/forces"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import data. Please check your file format and try again.",
        variant: "destructive",
      });
    },
  });

  const preprocessMutation = useMutation({
    mutationFn: async (data: { projectId: string; params: any }) => {
      const response = await apiRequest("POST", "/api/v1/scanning/preprocess", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing started",
        description: "Your data is being processed in the background. You'll be notified when it's complete.",
      });
    },
    onError: () => {
      toast({
        title: "Processing failed",
        description: "Failed to start data processing. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    setIsImportDialogOpen(true);
  };

  const processFile = (file: File) => {
    // Check if project ID is available
    if (!currentProjectId) {
      toast({
        title: "No project selected",
        description: "Please select a project before importing data.",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json'];
    const allowedExtensions = ['.csv', '.xls', '.xlsx', '.json'];
    
    const hasValidType = allowedTypes.includes(file.type);
    const hasValidExtension = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidType && !hasValidExtension) {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV, Excel, or JSON file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    console.log('[FileUpload] Starting upload:', { 
      fileName: file.name, 
      fileSize: file.size, 
      fileType: file.type,
      projectId: currentProjectId 
    });

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', currentProjectId);

    importMutation.mutate(formData);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processFile(file);
    
    // Reset file input
    event.target.value = '';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handlePreprocess = () => {
    preprocessMutation.mutate({
      projectId: currentProjectId,
      params: {
        clusteringMethod: "orion", // DEFAULT TO ORION: Use old ORION method with 37 clusters
        numClusters: 37, // ORION always uses exactly 37 semantic clusters
        embeddingModel: "text-embedding-3-large",
      },
    });
  };

  const currentProject = (projects as any[]).find((p: any) => p.id === currentProjectId);

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Scanning Dashboard"
        subtitle={currentProject?.name || "Analyze driving forces across strategic horizons"}
        onImport={handleImport}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/v1/scanning/forces"] })}
      />
      
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            {/* Run Analysis and Download Template buttons removed per user request */}
          </div>

          <div className="text-sm text-muted-foreground">
            Select project: {currentProject?.name || "No project selected"}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Three-Lens Interface - Takes 2/3 width on XL screens */}
          <div className="xl:col-span-2">
            <ThreeLensInterface projectId={currentProjectId} />
          </div>
          
          {/* Scanning Intelligence Assistant - Takes 1/3 width on XL screens */}
          <div className="xl:col-span-1">
            <ScanningAssistant
              projectId={currentProjectId}
              context="scanning"
              contextData={{
                forcesCount: Number(forcesResponse?.total || forces?.length || 0),
                clustersCount: clustersData.length || 0,
                recentForces: forces?.slice(0, 10) || [],
                selectedLens: scanningFilters.lens !== 'all' ? scanningFilters.lens : undefined,
                viewMode: viewMode,
                selectedForces: selectedForcesData,
                selectedForcesCount: selectedForcesData.length,
                batchErrorMessage: batchError?.message,
                missingForceIds: missingForceIds,
                batchForcesCount: batchForces.length
              }}
              className="h-[800px]"
            />
          </div>
        </div>
      </div>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Driving Forces</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload CSV, XLSX, or JSON files containing your driving forces data.
            </p>
            
            <div 
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border'
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="drop-zone"
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-sm font-medium mb-2">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mb-4">Supports CSV, XLSX, JSON up to 10MB</p>
              
              <input
                type="file"
                accept=".csv,.xlsx,.json"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                data-testid="input-file-upload"
              />
              <label htmlFor="file-upload">
                <Button 
                  type="button" 
                  className="bg-primary hover:bg-primary/90"
                  disabled={importMutation.isPending}
                  data-testid="button-choose-files"
                >
                  {importMutation.isPending ? "Importing..." : "Choose Files"}
                </Button>
              </label>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.open('/api/v1/scanning/template/csv', '_blank')}
                  data-testid="button-download-csv-template"
                >
                  CSV Template
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.open('/api/v1/scanning/template/xlsx', '_blank')}
                  data-testid="button-download-xlsx-template"
                >
                  Excel Template
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.open('/api/v1/scanning/template/json', '_blank')}
                  data-testid="button-download-json-template"
                >
                  JSON Template
                </Button>
              </div>
              <div className="flex items-center space-x-3">
                <Button 
                  variant="outline"
                  onClick={() => setIsImportDialogOpen(false)}
                  data-testid="button-cancel-import"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
