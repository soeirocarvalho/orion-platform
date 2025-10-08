import { useQuery } from "@tanstack/react-query";

// Types based on server/services/integrity-validator.ts
export interface IntegrityStatus {
  status: 'healthy' | 'degraded' | 'critical';
  summary: string;
  fixedLoaderEnabled: boolean;
  reprocessAllowed: boolean;
  reprocessBlockingReason: string | null;
  manifest?: {
    version: string;
    timestamp: string;
    environment: {
      strictFeatures: boolean;
      allowReprocess: boolean;
      featuresFile: string;
      datasetFile: string;
    };
    files: Array<{
      path: string;
      exists: boolean;
      size?: number;
      sha256?: string;
      readable?: boolean;
      error?: string;
    }>;
    data: {
      dataset: {
        loaded: boolean;
        rows?: number;
        hasId?: boolean;
        columns?: string[];
      };
      features: {
        loaded: boolean;
        entries?: number;
        requiredColumns?: string[];
        optionalColumns?: string[];
      };
      coverage?: {
        datasetIds: number;
        featuresIds: number;
        intersection: number;
        percentage: number;
      };
    };
    validation: {
      passed: boolean;
      errors: string[];
      warnings: string[];
    };
    checksum?: string;
  };
  timestamp: string;
  error?: string;
}

export interface ParityStatus {
  status: 'healthy' | 'critical';
  summary: string;
  strictMode: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: Record<string, {
    parity_ok: boolean;
    regular_sha256?: string;
    baseline_sha256?: string;
    error?: string;
    regular_result?: any;
    baseline_result?: any;
  }>;
  errors: string[];
  timestamp: string;
}

/**
 * Hook for fetching system integrity status
 * Checks data files, manifest validation, and system health
 */
export function useIntegrityStatus(options?: { 
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery<IntegrityStatus>({
    queryKey: ['/api/status/integrity'],
    refetchInterval: options?.refetchInterval || 30000, // Check every 30 seconds
    enabled: options?.enabled !== false,
    retry: 1, // Retry once on failure
    staleTime: 10000, // Consider stale after 10 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });
}

/**
 * Hook for fetching visual parity status
 * Compares server-side figures with baseline for consistency
 */
export function useParityStatus(options?: { 
  includeFilters?: boolean;
  refetchInterval?: number;
  enabled?: boolean;
}) {
  const includeFilters = options?.includeFilters !== false;
  
  return useQuery<ParityStatus>({
    queryKey: ['/api/status/visuals-parity', includeFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('include_filters', includeFilters.toString());
      
      const response = await fetch(`/api/status/visuals-parity?${params.toString()}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }
      
      return response.json();
    },
    refetchInterval: options?.refetchInterval || 60000, // Check every minute
    enabled: options?.enabled !== false,
    retry: 1,
    staleTime: 30000, // Consider stale after 30 seconds
    gcTime: 120000, // Keep in cache for 2 minutes
  });
}

/**
 * Combined hook that returns both integrity and parity status
 * with a consolidated health assessment
 */
export function useSystemStatus(options?: {
  checkInterval?: number;
  enabled?: boolean;
}) {
  const integrityQuery = useIntegrityStatus({
    refetchInterval: options?.checkInterval || 30000,
    enabled: options?.enabled !== false,
  });
  
  const parityQuery = useParityStatus({
    refetchInterval: options?.checkInterval || 60000,
    enabled: options?.enabled !== false,
  });

  // Determine overall system health
  const isHealthy = 
    integrityQuery.data?.status === 'healthy' && 
    parityQuery.data?.status === 'healthy';
  
  const isDegraded = 
    integrityQuery.data?.status === 'degraded' || 
    (integrityQuery.data?.status === 'healthy' && parityQuery.data?.status === 'critical');
  
  const isCritical = 
    integrityQuery.data?.status === 'critical';
  
  const overallStatus = isCritical ? 'critical' : isDegraded ? 'degraded' : 'healthy';
  
  // Collect all issues
  const issues: string[] = [];
  if (integrityQuery.data?.manifest?.validation?.errors) {
    issues.push(...integrityQuery.data.manifest.validation.errors);
  }
  if (parityQuery.data?.errors) {
    issues.push(...parityQuery.data.errors);
  }
  
  const isLoading = integrityQuery.isLoading || parityQuery.isLoading;
  const error = integrityQuery.error || parityQuery.error;

  return {
    integrity: integrityQuery,
    parity: parityQuery,
    overall: {
      status: overallStatus,
      isHealthy,
      isDegraded,
      isCritical,
      issues,
      summary: isCritical 
        ? 'System integrity critical - analytics blocked'
        : isDegraded 
          ? 'System health degraded - some features may be limited'
          : 'All systems healthy',
    },
    isLoading,
    error,
  };
}

/**
 * Hook that determines if analytics/visualization should be blocked
 * based on strict mode and system status
 */
export function useVisualizationAccess() {
  const systemStatus = useSystemStatus();
  
  const strictMode = systemStatus.integrity.data?.manifest?.environment?.strictFeatures ?? true;
  
  // Block if integrity is critical OR if parity checks fail in strict mode
  const integrityCritical = systemStatus.overall.isCritical;
  const parityFailed = strictMode && systemStatus.parity.data?.status === 'critical';
  const isBlocked = integrityCritical || parityFailed;
  
  // Limited if degraded integrity or parity issues in non-strict mode
  const isLimited = systemStatus.overall.isDegraded && !isBlocked;
  
  // Determine blocking reason
  let reason: string | null = null;
  if (integrityCritical) {
    reason = 'System integrity critical in strict mode';
  } else if (parityFailed) {
    reason = 'Visual parity check failed in strict mode - figures do not match baseline';
  }
  
  // Collect warnings including parity issues
  const warnings = [...systemStatus.overall.issues];
  if (systemStatus.parity.data?.errors?.length) {
    warnings.push(...systemStatus.parity.data.errors);
  }
  
  return {
    allowed: !isBlocked,
    blocked: isBlocked,
    limited: isLimited,
    strictMode,
    reason,
    warnings,
    systemStatus,
    // Additional parity-specific info
    parityInfo: {
      enabled: systemStatus.parity.data !== undefined,
      status: systemStatus.parity.data?.status || 'unknown',
      summary: systemStatus.parity.data?.summary || 'No parity data available',
      totalChecks: systemStatus.parity.data?.totalChecks || 0,
      failedChecks: systemStatus.parity.data?.failedChecks || 0,
    }
  };
}