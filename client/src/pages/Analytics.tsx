import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { CanvasRadarChart } from "@/components/charts/CanvasRadarChart";
import { AdvancedSearchInterface } from "@/components/AdvancedSearchInterface";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentProject, useScanningFilters, useAppStore, useAppActions } from "@/lib/store";
import { Zap, Target, X } from "lucide-react";
import type { Project } from "@shared/schema";
import type { AdvancedSearchFilters } from "@/components/AdvancedSearchInterface";


export default function Analytics() {
  // Use the same project as the current scanning session to ensure force IDs match
  const currentProjectId = useCurrentProject() || "695ad788-c67f-460c-bff8-c51d63f1f9d1";
  
  // Get global scanning filters and selection state from store - these are our single source of truth
  const scanningFilters = useScanningFilters();
  const selectedForcesArray = useAppStore(state => state.selectedForces);
  const selectedForces = useMemo(() => new Set(selectedForcesArray), [selectedForcesArray]);
  const { setScanningFilters, clearSelection } = useAppActions();
  
  // Convert scanning filters to advanced search format for the radar - pass through all filters
  const analyticsFilters = useMemo(() => ({
    search: scanningFilters?.search || undefined,
    types: scanningFilters?.types?.length > 0 ? scanningFilters.types : ["M", "T", "WS", "WC"],
    dimensions: scanningFilters?.dimensions?.length > 0 ? scanningFilters.dimensions : [],
    // Pass through all search filters to ensure radar displays search results
    steep: scanningFilters?.steep || [],
    sentiments: scanningFilters?.sentiments || [],
    tags: scanningFilters?.tags || [],
    impactRange: scanningFilters?.impactRange || undefined,
    sort: scanningFilters?.sort || "relevance",
    lens: scanningFilters?.lens || "all",
    timeHorizon: scanningFilters?.timeHorizon || "all",
    sentimentFilter: scanningFilters?.sentimentFilter || "all",
  }), [scanningFilters]);

  // Handle filter changes from AdvancedSearchInterface
  const handleFiltersChange = useCallback((filters: AdvancedSearchFilters) => {
    setScanningFilters({
      search: filters.search || undefined,
      types: filters.types,
      steep: filters.steep || [],
      sentiments: filters.sentiments || [],
      tags: filters.tags || [],
      impactRange: [filters.impactMin, filters.impactMax],
      sort: filters.sort,
      // Legacy fields for backward compatibility
      lens: "all",
      timeHorizon: "all", 
      sentimentFilter: "all",
    });
  }, [setScanningFilters]);

  // Get project data
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/v1/projects"],
  });

  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Show active filter summary - only for search and non-default selections
  const activeFiltersCount = useMemo(() => {
    if (!scanningFilters) return 0;
    let count = 0;
    if (scanningFilters.search) count++;
    
    // Count dimensions as active
    if (scanningFilters.dimensions?.length > 0) count++;
    
    // Count types as active when selected set differs from radar default set
    const radarDefaultTypes = new Set(["M", "T", "WS", "WC"]);
    const selectedTypes = new Set(scanningFilters.types || []);
    const typesActive = selectedTypes.size !== radarDefaultTypes.size || 
      Array.from(selectedTypes).some(type => !radarDefaultTypes.has(type));
    if (typesActive) count++;
    
    return count;
  }, [scanningFilters]);

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Analytics Dashboard"
        subtitle={currentProject?.name || "Strategic intelligence visualization and insights"}
      />
      
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Advanced Search Interface - Same as Scanning Page */}
        <div className="mb-6">
          <AdvancedSearchInterface
            projectId={currentProjectId}
            onFiltersChange={handleFiltersChange}
            compact={true}
            showResultsCount={true}
          />
        </div>

        {/* Active Filters Summary */}
        {activeFiltersCount > 0 && (
          <Card className="mb-6">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className="flex items-center space-x-1">
                    <Zap className="h-3 w-3" />
                    <span>{activeFiltersCount} active filter{activeFiltersCount !== 1 ? 's' : ''}</span>
                  </Badge>
                  {scanningFilters?.search && (
                    <Badge variant="outline">
                      Search: "{scanningFilters.search}"
                    </Badge>
                  )}
                  {scanningFilters?.types?.length > 0 && scanningFilters.types.length < 5 && (
                    <Badge variant="outline">
                      Types: {scanningFilters.types.length}
                    </Badge>
                  )}
                  {scanningFilters?.dimensions?.length > 0 && (
                    <Badge variant="outline">
                      Dimensions: {scanningFilters.dimensions.length}
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    Use advanced search above to clear filters
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Force Selection Summary */}
        {selectedForces.size > 0 && (
          <Card className="mb-6">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="default" className="flex items-center space-x-1 bg-amber-500 hover:bg-amber-600">
                    <Target className="h-3 w-3" />
                    <span>{selectedForces.size} driving force{selectedForces.size !== 1 ? 's' : ''} selected</span>
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Click forces in charts below to select • Hold Ctrl/Cmd to multi-select
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  data-testid="button-clear-selection-analytics"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Selection
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Main Chart - Canvas Radar Only (No Table) */}
        <div className="mb-8">
          <CanvasRadarChart 
            projectId={currentProjectId}
            filters={analyticsFilters}
            className="h-[95vh] w-full"
          />
        </div>

      </div>
    </div>
  );
}
