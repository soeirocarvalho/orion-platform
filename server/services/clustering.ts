import { storage } from "../storage";
import { orionClusteringService } from "./orion-clustering";
import type { DrivingForce } from "@shared/schema";

export interface ClusteringParams {
  algorithm: "orion";
  numClusters?: number; // Fixed at 37 for ORION but kept for compatibility
  maxIterations?: number;
}

export interface ClusterResult {
  id: string;
  label: string;
  forceIds: string[];
  centroid?: number[];
  size: number;
  quality: {
    silhouetteScore: number;
    cohesion: number;
    separation: number;
    inertia?: number;
  };
  algorithm: string;
  params: ClusteringParams;
}

export interface ClusteringReport {
  clusters: ClusterResult[];
  overallQuality: {
    averageSilhouette: number;
    daviesBouldinIndex: number;
    calinskiHarabaszIndex: number;
    totalInertia: number;
  };
  algorithm: string;
  params: ClusteringParams;
  executionTime: number;
  recommendedClusters?: number;
}

export class ClusteringService {
  /**
   * Main clustering method that only supports ORION clustering
   */
  async clusterForces(
    forces: DrivingForce[],
    params: ClusteringParams,
    jobId?: string
  ): Promise<ClusteringReport> {
    const startTime = Date.now();
    
    // Validate input data type before processing
    if (!forces || !Array.isArray(forces)) {
      console.error("Invalid forces parameter - expected array but got:", typeof forces);
      throw new Error(`Invalid forces parameter: expected array but got ${typeof forces}`);
    }
    
    console.log(`Starting ORION clustering for ${forces.length} forces`);
    
    if (forces.length < 2) {
      console.warn(`Not enough forces for ORION clustering (${forces.length}), falling back to STEEP grouping`);
      return this.fallbackSTEEPClustering(forces, params, startTime);
    }
    
    if (jobId) {
      await storage.updateJob(jobId, { 
        status: "running", 
        progress: 40,
        metaJson: { ...((await storage.getJob(jobId))?.metaJson || {}), stage: "orion_clustering" }
      });
    }
    
    // Run ORION clustering
    const orionResult = await orionClusteringService.performOrionClustering(forces, params);
    
    if (jobId) {
      await storage.updateJob(jobId, { progress: 80 });
    }
    
    const executionTime = Date.now() - startTime;
    console.log(`ORION clustering completed in ${executionTime}ms with ${orionResult.clusters.length} clusters`);
    
    if (jobId) {
      await storage.updateJob(jobId, { progress: 85 });
    }
    
    return {
      clusters: orionResult.clusters,
      overallQuality: orionResult.overallQuality,
      algorithm: "orion",
      params,
      executionTime,
      recommendedClusters: 37 // ORION always uses 37 clusters
    };
  }
  
  /**
   * Fallback clustering when there are too few forces for ORION
   * Groups forces by STEEP categories instead
   */
  private async fallbackSTEEPClustering(
    forces: DrivingForce[],
    params: ClusteringParams,
    startTime: number
  ): Promise<ClusteringReport> {
    console.log(`Using STEEP fallback clustering for ${forces.length} forces`);
    
    // Group forces by STEEP categories
    const steepGroups = new Map<string, DrivingForce[]>();
    forces.forEach(force => {
      const steep = force.steep || "Unknown";
      if (!steepGroups.has(steep)) {
        steepGroups.set(steep, []);
      }
      steepGroups.get(steep)!.push(force);
    });
    
    // Create clusters from STEEP groups
    const clusters: ClusterResult[] = [];
    let clusterIndex = 0;
    
    for (const [steep, groupForces] of Array.from(steepGroups.entries())) {
      clusters.push({
        id: `cluster_steep_${Date.now()}_${clusterIndex}`,
        label: `${steep} Forces`,
        forceIds: groupForces.map((f: DrivingForce) => f.id),
        size: groupForces.length,
        quality: {
          silhouetteScore: 0.5, // Default fallback score
          cohesion: 1.0,
          separation: 1.0,
          inertia: 0
        },
        algorithm: "orion",
        params
      });
      clusterIndex++;
    }
    
    const executionTime = Date.now() - startTime;
    
    // Calculate basic overall quality metrics
    const overallQuality = {
      averageSilhouette: 0.5,
      daviesBouldinIndex: 1.0,
      calinskiHarabaszIndex: 1.0,
      totalInertia: 0
    };
    
    console.log(`STEEP fallback clustering completed with ${clusters.length} clusters`);
    
    return {
      clusters,
      overallQuality,
      algorithm: "orion",
      params,
      executionTime,
      recommendedClusters: clusters.length
    };
  }
}

export const clusteringService = new ClusteringService();