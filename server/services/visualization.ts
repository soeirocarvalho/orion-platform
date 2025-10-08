import { storage } from "../storage";
import type { Cluster, ClusteringReport, DrivingForce } from "@shared/schema";
import { 
  getClusterColor, 
  getClusterColorWithAlpha, 
  calculateClusterCentroids, 
  generateForceJitter,
  STEEP_COLORS 
} from "@shared/constants";

export interface NetworkNode {
  id: string;
  label: string;
  size: number;
  color: string;
  quality: number;
  algorithm: string;
  centroid?: number[];
  // 3D positioning
  x?: number;
  y?: number;
  z?: number;
  // Additional metadata for enhanced visualization
  forceTypes?: string[]; // M, T, WS, WC distribution
  dominantSteep?: string;
  avgImpact?: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  similarity: number;
  type: "similarity" | "shared_forces";
}

export interface NetworkVisualizationData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  metrics: {
    totalClusters: number;
    averageClusterSize: number;
    averageQuality: number;
    algorithm: string;
    totalForces: number;
    isolatedClusters: number;
    curatedForcesOnly?: boolean;
    forceTypeDistribution?: { [key: string]: number };
  };
  // 3D layout metadata
  layoutBounds?: {
    xRange: [number, number];
    yRange: [number, number];
    zRange: [number, number];
  };
}

export interface ClusterHeatmapData {
  algorithm: string;
  clusters: Array<{
    id: string;
    label: string;
    size: number;
    silhouetteScore: number;
    cohesion: number;
    separation: number;
    forceDistribution: { [steep: string]: number };
  }>;
  overallMetrics: {
    averageSilhouette: number;
    daviesBouldinIndex: number;
    calinskiHarabaszIndex: number;
  };
}

export interface ClusterTreemapData {
  name: string;
  children: Array<{
    id: string;
    name: string;
    value: number;
    quality: number;
    algorithm: string;
    forces: Array<{
      id: string;
      title: string;
      impact: number;
      steep: string;
    }>;
  }>;
}

export interface ClusterQualityTimeline {
  reports: Array<{
    timestamp: string;
    algorithm: string;
    averageSilhouette: number;
    daviesBouldinIndex: number;
    calinskiHarabaszIndex: number;
    clustersCount: number;
    forcesProcessed: number;
  }>;
}

export interface ClusterRadarData {
  [clusterLabel: string]: {
    clusterId: string;
    clusterQuality?: number;
    avgImpact: number; // Keep for reference/filtering
    forces: Array<{
      id: string;
      title: string;
      impact: number;
      type: string;
      steep: string;
      sentiment?: string;
      thetaOffset?: number; // Position within cluster slice (in degrees)
    }>;
  };
}

// New interfaces for force-level network visualization
export interface ForceNetworkNode {
  id: string;
  label: string;
  title: string;
  size: number;
  color: string;
  // Positioning
  x: number;
  y: number;
  z: number;
  // Force metadata
  impact: number;
  type: string; // M, T, WS, WC, S
  steep: string; // Social/Technological/Economic/Environmental/Political
  sentiment?: string;
  source?: string;
  tags?: string[];
  // Cluster assignment
  clusterId?: string;
  clusterLabel?: string;
  clusterColor?: string;
  clusterQuality?: number;
  // Additional metadata
  isUnassigned?: boolean;
}

export interface ForceNetworkVisualizationData {
  nodes: ForceNetworkNode[];
  edges: NetworkEdge[]; // Reuse existing edge interface for force relationships
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
  metrics: {
    totalForces: number;
    totalClusters: number;
    assignedForces: number;
    unassignedForces: number;
    averageClusterSize: number;
    averageQuality: number;
    algorithm: string;
    curatedForcesOnly?: boolean;
    forceTypeDistribution?: { [key: string]: number };
  };
  layoutBounds: {
    xRange: [number, number];
    yRange: [number, number];
    zRange: [number, number];
  };
}

