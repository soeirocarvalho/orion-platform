import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

// Types for server-side figure responses
export interface ServerFigureResponse {
  success: boolean;
  figure: any; // Plotly figure JSON from server
  timestamp: string;
  command: 'radar' | '3d' | 'baseline_radar' | 'baseline_3d';
  error?: string;
  details?: string;
}

// Filter types for visual endpoints
export interface VisualFilters {
  search?: string;
  types?: string[];
  steep?: string[];
  dimensions?: string[];
  projectId?: string; // Required for verifyProjectOwnership middleware
}

export interface RadarFilters extends VisualFilters {
  show_connections?: boolean;
  show_node_titles?: boolean;
}

export interface NetworkFilters extends VisualFilters {
  camera_x?: number;
  camera_y?: number;
  camera_z?: number;
  show_connections?: boolean;
  show_node_titles?: boolean;
}

/**
 * Map short type codes to full names expected by Python backend
 */
function mapTypesToFullNames(types: string[]): string[] {
  const typeMap: Record<string, string> = {
    'M': 'Megatrends',
    'T': 'Trends', 
    'WS': 'Weak Signals',
    'WC': 'Wildcards',
    'S': 'Signals'
  };
  
  return types.map(type => typeMap[type] || type);
}

/**
 * Build query parameters from filters for API requests
 */
function buildFilterParams(filters?: VisualFilters | NetworkFilters): Record<string, any> {
  if (!filters) return {};
  
  const params: Record<string, any> = {};
  
  // CRITICAL: Add project_id for verifyProjectOwnership middleware
  if (filters.projectId) params.project_id = filters.projectId;
  
  if (filters.search) params.search = filters.search;
  if (filters.types?.length) {
    // Map short codes to full names for Python backend compatibility
    params.types = mapTypesToFullNames(filters.types);
  }
  if (filters.steep?.length) params.steep = filters.steep;
  if (filters.dimensions?.length) params.dimensions = filters.dimensions;
  
  // Handle camera parameters for NetworkFilters
  const networkFilters = filters as NetworkFilters;
  if (networkFilters.camera_x !== undefined) params.camera_x = networkFilters.camera_x;
  if (networkFilters.camera_y !== undefined) params.camera_y = networkFilters.camera_y;
  if (networkFilters.camera_z !== undefined) params.camera_z = networkFilters.camera_z;
  
  return params;
}

/**
 * Build query string from parameters
 */
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => searchParams.append(key, v));
    } else if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString());
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Hook for fetching server-side radar figures
 * Uses /api/visuals/radar endpoint with legacy Python figure generation
 */
export function useRadarFigure(filters?: RadarFilters, options?: {
  baseline?: boolean;
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}) {
  const endpoint = options?.baseline ? '/api/visuals/baseline/radar' : '/api/visuals/radar';
  
  // Build query parameters
  const params = {
    ...buildFilterParams(filters),
    show_connections: filters?.show_connections?.toString() || 'false',
    show_node_titles: filters?.show_node_titles?.toString() || 'false',
  };
  
  const queryString = buildQueryString(params);
  const fullUrl = `${endpoint}${queryString}`;
  
  return useQuery<ServerFigureResponse>({
    queryKey: ['/api/visuals', 'radar', filters, { baseline: options?.baseline }],
    queryFn: async () => {
      const response = await fetch(fullUrl, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server figure generation failed: ${response.status} ${errorText}`);
      }
      
      return response.json();
    },
    enabled: options?.enabled !== false,
    retry: (failureCount, error) => {
      // Only retry on network errors, not on server errors
      if (error.message.includes('Server figure generation failed')) {
        return failureCount < 1; // Retry once for server errors
      }
      return failureCount < 3; // Retry 3 times for network errors
    },
    staleTime: 30000, // Consider stale after 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus || false,
  });
}

/**
 * Hook for fetching server-side 3D network figures  
 * Uses /api/visuals/3d endpoint with legacy Python figure generation
 */
export function useNetworkFigure(filters?: NetworkFilters, options?: {
  baseline?: boolean;
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}) {
  const endpoint = options?.baseline ? '/api/visuals/baseline/3d' : '/api/visuals/3d';
  
  // Build query parameters
  const params = {
    ...buildFilterParams(filters),
    show_connections: filters?.show_connections?.toString() || 'false',
    show_node_titles: filters?.show_node_titles?.toString() || 'false',
  };
  
  // Camera parameters are now handled in buildFilterParams
  
  const queryString = buildQueryString(params);
  const fullUrl = `${endpoint}${queryString}`;
  
  return useQuery<ServerFigureResponse>({
    queryKey: ['/api/visuals', '3d', filters, { baseline: options?.baseline }],
    queryFn: async () => {
      const response = await fetch(fullUrl, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server figure generation failed: ${response.status} ${errorText}`);
      }
      
      return response.json();
    },
    enabled: options?.enabled !== false,
    retry: (failureCount, error) => {
      // Only retry on network errors, not on server errors
      if (error.message.includes('Server figure generation failed')) {
        return failureCount < 1; // Retry once for server errors
      }
      return failureCount < 3; // Retry 3 times for network errors
    },
    staleTime: 30000, // Consider stale after 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus || false,
  });
}

