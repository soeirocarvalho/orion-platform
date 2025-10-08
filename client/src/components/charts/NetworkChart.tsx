import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Shield, RefreshCw, Move3D, MousePointer2, X } from "lucide-react";
import { useNetworkFigure, type NetworkFilters } from "@/hooks/use-visual-figures";
import { useVisualizationAccess } from "@/hooks/use-integrity-status";
import { useAppStore, useAppActions, useCurrentProject } from "@/lib/store";

interface NetworkChartProps {
  filters?: NetworkFilters;
  className?: string;
  onFiltersChange?: (filters: NetworkFilters) => void;
}

export function NetworkChart({ 
  filters = {}, 
  className, 
  onFiltersChange 
}: NetworkChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [plotlyInstance, setPlotlyInstance] = useState<any>(null);
  
  // Selection state from global store
  const selectedForcesArray = useAppStore(state => state.selectedForces);
  const selectedForces = useMemo(() => new Set(selectedForcesArray), [selectedForcesArray]);
  const { selectForces, clearSelection } = useAppActions();
  
  // System status checking for integrity and parity
  const {
    allowed: visualizationAllowed,
    blocked: visualizationBlocked,
    limited: visualizationLimited,
    strictMode,
    reason: blockingReason,
    warnings,
    systemStatus
  } = useVisualizationAccess();

  // Get current project ID for ownership verification
  const currentProjectId = useCurrentProject();
  
  // Use filters directly from props
  const finalFilters: NetworkFilters = {
    types: ["M", "T", "WS", "WC"], // Default to curated forces with short codes
    show_connections: false,
    show_node_titles: false,
    ...filters,
    projectId: currentProjectId, // Required for verifyProjectOwnership middleware
  };

  // Fetch server-side 3D network figure
  const {
    data: networkResponse,
    isLoading,
    error,
    refetch
  } = useNetworkFigure(finalFilters, {
    enabled: visualizationAllowed && !!currentProjectId,
    refetchOnWindowFocus: false,
  });

  // Filters are managed by parent component - no local state needed


  // Handle 3D chart click events for force selection - memoized to prevent handler duplication
  const handleChartClick = useCallback((eventData: any) => {
    if (!eventData.points || eventData.points.length === 0) return;
    
    const clickedPoint = eventData.points[0];
    
    // Extract force ID from customdata (first element)
    let forceId: string | null = null;
    if (clickedPoint.customdata && Array.isArray(clickedPoint.customdata)) {
      forceId = clickedPoint.customdata[0];
    }
    
    if (!forceId) {
      console.warn('[NetworkChart] No force ID found in clicked point:', clickedPoint);
      return;
    }
    
    // Convert to string to ensure consistent type
    const forceIdStr = String(forceId);
    
    // Determine selection mode based on modifier keys
    const isCtrlOrCmd = eventData.event?.ctrlKey || eventData.event?.metaKey;
    
    if (isCtrlOrCmd) {
      // Toggle mode: add if not selected, remove if selected
      const mode = selectedForces.has(forceIdStr) ? 'remove' : 'add';
      selectForces([forceIdStr], mode);
    } else {
      // Replace mode: clear existing selection and select clicked force
      selectForces([forceIdStr], 'replace');
    }
  }, [selectedForces, selectForces]);

  // Update 3D chart styling based on selection state
  const updateSelectionStyling = (plotlyRef: any) => {
    if (!plotlyRef || !networkResponse?.figure?.data) return;
    
    try {
      // Clone the original data to avoid mutations
      const updatedData = networkResponse.figure.data.map((trace: any, index: number) => {
        if (!trace.customdata) return trace;
        
        const updatedTrace = { ...trace };
        
        // Update marker colors and sizes based on selection
        if (trace.marker) {
          const colors = trace.customdata.map((customData: any[]) => {
            if (!customData || !customData[0]) return trace.marker.color;
            
            const forceId = String(customData[0]);
            if (selectedForces.has(forceId)) {
              // Highlighted color for selected forces (gold)
              return '#FFD700';
            }
            return trace.marker.color;
          });
          
          const sizes = trace.customdata.map((customData: any[]) => {
            if (!customData || !customData[0]) return trace.marker.size || 8;
            
            const forceId = String(customData[0]);
            if (selectedForces.has(forceId)) {
              // Larger size for selected forces
              return (trace.marker.size || 8) * 1.5;
            }
            return trace.marker.size || 8;
          });
          
          updatedTrace.marker = {
            ...trace.marker,
            color: colors,
            size: sizes,
            line: {
              ...trace.marker.line,
              width: trace.customdata.map((customData: any[], index: number) => {
                if (!customData || !customData[0]) return trace.marker.line?.width || 2;
                const forceId = String(customData[0]);
                return selectedForces.has(forceId) ? 3 : (trace.marker.line?.width || 2);
              }),
              color: trace.customdata.map((customData: any[], index: number) => {
                if (!customData || !customData[0]) return trace.marker.line?.color || 'rgba(255,255,255,0.9)';
                const forceId = String(customData[0]);
                return selectedForces.has(forceId) ? '#FFA500' : (trace.marker.line?.color || 'rgba(255,255,255,0.9)');
              })
            }
          };
        }
        
        return updatedTrace;
      });
      
      // Update the 3D plot with new styling
      plotlyRef.react(chartRef.current, updatedData, networkResponse.figure.layout, {
        displayModeBar: true,
        responsive: true,
        displaylogo: false,
      });
      
    } catch (error) {
      console.error('[NetworkChart] Error updating selection styling:', error);
    }
  };

  // Update styling when selection changes
  useEffect(() => {
    if (plotlyInstance && selectedForces) {
      updateSelectionStyling(plotlyInstance);
    }
  }, [selectedForces, plotlyInstance, networkResponse]);

  // Render server-side Plotly 3D figure
  useEffect(() => {
    if (!chartRef.current || !networkResponse?.success || !networkResponse?.figure) return;

    // Robust Plotly.js import with multiple fallbacks
    const loadPlotly = async () => {
      const importMethods = [
        async () => {
          const PlotlyModule = await import('plotly.js-dist');
          return PlotlyModule.default || PlotlyModule;
        },
        async () => {
          const PlotlyModule = await import('plotly.js-dist');
          return (PlotlyModule as any).default || PlotlyModule;
        },
        async () => {
          if (typeof window !== 'undefined' && (window as any).Plotly) {
            return (window as any).Plotly;
          }
          throw new Error('Window Plotly not available');
        }
      ];

      for (let i = 0; i < importMethods.length; i++) {
        try {
          const Plotly = await importMethods[i]();
          if (Plotly && typeof Plotly.react === 'function') {
            console.log(`[NetworkChart] Successfully loaded Plotly.js using method ${i + 1}`);
            return Plotly;
          }
        } catch (error) {
          console.warn(`[NetworkChart] Method ${i + 1} failed:`, error);
        }
      }
      throw new Error('All Plotly.js import methods failed');
    };

    loadPlotly().then((Plotly) => {
      try {
        // Render server-generated 3D figure directly (no client-side modifications)
        const serverFigure = networkResponse.figure;
        
        // Enhanced config for 3D network visualization
        const config = {
          displayModeBar: true,
          modeBarButtonsToRemove: [
            'hoverClosestCartesian', 
            'hoverCompareCartesian', 
            'toggleSpikelines', 
            'pan2d', 
            'lasso2d',
            'select2d'
          ],
          responsive: true,
          displaylogo: false,
          toImageButtonOptions: {
            format: 'png',
            filename: `orion_3d_network_${Date.now()}`,
            height: 800,
            width: 1000,
            scale: 2
          }
        } as any;

        // Render server figure with minimal client-side config
        if (chartRef.current) {
          const gd = chartRef.current;
          
          // Clean up any existing event handlers to prevent duplication
          if (plotlyInstance) {
            try {
              plotlyInstance.purge(gd);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          
          Plotly.react(
            gd, 
            serverFigure.data, 
            serverFigure.layout, 
            config
          ).then(() => {
            // Store plotly instance for later updates
            setPlotlyInstance(Plotly);
            
            // Add click event handler through Plotly configuration
            gd.onclick = handleChartClick;
            
            // Apply initial selection styling
            updateSelectionStyling(Plotly);
          });
        }
      } catch (error) {
        console.error('[NetworkChart] Error rendering server figure:', error);
      }
    }).catch(error => {
      console.error('[NetworkChart] Failed to load Plotly.js:', error);
      
      // Render fallback UI
      if (chartRef.current) {
        chartRef.current.innerHTML = `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 500px;
            background: #1e293b;
            border-radius: 8px;
            border: 1px solid #334155;
            color: #e2e8f0;
            font-family: system-ui, -apple-system, sans-serif;
          ">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">🌐 Server-Side 3D Network</div>
            <div style="font-size: 14px; color: #94a3b8; text-align: center; max-width: 300px;">
              3D network visualization loaded from server but Plotly.js failed to initialize. Please refresh the page.
            </div>
          </div>
        `;
      }
    });

    // Cleanup function to remove event handlers
    return () => {
      if (chartRef.current) {
        const gd = chartRef.current;
        
        // Remove click event handlers
        gd.onclick = null;
        
        // Purge Plotly instance on unmount to prevent memory leaks
        if (plotlyInstance && plotlyInstance.purge) {
          try {
            plotlyInstance.purge(gd);
          } catch (error) {
            console.warn('[NetworkChart] Error purging Plotly instance:', error);
          }
        }
      }
    };
  }, [networkResponse, handleChartClick, plotlyInstance]);

  return (
    <Card className={className} data-testid="network-chart">
      <div className="p-6">
        {/* Status indicators */}
        <div className="mb-4 space-y-2">
          {visualizationBlocked && (
            <Alert variant="destructive" data-testid="network-chart-blocked">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium">3D Network Visualization Blocked</div>
                <div className="text-sm">
                  {blockingReason || 'System integrity critical in strict mode'}
                </div>
                {strictMode && (
                  <div className="text-xs mt-1 opacity-75">
                    Strict mode is enabled - resolve integrity issues to view 3D charts
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          
          {visualizationLimited && warnings.length > 0 && (
            <Alert variant="destructive" data-testid="network-chart-degraded">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium">System Health Degraded</div>
                <div className="text-sm space-y-1">
                  {warnings.slice(0, 3).map((warning, index) => (
                    <div key={index}>• {warning}</div>
                  ))}
                  {warnings.length > 3 && (
                    <div className="text-xs opacity-75">
                      +{warnings.length - 3} more issues
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Chart Controls */}
        {visualizationAllowed && (
          <div className="mb-4 space-y-3">
            {/* Selection Status */}
            {selectedForces.size > 0 && (
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-sm">
                    {selectedForces.size} selected
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    forces selected in 3D network
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearSelection}
                  data-testid="network-clear-selection"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Selection
                </Button>
              </div>
            )}
            
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  Filters managed by advanced search above
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MousePointer2 className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click to select forces • Ctrl+Click to add/remove • Drag to rotate 3D view</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetch()}
                  disabled={isLoading}
                  data-testid="network-refresh-button"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>

                {/* System status badges */}
                <div className="flex items-center gap-2">
                  {systemStatus.integrity.data && (
                    <Badge 
                      variant={
                        systemStatus.integrity.data.status === 'healthy' ? 'default' :
                        systemStatus.integrity.data.status === 'degraded' ? 'secondary' : 
                        'destructive'
                      }
                      className="text-xs"
                    >
                      {systemStatus.integrity.data.status}
                    </Badge>
                  )}
                  
                  {systemStatus.parity.data && (
                    <Badge 
                      variant={systemStatus.parity.data.status === 'healthy' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      parity: {systemStatus.parity.data.status}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chart container */}
        <div className="h-[900px]">
          {visualizationBlocked ? (
            <div className="flex items-center justify-center h-full bg-muted/20 rounded-lg border-2 border-dashed border-destructive/30">
              <div className="text-center">
                <Shield className="h-12 w-12 mx-auto text-destructive mb-2" />
                <p className="text-sm font-medium text-destructive">
                  3D Network Chart Blocked
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  System integrity issues prevent visualization
                </p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full bg-muted/20 rounded-lg">
              <div className="text-center" data-testid="network-loading">
                <Move3D className="h-12 w-12 mx-auto text-muted-foreground mb-2 animate-pulse" />
                <p className="text-sm text-muted-foreground">Loading server-side 3D network...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Generating legacy 3D figure from backend
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full bg-muted/20 rounded-lg">
              <div className="text-center" data-testid="network-error">
                <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-2" />
                <p className="text-sm text-destructive font-medium mb-2">
                  Failed to load 3D network chart
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {error instanceof Error ? error.message : 'Unknown server error'}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          ) : !networkResponse?.success ? (
            <div className="flex items-center justify-center h-full bg-muted/20 rounded-lg">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-2" />
                <p className="text-sm text-destructive font-medium mb-2">
                  Server 3D figure generation failed
                </p>
                <p className="text-xs text-muted-foreground">
                  {networkResponse?.error || 'Unknown server error'}
                </p>
              </div>
            </div>
          ) : (
            <div 
              ref={chartRef}
              className="w-full h-full"
              data-testid="network-chart-container"
            />
          )}
        </div>

        {/* Status footer */}
        {visualizationAllowed && networkResponse?.success && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            Server-side 3D figure generated at {new Date(networkResponse.timestamp).toLocaleTimeString()}
            {visualizationLimited && (
              <span className="text-amber-600 ml-2">⚠ Degraded mode</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}