export class VisualizationService {
  /**
   * Generate cluster-based radar chart data instead of STEEP categories
   * @param projectId - The project ID to generate visualization for
   * @param curatedOnly - Whether to focus only on curated forces (M, T, WS, WC)
   * @param clusterMethod - Optional filter for specific clustering algorithm
   */
  async generateClusterRadarData(
    projectId: string, 
    curatedOnly: boolean = true, 
    clusterMethod?: string
  ): Promise<ClusterRadarData> {
    // Default to using the 37 meaningful clusters from orion
    const targetMethod = clusterMethod || 'orion';
    
    const [clusters, allForces] = await Promise.all([
      storage.getClusters(projectId, targetMethod),
      storage.getDrivingForces(projectId)
    ]);
    
    // Filter forces based on curatedOnly flag
    let forces = curatedOnly 
      ? allForces.forces.filter(force => ['M', 'T', 'WS', 'WC'].includes(force.type))
      : allForces.forces;
    
    // Limit to top 150 forces by impact for better visualization performance
    forces = forces
      .filter(force => force.impact !== null && force.impact !== undefined)
      .sort((a, b) => (b.impact || 0) - (a.impact || 0))
      .slice(0, 150);
    
    // Clusters are already filtered by method in the storage call
    const filteredClusters = clusters;
    
    // Initialize radar data structure
    const radarData: ClusterRadarData = {};
    
    // If no clusters exist, create fallback groups based on force types and STEEP
    if (filteredClusters.length === 0) {
      // Group by combination of type and STEEP for more meaningful fallback
      const typeGroups = forces.reduce((acc, force) => {
        if (!force.impact) return acc;
        
        const key = `${force.type} - ${force.steep}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(force);
        return acc;
      }, {} as { [key: string]: DrivingForce[] });
      
      // Convert groups to radar data format with individual forces and theta offsets
      Object.entries(typeGroups).forEach(([groupKey, groupForces]) => {
        if (groupForces.length === 0) return;
        
        const avgImpact = groupForces.reduce((sum, force) => 
          sum + (force.impact || 0), 0
        ) / groupForces.length;
        
        // Calculate theta offsets for forces within this fallback group
        const forcesWithOffsets = groupForces.map((force, index) => {
          // Distribute forces evenly within a segment (e.g., 15 degrees wide)
          const segmentWidth = 15; // degrees
          const thetaOffset = (index / Math.max(groupForces.length - 1, 1)) * segmentWidth - (segmentWidth / 2);
          
          return {
            id: force.id,
            title: force.title,
            impact: force.impact || 0,
            type: force.type,
            steep: force.steep,
            sentiment: force.sentiment || undefined,
            thetaOffset
          };
        });
        
        radarData[groupKey] = {
          clusterId: `fallback-${groupKey.replace(/\s+/g, '-').toLowerCase()}`,
          clusterQuality: undefined,
          avgImpact,
          forces: forcesWithOffsets
        };
      });
    } else {
      // Process each cluster with individual forces and theta offsets
      for (const cluster of filteredClusters) {
        if (!cluster.forceIds || cluster.forceIds.length === 0) continue;
        
        // Get forces assigned to this cluster
        const clusterForces = forces.filter(force => 
          cluster.forceIds?.includes(force.id) && force.impact !== null
        );
        
        if (clusterForces.length === 0) continue;
        
        // Calculate average impact for this cluster
        const avgImpact = clusterForces.reduce((sum, force) => 
          sum + (force.impact || 0), 0
        ) / clusterForces.length;
        
        // Sort forces by impact for better visual distribution
        const sortedForces = clusterForces.sort((a, b) => (b.impact || 0) - (a.impact || 0));
        
        // Calculate theta offsets for forces within this cluster slice
        const forcesWithOffsets = sortedForces.map((force, index) => {
          // Distribute forces within the cluster's angular segment
          // Each cluster gets equal angular space, with forces distributed within
          const segmentWidth = 360 / Math.max(filteredClusters.length, 1); // degrees per cluster
          const maxSpread = Math.min(segmentWidth * 0.8, 30); // Max 30 degrees spread within cluster
          
          let thetaOffset = 0;
          if (sortedForces.length > 1) {
            // Distribute evenly within the allowed spread, centered at 0
            thetaOffset = (index / (sortedForces.length - 1)) * maxSpread - (maxSpread / 2);
          }
          
          return {
            id: force.id,
            title: force.title,
            impact: force.impact || 0,
            type: force.type,
            steep: force.steep,
            sentiment: force.sentiment || undefined,
            thetaOffset
          };
        });
        
        radarData[cluster.label] = {
          clusterId: cluster.id,
          clusterQuality: cluster.silhouetteScore || undefined,
          avgImpact,
          forces: forcesWithOffsets
        };
      }
    }
    
    return radarData;
  }

  /**
   * Generate network visualization data for cluster relationships
   * @param projectId - The project ID to generate visualization for
   * @param curatedOnly - Whether to focus only on curated forces (M, T, WS, WC)
   * @param layout3D - Whether to generate 3D coordinates
   */
  async generateNetworkVisualization(
    projectId: string, 
    curatedOnly: boolean = true, 
    layout3D: boolean = true,
    clusterMethod?: string
  ): Promise<NetworkVisualizationData> {
    // Default to using the 37 meaningful clusters from orion
    const targetMethod = clusterMethod || 'orion';
    
    const [clusters, allForces] = await Promise.all([
      storage.getClusters(projectId, targetMethod),
      storage.getDrivingForces(projectId)
    ]);
    
    // Filter forces based on curatedOnly flag
    const forces = curatedOnly 
      ? allForces.forces.filter(force => ['M', 'T', 'WS', 'WC'].includes(force.type))
      : allForces.forces;
    
    // Calculate force type distribution
    const forceTypeDistribution = forces.reduce((acc, force) => {
      acc[force.type] = (acc[force.type] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
    
    if (clusters.length === 0) {
      return {
        nodes: [],
        edges: [],
        metrics: {
          totalClusters: 0,
          averageClusterSize: 0,
          averageQuality: 0,
          algorithm: "none",
          totalForces: forces.length,
          isolatedClusters: 0,
          curatedForcesOnly: curatedOnly,
          forceTypeDistribution
        }
      };
    }
    
    // Create enhanced nodes from clusters with 3D positioning and metadata
    const nodes: NetworkNode[] = await Promise.all(
      clusters.map(async cluster => {
        const clusterForces = forces.filter(f => cluster.forceIds?.includes(f.id));
        
        // Calculate cluster metadata
        const forceTypes = clusterForces.reduce((acc, force) => {
          acc[force.type] = (acc[force.type] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number });
        
        const dominantSteep = this.getDominantSteep(clusterForces);
        const avgImpact = clusterForces.reduce((sum, f) => sum + (f.impact || 0), 0) / Math.max(clusterForces.length, 1);
        
        const node: NetworkNode = {
          id: cluster.id,
          label: cluster.label,
          size: cluster.size || clusterForces.length,
          quality: cluster.silhouetteScore || 0,
          algorithm: cluster.method,
          color: this.getClusterColor(cluster.silhouetteScore || 0, cluster.method),
          centroid: cluster.centroid || undefined,
          forceTypes: Object.keys(forceTypes),
          dominantSteep,
          avgImpact
        };
        
        return node;
      })
    );
    
    // Generate 3D layout if requested
    if (layout3D) {
      this.generate3DLayout(nodes);
    }
    
    // Create edges based on cluster similarities and shared forces
    const edges: NetworkEdge[] = [];
    
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const cluster1 = clusters[i];
        const cluster2 = clusters[j];
        
        // Calculate shared forces
        const sharedForces = this.calculateSharedForces(cluster1, cluster2);
        
        // Calculate centroid similarity if available
        let similarity = 0;
        if (cluster1.centroid && cluster2.centroid) {
          similarity = this.calculateCosineSimilarity(cluster1.centroid, cluster2.centroid);
        }
        
        // Create edge if there's sufficient connection
        if (sharedForces > 0 || similarity > 0.3) {
          edges.push({
            source: cluster1.id,
            target: cluster2.id,
            weight: sharedForces + (similarity * 10), // Weight combines shared forces and similarity
            similarity,
            type: sharedForces > 0 ? "shared_forces" : "similarity"
          });
        }
      }
    }
    
    // Calculate metrics
    const totalClusters = clusters.length;
    const averageClusterSize = clusters.reduce((sum, c) => sum + (c.size || 0), 0) / totalClusters;
    const averageQuality = clusters.reduce((sum, c) => sum + (c.silhouetteScore || 0), 0) / totalClusters;
    const isolatedClusters = nodes.filter(node => 
      !edges.some(edge => edge.source === node.id || edge.target === node.id)
    ).length;
    
    // Calculate layout bounds for 3D visualization
    const layoutBounds = layout3D ? this.calculateLayoutBounds(nodes) : undefined;
    
    return {
      nodes,
      edges,
      metrics: {
        totalClusters,
        averageClusterSize,
        averageQuality,
        algorithm: clusters[0]?.method || "unknown",
        totalForces: forces.length,
        isolatedClusters,
        curatedForcesOnly: curatedOnly,
        forceTypeDistribution
      },
      layoutBounds
    };
  }

  /**
   * Generate force-level network visualization with cluster-based positioning
   * Individual forces appear as nodes positioned within their cluster regions
   * @param projectId - The project ID to generate visualization for
   * @param curatedOnly - Whether to focus only on curated forces (M, T, WS, WC)
   * @param layout3D - Whether to generate 3D coordinates (default: true)
   */
  async generateForceNetworkVisualization(
    projectId: string,
    curatedOnly: boolean = false,
    layout3D: boolean = true,
    clusterMethod?: string
  ): Promise<ForceNetworkVisualizationData> {
    // Default to using the 37 meaningful clusters from orion
    const targetMethod = clusterMethod || 'orion';
    
    const [clusters, allForces] = await Promise.all([
      storage.getClusters(projectId, targetMethod),
      storage.getDrivingForces(projectId, undefined, undefined, { 
        limit: Number.MAX_SAFE_INTEGER, 
        offset: 0, 
        includeEmbeddings: false, 
        includeSignals: false 
      })
    ]);

    // Filter forces based on curatedOnly flag
    const forces = curatedOnly 
      ? allForces.forces.filter(force => ['M', 'T', 'WS', 'WC'].includes(force.type))
      : allForces.forces;

    // Calculate force type distribution
    const forceTypeDistribution = forces.reduce((acc, force) => {
      acc[force.type] = (acc[force.type] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Build forceId->clusterId map for O(F+C) performance instead of O(F*C)
    const forceToClusterMap = new Map<string, string>();
    clusters.forEach(cluster => {
      if (cluster.forceIds) {
        cluster.forceIds.forEach(forceId => {
          forceToClusterMap.set(forceId, cluster.id);
        });
      }
    });

    // Group forces by cluster assignment using the optimized map
    const clusterForceGroups: { [clusterId: string]: DrivingForce[] } = {};
    const unassignedForces: DrivingForce[] = [];

    forces.forEach(force => {
      const assignedClusterId = forceToClusterMap.get(force.id);
      
      if (assignedClusterId) {
        if (!clusterForceGroups[assignedClusterId]) {
          clusterForceGroups[assignedClusterId] = [];
        }
        clusterForceGroups[assignedClusterId].push(force);
      } else {
        unassignedForces.push(force);
      }
    });

    // Create cluster list including only clusters that have assigned forces
    const activeClusters = clusters.filter(cluster => 
      clusterForceGroups[cluster.id] && clusterForceGroups[cluster.id].length > 0
    );

    // Calculate cluster centroids deterministically
    const clusterIds = activeClusters.map(c => c.id);
    const clusterCentroids = calculateClusterCentroids(clusterIds, layout3D, 400);

    // Create cluster information for response
    const clusterInfo = activeClusters.map((cluster, index) => ({
      id: cluster.id,
      label: cluster.label,
      centerX: clusterCentroids[index]?.x || 0,
      centerY: clusterCentroids[index]?.y || 0,
      centerZ: clusterCentroids[index]?.z || 0,
      color: getClusterColor(cluster.id),
      size: clusterForceGroups[cluster.id]?.length || 0,
      quality: cluster.silhouetteScore || undefined,
      forceCount: clusterForceGroups[cluster.id]?.length || 0
    }));

    // Generate force nodes with cluster-based positioning
    const nodes: ForceNetworkNode[] = [];

    // Process clustered forces
    activeClusters.forEach((cluster, clusterIndex) => {
      const clusterForces = clusterForceGroups[cluster.id] || [];
      const centroid = clusterCentroids[clusterIndex];
      const clusterColor = getClusterColor(cluster.id);

      clusterForces.forEach(force => {
        // Generate jittered position within cluster region
        const jitter = generateForceJitter(force.id, force.impact || 5, 60);

        const node: ForceNetworkNode = {
          id: force.id,
          label: force.title,
          title: force.title,
          size: Math.max(8, Math.min(24, (force.impact || 5) * 2)), // Size based on impact
          color: clusterColor,
          // Position = cluster centroid + jitter
          x: centroid.x + jitter.x,
          y: centroid.y + jitter.y,
          z: centroid.z + jitter.z,
          // Force metadata
          impact: force.impact || 0,
          type: force.type,
          steep: force.steep || "Other",
          sentiment: force.sentiment || undefined,
          source: force.source || undefined,
          tags: force.tags || undefined,
          // Cluster assignment
          clusterId: cluster.id,
          clusterLabel: cluster.label,
          clusterColor: clusterColor,
          clusterQuality: cluster.silhouetteScore || undefined,
          isUnassigned: false
        };

        nodes.push(node);
      });
    });

    // Process unassigned forces - position them using STEEP-based fallback clusters
    if (unassignedForces.length > 0) {
      // Group unassigned forces by STEEP category
      const steepGroups = unassignedForces.reduce((acc, force) => {
        const steep = force.steep || "Other";
        if (!acc[steep]) acc[steep] = [];
        acc[steep].push(force);
        return acc;
      }, {} as { [steep: string]: DrivingForce[] });

      // Create centroids for STEEP groups positioned outside main cluster area
      const steepCategories = Object.keys(steepGroups);
      const steepCentroids = calculateClusterCentroids(
        steepCategories.map(s => `steep-${s}`), 
        layout3D, 
        600 // Larger radius for unassigned forces
      );

      // Add unassigned force nodes
      steepCategories.forEach((steep, steepIndex) => {
        const steepForces = steepGroups[steep];
        const centroid = steepCentroids[steepIndex];
        const steepColor = STEEP_COLORS[steep as keyof typeof STEEP_COLORS] || STEEP_COLORS.Other;

        steepForces.forEach(force => {
          const jitter = generateForceJitter(force.id, force.impact || 5, 80);

          const node: ForceNetworkNode = {
            id: force.id,
            label: force.title,
            title: force.title,
            size: Math.max(6, Math.min(20, (force.impact || 5) * 1.5)), // Slightly smaller for unassigned
            color: steepColor,
            x: centroid.x + jitter.x,
            y: centroid.y + jitter.y,
            z: centroid.z + jitter.z,
            impact: force.impact || 0,
            type: force.type,
            steep: force.steep || "Other",
            sentiment: force.sentiment || undefined,
            source: force.source || undefined,
            tags: force.tags || undefined,
            clusterId: undefined,
            clusterLabel: `Unassigned (${steep})`,
            clusterColor: steepColor,
            clusterQuality: undefined,
            isUnassigned: true
          };

          nodes.push(node);
        });

        // Add fallback cluster info for unassigned groups
        clusterInfo.push({
          id: `steep-${steep}`,
          label: `Unassigned (${steep})`,
          centerX: centroid.x,
          centerY: centroid.y,
          centerZ: centroid.z,
          color: steepColor,
          size: steepForces.length,
          quality: undefined,
          forceCount: steepForces.length
        });
      });
    }

    // Generate edges based on force similarities and relationships
    const edges: NetworkEdge[] = [];
    
    // For now, create edges between forces in the same cluster
    activeClusters.forEach(cluster => {
      const clusterForces = clusterForceGroups[cluster.id] || [];
      
      if (clusterForces.length > 1) {
        // Create edges between highly related forces in the same cluster
        for (let i = 0; i < clusterForces.length; i++) {
          for (let j = i + 1; j < clusterForces.length; j++) {
            const force1 = clusterForces[i];
            const force2 = clusterForces[j];
            
            // Calculate similarity based on shared characteristics
            let similarity = 0;
            
            // Same type bonus
            if (force1.type === force2.type) similarity += 0.3;
            
            // Same STEEP category bonus
            if (force1.steep === force2.steep) similarity += 0.2;
            
            // Impact similarity bonus
            const impactDiff = Math.abs((force1.impact || 0) - (force2.impact || 0));
            similarity += Math.max(0, (10 - impactDiff) / 20); // 0 to 0.5 based on impact similarity
            
            // Create edge if similarity is high enough
            if (similarity > 0.4) {
              edges.push({
                source: force1.id,
                target: force2.id,
                weight: similarity * 5,
                similarity,
                type: "similarity"
              });
            }
          }
        }
      }
    });

    // Calculate layout bounds
    const xValues = nodes.map(n => n.x);
    const yValues = nodes.map(n => n.y);
    const zValues = nodes.map(n => n.z);
    
    const padding = 100;
    const layoutBounds = {
      xRange: [Math.min(...xValues, 0) - padding, Math.max(...xValues, 0) + padding] as [number, number],
      yRange: [Math.min(...yValues, 0) - padding, Math.max(...yValues, 0) + padding] as [number, number],
      zRange: [Math.min(...zValues, 0) - padding, Math.max(...zValues, 0) + padding] as [number, number]
    };

    // Calculate metrics - only count real ORION clusters for KPIs
    const totalClusters = activeClusters.length; // Only count real semantic clusters
    const assignedForces = forces.length - unassignedForces.length;
    const averageClusterSize = activeClusters.length > 0 
      ? activeClusters.reduce((sum, c) => sum + (clusterForceGroups[c.id]?.length || 0), 0) / activeClusters.length
      : 0;
    const averageQuality = activeClusters.length > 0
      ? activeClusters.reduce((sum, c) => sum + (c.silhouetteScore || 0), 0) / activeClusters.length
      : 0;

    return {
      nodes,
      edges,
      clusters: clusterInfo,
      metrics: {
        totalForces: forces.length,
        totalClusters,
        assignedForces,
        unassignedForces: unassignedForces.length,
        averageClusterSize,
        averageQuality,
        algorithm: activeClusters[0]?.method || "none",
        curatedForcesOnly: curatedOnly,
        forceTypeDistribution
      },
      layoutBounds
    };
  }
  
  /**
   * Generate heatmap data showing cluster quality metrics
   */
  async generateClusterHeatmap(projectId: string, clusterMethod?: string): Promise<ClusterHeatmapData | null> {
    // Default to using the 37 meaningful clusters from orion
    const targetMethod = clusterMethod || 'orion';
    
    const [clusters, forces, reports] = await Promise.all([
      storage.getClusters(projectId, targetMethod),
      storage.getDrivingForces(projectId),
      storage.getClusteringReports(projectId)
    ]);
    
    if (clusters.length === 0 || reports.length === 0) return null;
    
    const latestReport = reports[0]; // Most recent report
    
    // Build force distribution for each cluster
    const clustersWithDistribution = await Promise.all(
      clusters.map(async cluster => {
        const clusterForces = forces.forces.filter(f => cluster.forceIds?.includes(f.id));
        const forceDistribution: { [steep: string]: number } = {};
        
        clusterForces.forEach(force => {
          const steep = force.steep || "Other";
          forceDistribution[steep] = (forceDistribution[steep] || 0) + 1;
        });
        
        return {
          id: cluster.id,
          label: cluster.label,
          size: cluster.size || 0,
          silhouetteScore: cluster.silhouetteScore || 0,
          cohesion: cluster.cohesion || 0,
          separation: cluster.separation || 0,
          forceDistribution
        };
      })
    );
    
    return {
      algorithm: latestReport.algorithm,
      clusters: clustersWithDistribution,
      overallMetrics: {
        averageSilhouette: latestReport.averageSilhouette || 0,
        daviesBouldinIndex: latestReport.daviesBouldinIndex || 0,
        calinskiHarabaszIndex: latestReport.calinskiHarabaszIndex || 0
      }
    };
  }
  
  /**
   * Generate treemap data for hierarchical cluster visualization
   */
  async generateClusterTreemap(projectId: string, clusterMethod?: string): Promise<ClusterTreemapData | null> {
    // Default to using the 37 meaningful clusters from orion
    const targetMethod = clusterMethod || 'orion';
    
    const [clusters, forces] = await Promise.all([
      storage.getClusters(projectId, targetMethod),
      storage.getDrivingForces(projectId)
    ]);
    
    if (clusters.length === 0) return null;
    
    const children = await Promise.all(
      clusters.map(async cluster => {
        const clusterForces = forces.forces.filter(f => cluster.forceIds?.includes(f.id));
        
        return {
          id: cluster.id,
          name: cluster.label,
          value: cluster.size || clusterForces.length,
          quality: cluster.silhouetteScore || 0,
          algorithm: cluster.method,
          forces: clusterForces.map(force => ({
            id: force.id,
            title: force.title,
            impact: force.impact || 0,
            steep: force.steep || "Other"
          }))
        };
      })
    );
    
    return {
      name: "Clusters",
      children
    };
  }
  
  /**
   * Generate timeline of clustering quality over time
   */
  async generateQualityTimeline(projectId: string): Promise<ClusterQualityTimeline> {
    const reports = await storage.getClusteringReports(projectId);
    
    const timeline = reports
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(report => ({
        timestamp: report.createdAt.toISOString(),
        algorithm: report.algorithm,
        averageSilhouette: report.averageSilhouette || 0,
        daviesBouldinIndex: report.daviesBouldinIndex || 0,
        calinskiHarabaszIndex: report.calinskiHarabaszIndex || 0,
        clustersCount: report.clustersCount || 0,
        forcesProcessed: report.forcesProcessed || 0
      }));
    
    return { reports: timeline };
  }
  
  /**
   * Generate force-to-cluster assignment matrix
   */
  async generateAssignmentMatrix(projectId: string): Promise<{
    forces: Array<{ id: string; title: string; steep: string; clusterId: string; clusterLabel: string }>;
    clusters: Array<{ id: string; label: string; algorithm: string; quality: number }>;
  }> {
    const [clusters, forces] = await Promise.all([
      storage.getClusters(projectId),
      storage.getDrivingForces(projectId)
    ]);
    
    // Create force-cluster assignments
    const forceAssignments = forces.forces.map(force => {
      const assignedCluster = clusters.find(cluster => 
        cluster.forceIds?.includes(force.id)
      );
      
      return {
        id: force.id,
        title: force.title,
        steep: force.steep || "Other",
        clusterId: assignedCluster?.id || "unassigned",
        clusterLabel: assignedCluster?.label || "Unassigned"
      };
    });
    
    const clusterSummary = clusters.map(cluster => ({
      id: cluster.id,
      label: cluster.label,
      algorithm: cluster.method,
      quality: cluster.silhouetteScore || 0
    }));
    
    return {
      forces: forceAssignments,
      clusters: clusterSummary
    };
  }
  
  /**
   * Generate comprehensive clustering analytics dashboard data
   */
  async generateDashboardData(projectId: string): Promise<{
    network: NetworkVisualizationData;
    heatmap: ClusterHeatmapData | null;
    treemap: ClusterTreemapData | null;
    timeline: ClusterQualityTimeline;
    matrix: any;
    summary: {
      totalForces: number;
      totalClusters: number;
      algorithmsUsed: string[];
      latestQuality: number;
      recommendations: string[];
    };
  }> {
    const [network, heatmap, treemap, timeline, matrix, forces, reports] = await Promise.all([
      this.generateNetworkVisualization(projectId),
      this.generateClusterHeatmap(projectId),
      this.generateClusterTreemap(projectId),
      this.generateQualityTimeline(projectId),
      this.generateAssignmentMatrix(projectId),
      storage.getDrivingForces(projectId),
      storage.getClusteringReports(projectId)
    ]);
    
    // Generate summary and recommendations
    const algorithmsUsed = Array.from(new Set(reports.map(r => r.algorithm)));
    const latestQuality = reports.length > 0 ? reports[0].averageSilhouette || 0 : 0;
    const recommendations = this.generateRecommendations(network, reports);
    
    return {
      network,
      heatmap,
      treemap,
      timeline,
      matrix,
      summary: {
        totalForces: forces.forces.length,
        totalClusters: network.metrics.totalClusters,
        algorithmsUsed,
        latestQuality,
        recommendations
      }
    };
  }
  
  // Helper methods
  private calculateSharedForces(cluster1: Cluster, cluster2: Cluster): number {
    if (!cluster1.forceIds || !cluster2.forceIds) return 0;
    
    return cluster1.forceIds.filter(id => cluster2.forceIds?.includes(id)).length;
  }
  
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
  
  private getClusterColor(quality: number, algorithm: string): string {
    // Color coding based on quality score and algorithm
    const baseColors = {
      kmeans: "#3B82F6", // Blue
      hdbscan: "#10B981", // Green  
      semantic: "#8B5CF6", // Purple
      hierarchical: "#F59E0B", // Yellow
      steep: "#EF4444" // Red (fallback)
    };
    
    const baseColor = baseColors[algorithm as keyof typeof baseColors] || baseColors.steep;
    
    // Adjust opacity/saturation based on quality
    const alpha = Math.max(0.3, Math.min(1, quality + 0.5)); // Quality range -1 to 1, alpha 0.3 to 1
    
    // Convert hex to rgba
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  private generateRecommendations(
    network: NetworkVisualizationData, 
    reports: ClusteringReport[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (network.metrics.averageQuality < 0.3) {
      recommendations.push("Consider trying a different clustering algorithm or adjusting parameters for better quality");
    }
    
    if (network.metrics.isolatedClusters > network.metrics.totalClusters * 0.5) {
      recommendations.push("Many isolated clusters detected - consider reducing the number of clusters or using semantic clustering");
    }
    
    if (network.metrics.averageClusterSize < 3) {
      recommendations.push("Clusters are very small - consider increasing minimum cluster size parameter");
    }
    
    if (network.metrics.averageClusterSize > 20) {
      recommendations.push("Clusters are very large - consider increasing the number of clusters for more granular grouping");
    }
    
    if (reports.length > 1) {
      const latestReport = reports[0];
      const previousReport = reports[1];
      
      if (latestReport.averageSilhouette && previousReport.averageSilhouette && 
          latestReport.averageSilhouette < previousReport.averageSilhouette) {
        recommendations.push("Clustering quality has decreased - previous parameters may have been better");
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push("Clustering quality looks good! Consider running different algorithms to compare results");
    }
    
    return recommendations;
  }
  
  /**
   * Generate 3D layout coordinates for network nodes
   */
  private generate3DLayout(nodes: NetworkNode[]): void {
    const nodeCount = nodes.length;
    if (nodeCount === 0) return;
    
    // Use different 3D layout strategies based on node count and characteristics
    if (nodeCount <= 10) {
      this.generateSphericalLayout(nodes);
    } else if (nodeCount <= 50) {
      this.generateForceDirected3DLayout(nodes);
    } else {
      this.generateClusteredSphericalLayout(nodes);
    }
  }
  
  /**
   * Generate spherical layout for small number of clusters
   */
  private generateSphericalLayout(nodes: NetworkNode[]): void {
    const radius = 200;
    
    if (nodes.length === 0) return;
    
    if (nodes.length === 1) {
      // Single node at origin
      nodes[0].x = 0;
      nodes[0].y = 0;
      nodes[0].z = 0;
      return;
    }
    
    if (nodes.length === 2) {
      // Two nodes on opposite sides of Z axis
      nodes[0].x = 0;
      nodes[0].y = 0;
      nodes[0].z = radius;
      nodes[1].x = 0;
      nodes[1].y = 0;
      nodes[1].z = -radius;
      return;
    }
    
    // Multiple nodes using Fibonacci spiral
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // Golden angle in radians
    
    nodes.forEach((node, i) => {
      const y = 1 - (i / (nodes.length - 1)) * 2; // y goes from 1 to -1
      const radiusAtY = Math.sqrt(1 - y * y);
      
      const theta = goldenAngle * i;
      
      node.x = Math.cos(theta) * radiusAtY * radius;
      node.z = Math.sin(theta) * radiusAtY * radius;
      node.y = y * radius;
    });
  }
  
  /**
   * Generate force-directed 3D layout with proper clustering
   */
  private generateForceDirected3DLayout(nodes: NetworkNode[]): void {
    const baseRadius = 150;
    
    // Group nodes by algorithm/method for better spatial organization
    const algorithmGroups = nodes.reduce((groups, node) => {
      if (!groups[node.algorithm]) groups[node.algorithm] = [];
      groups[node.algorithm].push(node);
      return groups;
    }, {} as { [key: string]: NetworkNode[] });
    
    const algorithms = Object.keys(algorithmGroups);
    const angleStep = (2 * Math.PI) / algorithms.length;
    
    algorithms.forEach((algorithm, groupIndex) => {
      const groupNodes = algorithmGroups[algorithm];
      const groupAngle = angleStep * groupIndex;
      const groupRadius = baseRadius + (groupNodes.length * 20);
      
      groupNodes.forEach((node, nodeIndex) => {
        const nodeAngle = (2 * Math.PI * nodeIndex) / groupNodes.length;
        const heightVariation = (node.quality || 0) * 100; // Quality affects height
        
        node.x = Math.cos(groupAngle + nodeAngle * 0.3) * groupRadius;
        node.z = Math.sin(groupAngle + nodeAngle * 0.3) * groupRadius;
        node.y = heightVariation + (nodeIndex * 30) - (groupNodes.length * 15);
      });
    });
  }
  
  /**
   * Generate clustered spherical layout for large datasets
   */
  private generateClusteredSphericalLayout(nodes: NetworkNode[]): void {
    const mainRadius = 300;
    const clusterRadius = 80;
    
    // Create clusters based on STEEP categories and quality
    const steepClusters = nodes.reduce((clusters, node) => {
      const key = node.dominantSteep || 'Other';
      if (!clusters[key]) clusters[key] = [];
      clusters[key].push(node);
      return clusters;
    }, {} as { [key: string]: NetworkNode[] });
    
    const steepCategories = Object.keys(steepClusters);
    const angleStep = (2 * Math.PI) / steepCategories.length;
    
    steepCategories.forEach((steep, clusterIndex) => {
      const clusterNodes = steepClusters[steep];
      const clusterAngle = angleStep * clusterIndex;
      
      // Position cluster center
      const clusterCenterX = Math.cos(clusterAngle) * mainRadius;
      const clusterCenterZ = Math.sin(clusterAngle) * mainRadius;
      const clusterCenterY = 0;
      
      // Position nodes within cluster
      clusterNodes.forEach((node, nodeIndex) => {
        const nodeAngle = (2 * Math.PI * nodeIndex) / clusterNodes.length;
        const nodeRadius = clusterRadius * (0.3 + Math.random() * 0.7); // Add some randomness
        
        node.x = clusterCenterX + Math.cos(nodeAngle) * nodeRadius;
        node.z = clusterCenterZ + Math.sin(nodeAngle) * nodeRadius;
        node.y = clusterCenterY + ((node.quality || 0) * 150) + (Math.random() - 0.5) * 50;
      });
    });
  }
  
  /**
   * Calculate layout bounds for camera and interaction setup
   */
  private calculateLayoutBounds(nodes: NetworkNode[]): {
    xRange: [number, number];
    yRange: [number, number];
    zRange: [number, number];
  } {
    if (nodes.length === 0) {
      return {
        xRange: [-100, 100],
        yRange: [-100, 100],
        zRange: [-100, 100]
      };
    }
    
    const xValues = nodes.map(n => n.x || 0);
    const yValues = nodes.map(n => n.y || 0);
    const zValues = nodes.map(n => n.z || 0);
    
    const padding = 50;
    
    return {
      xRange: [Math.min(...xValues) - padding, Math.max(...xValues) + padding],
      yRange: [Math.min(...yValues) - padding, Math.max(...yValues) + padding],
      zRange: [Math.min(...zValues) - padding, Math.max(...zValues) + padding]
    };
  }
  
  /**
   * Get dominant STEEP category for a cluster
   */
  private getDominantSteep(forces: DrivingForce[]): string {
    if (forces.length === 0) return 'Other';
    
    const steepCounts = forces.reduce((acc, force) => {
      const steep = force.steep || 'Other';
      acc[steep] = (acc[steep] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
    
    return Object.entries(steepCounts)
      .sort(([,a], [,b]) => b - a)[0][0];
  }
}

export const visualizationService = new VisualizationService();