/**
 * Utility function to invalidate visual figure caches
 * Useful when filters change or data is updated
 */
export function invalidateVisualCache(type?: 'radar' | '3d' | 'all') {
  if (type === 'radar') {
    return queryClient.invalidateQueries({ 
      queryKey: ['/api/visuals', 'radar'] 
    });
  } else if (type === '3d') {
    return queryClient.invalidateQueries({ 
      queryKey: ['/api/visuals', '3d'] 
    });
  } else {
    return queryClient.invalidateQueries({ 
      queryKey: ['/api/visuals'] 
    });
  }
}

/**
 * Utility function to prefetch visual figures
 * Useful for warming cache with default filters
 */
export function prefetchRadarFigure(filters?: RadarFilters, options?: { baseline?: boolean }) {
  const endpoint = options?.baseline ? '/api/visuals/baseline/radar' : '/api/visuals/radar';
  
  const params = {
    ...buildFilterParams(filters),
    show_connections: filters?.show_connections?.toString() || 'false',
    show_node_titles: filters?.show_node_titles?.toString() || 'false',
  };
  
  const queryString = buildQueryString(params);
  const fullUrl = `${endpoint}${queryString}`;
  
  return queryClient.prefetchQuery({
    queryKey: ['/api/visuals', 'radar', filters, { baseline: options?.baseline }],
    queryFn: async () => {
      const response = await fetch(fullUrl, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server figure generation failed: ${response.status} ${errorText}`);
      }
      
      return response.json();
    },
    staleTime: 30000,
  });
}

export function prefetchNetworkFigure(filters?: NetworkFilters, options?: { baseline?: boolean }) {
  const endpoint = options?.baseline ? '/api/visuals/baseline/3d' : '/api/visuals/3d';
  
  const params = {
    ...buildFilterParams(filters),
  };
  
  // Add camera parameters if provided
  if (filters?.camera_x !== undefined) params.camera_x = filters.camera_x;
  if (filters?.camera_y !== undefined) params.camera_y = filters.camera_y;
  if (filters?.camera_z !== undefined) params.camera_z = filters.camera_z;
  
  const queryString = buildQueryString(params);
  const fullUrl = `${endpoint}${queryString}`;
  
  return queryClient.prefetchQuery({
    queryKey: ['/api/visuals', '3d', filters, { baseline: options?.baseline }],
    queryFn: async () => {
      const response = await fetch(fullUrl, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server figure generation failed: ${response.status} ${errorText}`);
      }
      
      return response.json();
    },
    staleTime: 30000,
  });
}

/**
 * Combined hook that fetches both regular and baseline figures for comparison
 * Useful for parity checking and validation
 */
export function useRadarComparison(filters?: RadarFilters, options?: { enabled?: boolean }) {
  const regularQuery = useRadarFigure(filters, { 
    baseline: false, 
    enabled: options?.enabled,
    refetchOnWindowFocus: false,
  });
  
  const baselineQuery = useRadarFigure(filters, { 
    baseline: true, 
    enabled: options?.enabled,
    refetchOnWindowFocus: false,
  });
  
  const bothLoaded = !regularQuery.isLoading && !baselineQuery.isLoading;
  const hasError = regularQuery.error || baselineQuery.error;
  
  // Simple parity check - compare figures if both loaded successfully
  const parityOk = bothLoaded && !hasError && 
    regularQuery.data?.success && baselineQuery.data?.success;
  
  return {
    regular: regularQuery,
    baseline: baselineQuery,
    comparison: {
      bothLoaded,
      hasError,
      parityOk,
      regularSuccess: regularQuery.data?.success,
      baselineSuccess: baselineQuery.data?.success,
    }
  };
}

export function useNetworkComparison(filters?: NetworkFilters, options?: { enabled?: boolean }) {
  const regularQuery = useNetworkFigure(filters, { 
    baseline: false, 
    enabled: options?.enabled,
    refetchOnWindowFocus: false,
  });
  
  const baselineQuery = useNetworkFigure(filters, { 
    baseline: true, 
    enabled: options?.enabled,
    refetchOnWindowFocus: false,
  });
  
  const bothLoaded = !regularQuery.isLoading && !baselineQuery.isLoading;
  const hasError = regularQuery.error || baselineQuery.error;
  
  // Simple parity check - compare figures if both loaded successfully  
  const parityOk = bothLoaded && !hasError && 
    regularQuery.data?.success && baselineQuery.data?.success;
  
  return {
    regular: regularQuery,
    baseline: baselineQuery,
    comparison: {
      bothLoaded,
      hasError,
      parityOk,
      regularSuccess: regularQuery.data?.success,
      baselineSuccess: baselineQuery.data?.success,
    }
  };
}