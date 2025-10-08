import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Circle, Diamond, Star, Triangle, Info, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAppStore, useAppActions } from '@/lib/store';

interface RadarDataPoint {
  id: string;
  dimension: string;
  type: string;
  driving_force: string;
  description: string;
  magnitude: number;
  distance: number;
  color_hex: string;
  level_of_impact: number | null;
  feasibility: number;
  urgency: number;
  time_to_market: string | null;
  sentiment: string;
}

interface RadarApiResponse {
  success: boolean;
  total: number;
  points: RadarDataPoint[];
  dimensions: string[];
  types: string[];
  timestamp: string;
}

interface CanvasRadarChartProps {
  projectId?: string;
  filters?: Record<string, any>;
  className?: string;
}

export function CanvasRadarChart({ 
  projectId = '695ad788-c67f-460c-bff8-c51d63f1f9d1',
  filters = {},
  className 
}: CanvasRadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<RadarDataPoint | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [sweepAngle, setSweepAngle] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 800 });
  const [showInfo, setShowInfo] = useState(false);
  const animationRef = useRef<number>();

  // Selection state from global store
  const selectedForcesArray = useAppStore(state => state.selectedForces);
  const selectedForces = useMemo(() => new Set(selectedForcesArray), [selectedForcesArray]);
  const { selectForces } = useAppActions();

  // Fetch radar data from ORION API
  const { data: radarResponse, isLoading, error, refetch } = useQuery<RadarApiResponse>({
    queryKey: ['/api/v1/analytics/radar', projectId, filters, [...selectedForcesArray].sort().join(',')],
    queryFn: async () => {
      // Transform filters to proper URL parameters format
      const queryParams = new URLSearchParams({
        project_id: projectId,
        // Let server decide: 200 for initial load, more for search
        ...(filters?.search ? { pageSize: '1000' } : {}),
      });
      
      // Add selected force IDs if any forces are selected
      if (selectedForcesArray.length > 0) {
        queryParams.set('selectedForceIds', selectedForcesArray.join(','));
      }
      
      // Add filters if they exist, converting arrays to comma-separated strings
      if (filters) {
        if (filters.search) queryParams.set('search', filters.search);
        if (filters.types?.length > 0) queryParams.set('types', filters.types.join(','));
        if (filters.dimensions?.length > 0) queryParams.set('dimensions', filters.dimensions.join(','));
        if (filters.steep?.length > 0) queryParams.set('steep', filters.steep.join(','));
        if (filters.sentiments?.length > 0) queryParams.set('sentiments', filters.sentiments.join(','));
        if (filters.horizons?.length > 0) queryParams.set('horizons', filters.horizons.join(','));
        if (filters.tags?.length > 0) queryParams.set('tags', filters.tags.join(','));
        
        // Convert impactRange [min, max] to impactMin/impactMax
        if (filters.impactRange && Array.isArray(filters.impactRange)) {
          const [min, max] = filters.impactRange;
          if (min > 1) queryParams.set('impactMin', min.toString());
          if (max < 10) queryParams.set('impactMax', max.toString());
        }
      }
      
      console.log('[CanvasRadarChart] API request:', `/api/v1/analytics/radar?${queryParams.toString()}`);
      
      const response = await apiRequest("GET", `/api/v1/analytics/radar?${queryParams}`);
      const data = await response.json();
      
      console.log('[CanvasRadarChart] API response:', { 
        success: data.success, 
        total: data.total, 
        pointsLength: data.points?.length 
      });
      
      return data;
    },
    enabled: !!projectId,
    refetchOnWindowFocus: false,
  });

  // Use radar data points
  const data = radarResponse?.points || [];

  // Helper function to convert hex to HSL for color sorting
  const hexToHsl = useCallback((hex: string) => {
    // Validate hex color format
    if (!/^#[0-9A-F]{6}$/i.test(hex)) {
      console.warn('Invalid hex color:', hex, 'using fallback');
      hex = '#64ffda'; // Use fallback color
    }
    
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  }, []);

  // Create color-sorted data for gradient effect while maintaining individual force distribution
  const sortedData = useMemo(() => {
    if (!data.length) return [];
    
    // Sort entire data array by dimension color for rainbow gradient
    return [...data].sort((a, b) => {
      const aHsl = hexToHsl(a.color_hex);
      const bHsl = hexToHsl(b.color_hex);
      
      // Primary sort by hue for rainbow effect
      if (Math.abs(aHsl.h - bHsl.h) > 5) {
        return aHsl.h - bHsl.h;
      }
      // Secondary sort by saturation
      if (Math.abs(aHsl.s - bHsl.s) > 10) {
        return bHsl.s - aHsl.s;
      }
      // Tertiary sort by lightness
      return aHsl.l - bHsl.l;
    });
  }, [data, hexToHsl]);

  // Clear hovered point when data changes to prevent stale tooltips
  useEffect(() => {
    setHoveredPoint(null);
  }, [sortedData]);

  const getTypeIcon = useCallback((type: string) => {
    const iconProps = { className: "w-4 h-4", strokeWidth: 2 };
    switch (type) {
      case 'Megatrend':
        return <Circle {...iconProps} fill="currentColor" />;
      case 'Trend':
        return <Diamond {...iconProps} fill="currentColor" />;
      case 'Wildcard':
      case 'Wild Card': // Handle both formats
        return <Star {...iconProps} fill="currentColor" />;
      case 'Weak Signal':
        return <Triangle {...iconProps} fill="currentColor" />;
      default:
        return <Circle {...iconProps} />;
    }
  }, []);

  // Auto-resize canvas based on container
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Animation loop for the sweep
  useEffect(() => {
    const animate = () => {
      setSweepAngle(prev => (prev + 0.01) % (Math.PI * 2));
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Main canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isLoading) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;

    // Set high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - Math.min(width, height) * 0.05;
    
    // Guard against empty datasets
    if (sortedData.length === 0) {
      return;
    }

    // Create gradient background
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
    gradient.addColorStop(0, '#ffffff05');
    gradient.addColorStop(0.5, '#ffffff02');
    gradient.addColorStop(1, '#00000000');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw concentric circles (gray with transparency)
    ctx.strokeStyle = '#6b727940';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 10; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (maxRadius / 10) * i, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Draw rotating light sweep
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(sweepAngle);
    
    // Create sweep gradient with electric blue
    if (ctx.createConicGradient) {
      const sweepGradient = ctx.createConicGradient(0, 0, 0);
      sweepGradient.addColorStop(0, 'rgba(0, 212, 255, 0)');
      sweepGradient.addColorStop(0.1, 'rgba(0, 212, 255, 0.1)');
      sweepGradient.addColorStop(0.15, 'rgba(0, 212, 255, 0.3)');
      sweepGradient.addColorStop(0.2, 'rgba(0, 212, 255, 0.1)');
      sweepGradient.addColorStop(0.3, 'rgba(0, 212, 255, 0)');
      sweepGradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
      
      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();

    // Draw axes for each data point (thin lines from center to each point)
    sortedData.forEach((point, index) => {
      // Position each force individually around the radar for distributed layout
      const angle = (index * 2 * Math.PI) / sortedData.length - Math.PI / 2;
      
      const radius = (point.distance / 10) * maxRadius;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Validate color for the line
      const isValidHex = /^#[0-9A-F]{6}$/i.test(point.color_hex);
      const color = isValidHex ? point.color_hex : '#64ffda';
      
      const isHovered = hoveredPoint === point;
      
      if (isHovered) {
        // Draw glow effect for hovered line
        ctx.strokeStyle = color + '15';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // Draw illuminated line
        ctx.strokeStyle = color + '50';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        // Draw normal line
        ctx.strokeStyle = color + '40';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });

    // Draw data points with size based on magnitude
    sortedData.forEach((point, index) => {
      // Position each force individually around the radar for distributed layout
      const angle = (index * 2 * Math.PI) / sortedData.length - Math.PI / 2;
      
      const radius = (point.distance / 10) * maxRadius;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Validate color_hex format
      const isValidHex = /^#[0-9A-F]{6}$/i.test(point.color_hex);
      const color = isValidHex ? point.color_hex : '#64ffda'; // fallback color

      // Scale point size based on magnitude (1-10 range maps to different sizes)
      const baseSize = 2;
      const maxSize = 10;
      const sizeMultiplier = baseSize + (point.magnitude / 10) * (maxSize - baseSize);
      const glowSize = sizeMultiplier * 2.5;

      // Check if point is selected
      const isSelected = selectedForces.has(point.id);

      // Draw glow effect (size varies with magnitude, enhanced if selected)
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, isSelected ? glowSize * 1.5 : glowSize);
      glowGradient.addColorStop(0, isSelected ? '#FFD700' + '80' : color + '80');
      glowGradient.addColorStop(1, isSelected ? '#FFD700' + '00' : color + '00');
      
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? glowSize * 1.5 : glowSize, 0, 2 * Math.PI);
      ctx.fill();

      // Draw main point (size varies with magnitude, enhanced if selected)
      ctx.fillStyle = isSelected ? '#FFD700' : color;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? sizeMultiplier * 1.3 : sizeMultiplier, 0, 2 * Math.PI);
      ctx.fill();

      // Add inner glow (size varies with magnitude)
      ctx.fillStyle = isSelected ? '#FFD700' + 'FF' : color + 'FF';
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? sizeMultiplier * 0.8 : sizeMultiplier * 0.6, 0, 2 * Math.PI);
      ctx.fill();

      // Add selection border for selected points
      if (isSelected) {
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, sizeMultiplier * 1.5, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });

    // Draw center point
    const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 6);
    centerGradient.addColorStop(0, 'rgba(100, 255, 218, 1)');
    centerGradient.addColorStop(1, 'rgba(100, 255, 218, 0.3)');
    
    ctx.fillStyle = centerGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = 'rgba(100, 255, 218, 1)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, 2 * Math.PI);
    ctx.fill();

  }, [sortedData, dimensions, sweepAngle, isLoading, hoveredPoint, selectedForces]);

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    setMousePos({ x: event.clientX, y: event.clientY });

    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - Math.min(width, height) * 0.05;

    // Check if mouse is near any point (considering variable sizes)
    let closestPoint: RadarDataPoint | null = null;
    let minDistance = Infinity;

    sortedData.forEach((point, index) => {
      // Use same individual positioning as in drawing
      const angle = (index * 2 * Math.PI) / sortedData.length - Math.PI / 2;
      
      const radius = (point.distance / 10) * maxRadius;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Calculate size based on magnitude for hit detection
      const baseSize = 2;
      const maxSize = 10;
      const sizeMultiplier = baseSize + (point.magnitude / 10) * (maxSize - baseSize);
      const hitRadius = sizeMultiplier + 8; // Larger hit area for better interaction

      const distance = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);
      if (distance < hitRadius && distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    });

    setHoveredPoint(closestPoint);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !hoveredPoint) return;

    // Use hoveredPoint as the clicked point
    const forceId = hoveredPoint.id;

    // Determine selection mode based on modifier keys
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    
    if (isCtrlOrCmd) {
      // Toggle mode: add if not selected, remove if selected
      const mode = selectedForces.has(forceId) ? 'remove' : 'add';
      selectForces([forceId], mode);
    } else {
      // Replace mode: clear existing selection and select clicked force
      selectForces([forceId], 'replace');
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  // Function to select all visible forces on the radar
  const handleSelectAllVisible = () => {
    const allVisibleIds = sortedData.map(point => point.id);
    console.log('[CanvasRadarChart] Selecting all visible forces:', { 
      count: allVisibleIds.length, 
      ids: allVisibleIds.slice(0, 5) + (allVisibleIds.length > 5 ? '...' : ''),
      currentSelection: selectedForcesArray.length 
    });
    
    if (allVisibleIds.length > 0) {
      selectForces(allVisibleIds, 'add');
      
      // Log after selection to verify state update
      setTimeout(() => {
        const newSelection = useAppStore.getState().selectedForces;
        console.log('[CanvasRadarChart] After selection update:', { 
          newSelectionCount: newSelection.length,
          expectedCount: selectedForcesArray.length + allVisibleIds.length 
        });
      }, 100);
    }
  };

  if (error) {
    return (
      <div className={className}>
        <Alert variant="destructive" data-testid="canvas-radar-error">
          <AlertDescription>
            Failed to load radar data: {error instanceof Error ? error.message : 'Unknown error'}
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-2" 
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <Card className={className} data-testid="canvas-radar-chart">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Strategic Intelligence Radar</CardTitle>
          {sortedData.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllVisible}
              className="flex items-center space-x-2"
              data-testid="button-select-all-visible"
            >
              <Target className="w-4 h-4" />
              <span>Select All Visible ({sortedData.length})</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <div className="p-6">
        {/* Chart container */}
        <div className="h-[600px]" ref={containerRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full bg-muted/20 rounded-lg">
              <div className="text-center" data-testid="canvas-radar-loading">
                <div className="animate-spin h-12 w-12 border-4 border-primary/30 border-t-primary rounded-full mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Loading radar visualization...</p>
              </div>
            </div>
          ) : sortedData.length === 0 ? (
            <div className="flex items-center justify-center h-full bg-muted/20 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">No data available for radar visualization</p>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <canvas
                ref={canvasRef}
                className="cursor-crosshair w-full h-full"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleCanvasClick}
                data-testid="canvas-radar-canvas"
              />
              
              {/* Info Button */}
              <Button
                variant="outline"
                size="icon"
                className="absolute bottom-4 right-4 w-8 h-8 bg-card/90 backdrop-blur-sm border-muted-foreground/20 hover:bg-card z-10"
                onClick={() => setShowInfo(!showInfo)}
                data-testid="canvas-radar-info-button"
              >
                <Info className="w-4 h-4" />
              </Button>

              {/* Info Box */}
              {showInfo && (
                <Card className="absolute bottom-16 right-4 w-80 bg-card/95 backdrop-blur-sm border-muted-foreground/20 z-10 animate-fade-in">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">Canvas Radar Interpretation</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div>
                      <h4 className="font-medium text-primary text-sm">Point Size</h4>
                      <p className="text-xs text-muted-foreground">
                        Larger points represent driving forces with higher magnitude/scope
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary text-sm">Distance from Center</h4>
                      <p className="text-xs text-muted-foreground">
                        Distance represents the calculated impact level of the driving force
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary text-sm">Color Coding</h4>
                      <p className="text-xs text-muted-foreground">
                        Colors represent STEEP dimensions (Social, Tech, Economic, Environmental, Political)
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Interactive tooltip */}
              {hoveredPoint && (
                <div
                  className="fixed z-[9999] pointer-events-none"
                  style={{
                    left: mousePos.x + 10,
                    top: mousePos.y - 10
                  }}
                  data-testid="canvas-radar-tooltip"
                >
                  <Card className="p-3 border-primary/20 bg-card/95 backdrop-blur-sm max-w-sm">
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {hoveredPoint.dimension} • {hoveredPoint.type}
                      </div>
                      <div 
                        className="text-lg font-semibold"
                        style={{ 
                          color: /^#[0-9A-F]{6}$/i.test(hoveredPoint.color_hex) 
                            ? hoveredPoint.color_hex 
                            : '#64ffda' 
                        }}
                      >
                        {hoveredPoint.driving_force}
                      </div>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(hoveredPoint.type)}
                        <span className="text-xs text-muted-foreground">{hoveredPoint.sentiment}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Magnitude: {hoveredPoint.magnitude}</span>
                        <span>•</span>
                        <span>Impact: {hoveredPoint.distance}</span>
                      </div>
                      {hoveredPoint.time_to_market && (
                        <div className="text-xs text-muted-foreground">
                          TTM: {hoveredPoint.time_to_market}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status footer */}
        {radarResponse?.success && !isLoading && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>
              Showing {sortedData.length} driving forces • Generated {new Date(radarResponse.timestamp).toLocaleTimeString()}
            </span>
            <Badge variant="secondary" className="text-xs">
              Canvas Radar
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
}