import { storage } from "../storage";
import { clusteringService, type ClusteringParams } from "./clustering";

export class PreprocessingService {
  // Optimized paginated force loading for ORION clustering
  private async loadAllForcesForClustering(
    projectId: string, 
    jobId: string
  ): Promise<Array<{
    id: string;
    title: string;
    text: string;
    embeddingVector?: number[] | null;
  }>> {
    const startTime = Date.now();
    const TIMEOUT_MS = 25000; // 25 second timeout
    const PAGE_SIZE = 750; // Load 750 forces per page to balance memory and performance
    
    console.log(`Starting force loading for ORION clustering in project ${projectId}`);
    
    try {
      // Get paginated retrieval setup
      const { totalCount, getPage } = await storage.getDrivingForcesForClustering(projectId, {
        pageSize: PAGE_SIZE,
        includeSignals: false
      });
      
      console.log(`Total forces to load: ${totalCount} (${Math.ceil(totalCount / PAGE_SIZE)} pages)`);
      
      if (totalCount === 0) {
        return [];
      }
      
      const allForces: Array<{
        id: string;
        title: string;
        text: string;
        embeddingVector?: number[];
      }> = [];
      
      const totalPages = Math.ceil(totalCount / PAGE_SIZE);
      const baseProgress = 10;
      const maxProgress = 25;
      const progressRange = maxProgress - baseProgress;
      
      // Load pages with progress updates and event loop management
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        // Check timeout
        if (Date.now() - startTime > TIMEOUT_MS) {
          throw new Error(`Force loading timeout: exceeded ${TIMEOUT_MS}ms while loading page ${pageIndex + 1}/${totalPages}`);
        }
        
        // Load current page
        const pageStartTime = Date.now();
        const pageForces = await getPage(pageIndex);
        const pageLoadTime = Date.now() - pageStartTime;
        
        console.log(`Loaded page ${pageIndex + 1}/${totalPages}: ${pageForces.length} forces (${pageLoadTime}ms)`);
        
        allForces.push(...pageForces.map(f => ({
          ...f,
          embeddingVector: f.embeddingVector || undefined // Convert null to undefined for type compatibility
        })));
        
        // Update progress incrementally
        const pageProgress = baseProgress + Math.round((progressRange * (pageIndex + 1)) / totalPages);
        await storage.updateJob(jobId, { progress: pageProgress });
        
        // Event loop management: yield control between pages
        if (pageIndex < totalPages - 1) { // Don't delay after the last page
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      const totalTime = Date.now() - startTime;
      const finalCount = allForces.length;
      
      console.log(`✅ Force loading completed: ${finalCount}/${totalCount} forces loaded in ${totalTime}ms`);
      console.log(`Load rate: ${Math.round(finalCount / (totalTime / 1000))} forces/second`);
      
      return allForces;
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ Force loading failed after ${totalTime}ms:`, error);
      throw new Error(`Failed to load forces for clustering: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processProject(jobId: string, projectId: string, params: any) {
    try {
      await storage.updateJob(jobId, { status: "running", progress: 10 });

      // Get forces using optimized paginated retrieval
      const forces = await this.loadAllForcesForClustering(projectId, jobId);
      
      if (forces.length === 0) {
        await storage.updateJob(jobId, { 
          status: "failed", 
          error: "No driving forces found for project",
          finishedAt: new Date()
        });
        return;
      }

      await storage.updateJob(jobId, { progress: 30 });

      console.log(`Processing ${forces.length} total forces for ORION clustering`);
      
      // Get full force objects for ORION clustering (ORION doesn't need embeddings, just full text)
      const fullForcesForClustering = await Promise.all(
        forces.map(async (f) => {
          const fullForce = await storage.getDrivingForce(f.id);
          if (!fullForce) throw new Error(`Force ${f.id} not found`);
          return fullForce;
        })
      );
      
      console.log(`Ready for ORION clustering with ${fullForcesForClustering.length} full force objects`);

      await storage.updateJob(jobId, { progress: 50 });

      // Clear existing clusters for this project
      await storage.deleteClustersByProject(projectId);

      // Configure ORION clustering parameters (exactly 37 semantic clusters)
      const clusteringParams: ClusteringParams = {
        algorithm: "orion",
        numClusters: 37, // Exactly 37 clusters as per old ORION method
        maxIterations: params.maxIterations || 100
      };
      
      console.log(`Configuring ORION clustering with exactly 37 semantic clusters`);

      // Perform ORION clustering
      const clusteringReport = await clusteringService.clusterForces(
        fullForcesForClustering, 
        clusteringParams, 
        jobId
      );
      
      await storage.updateJob(jobId, { progress: 90 });

      // Store clustering report
      const storedReport = await storage.createClusteringReport({
        projectId,
        algorithm: clusteringReport.algorithm,
        params: clusteringReport.params,
        executionTime: clusteringReport.executionTime,
        recommendedClusters: clusteringReport.recommendedClusters,
        averageSilhouette: clusteringReport.overallQuality.averageSilhouette,
        daviesBouldinIndex: clusteringReport.overallQuality.daviesBouldinIndex,
        calinskiHarabaszIndex: clusteringReport.overallQuality.calinskiHarabaszIndex,
        totalInertia: clusteringReport.overallQuality.totalInertia,
        clustersCount: clusteringReport.clusters.length,
        forcesProcessed: fullForcesForClustering.length
      });
      
      await storage.updateJob(jobId, { progress: 92 });

      // Store individual clusters with comprehensive validation and error handling
      console.log(`Preparing to store ${clusteringReport.clusters.length} clusters`);
      
      const clustersToStore = clusteringReport.clusters.map((cluster, index) => {
        // Validate each cluster before creating the storage object
        if (!cluster.algorithm) {
          console.error(`Cluster at index ${index} missing algorithm:`, cluster);
          throw new Error(`Cluster validation failed: missing algorithm at index ${index}`);
        }
        
        if (!cluster.forceIds || !Array.isArray(cluster.forceIds) || cluster.forceIds.length === 0) {
          console.error(`Cluster at index ${index} has invalid forceIds:`, cluster.forceIds);
          throw new Error(`Cluster validation failed: invalid forceIds at index ${index}`);
        }
        
        if (!cluster.label || cluster.size <= 0) {
          console.error(`Cluster at index ${index} missing label or invalid size:`, { label: cluster.label, size: cluster.size });
          throw new Error(`Cluster validation failed: missing label or invalid size at index ${index}`);
        }
        
        console.log(`Validating cluster ${index}: ${cluster.label} (${cluster.size} forces, algorithm: ${cluster.algorithm})`);
        
        return {
          projectId,
          label: cluster.label,
          method: cluster.algorithm, // Map algorithm to method column
          params: cluster.params || {},
          forceIds: cluster.forceIds,
          centroid: cluster.centroid || null,
          size: cluster.size,
          silhouetteScore: cluster.quality?.silhouetteScore || 0,
          cohesion: cluster.quality?.cohesion || 0,
          separation: cluster.quality?.separation || 0,
          inertia: cluster.quality?.inertia || 0
        };
      });

      console.log(`Validated ${clustersToStore.length} clusters, attempting database persistence`);
      
      if (clustersToStore.length > 0) {
        try {
          console.log("Starting cluster persistence with enhanced validation...");
          
          // Attempt to save clusters with comprehensive error handling
          const savedClusters = await storage.createClusters(clustersToStore);
          
          await storage.updateJob(jobId, { progress: 95 });
          
          // CRITICAL VALIDATION: Ensure clusters were actually saved
          if (!savedClusters || savedClusters.length === 0) {
            throw new Error(`CRITICAL FAILURE: storage.createClusters returned ${savedClusters?.length || 0} clusters despite ${clustersToStore.length} input clusters`);
          }
          
          if (savedClusters.length !== clustersToStore.length) {
            throw new Error(`PARTIAL FAILURE: Expected ${clustersToStore.length} clusters but only ${savedClusters.length} were saved`);
          }
          
          console.log(`SUCCESS: Persisted ${savedClusters.length} clusters to database with IDs:`, savedClusters.map(c => c.id));
          
          // Double verification: Query database to ensure persistence
          console.log("Performing database verification query...");
          const verificationClusters = await storage.getClusters(projectId);
          console.log(`Database verification: Found ${verificationClusters.length} total clusters for project ${projectId}`);
          
          // Count clusters created in this session (match by method for verification)
          const thisSessionClusters = verificationClusters.filter(c => 
            c.method === clusteringReport.algorithm && 
            savedClusters.some(sc => sc.id === c.id)
          );
          
          if (thisSessionClusters.length !== savedClusters.length) {
            throw new Error(`DATABASE VERIFICATION FAILED: Expected ${savedClusters.length} clusters from this session but found ${thisSessionClusters.length} in database`);
          }
          
          // Final validation: Ensure each saved cluster has required data
          const invalidClusters = savedClusters.filter(cluster => 
            !cluster.id || !cluster.projectId || !cluster.label || !cluster.method || !cluster.size
          );
          
          if (invalidClusters.length > 0) {
            throw new Error(`INVALID CLUSTERS DETECTED: ${invalidClusters.length} clusters saved with missing required fields`);
          }
          
          console.log(`VALIDATION PASSED: All ${savedClusters.length} clusters successfully saved and verified in database`);
          
          await storage.updateJob(jobId, { progress: 100, status: "completed", finishedAt: new Date() });
          
        } catch (persistenceError) {
          console.error("CRITICAL CLUSTER PERSISTENCE FAILURE:", {
            error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
            errorStack: persistenceError instanceof Error ? persistenceError.stack : undefined,
            clustersToStore: clustersToStore.length,
            projectId,
            algorithm: clusteringReport.algorithm,
            forces: forces.length
          });
          
          // Log sample cluster data for debugging
          console.error("Sample cluster data that failed to persist:", {
            firstCluster: clustersToStore[0] ? {
              projectId: clustersToStore[0].projectId,
              label: clustersToStore[0].label,
              method: clustersToStore[0].method,
              size: clustersToStore[0].size,
              forceIdsLength: clustersToStore[0].forceIds?.length,
              hasParams: !!clustersToStore[0].params,
              hasCentroid: !!clustersToStore[0].centroid
            } : null,
            totalClusters: clustersToStore.length
          });
          
          await storage.updateJob(jobId, {
            status: "failed",
            error: `Cluster persistence failed: ${persistenceError instanceof Error ? persistenceError.message : 'Unknown persistence error'}`,
            finishedAt: new Date()
          });
          return;
        }
      } else {
        console.error("CLUSTERING FAILURE: No valid clusters generated for storage");
        await storage.updateJob(jobId, {
          status: "failed",
          error: "No clusters generated during clustering process - algorithm may have failed to produce meaningful groupings",
          finishedAt: new Date()
        });
        return;
      }

      console.log(`Successfully created ${clustersToStore.length} clusters using ${clusteringReport.algorithm} algorithm`);
      console.log(`Overall clustering quality - Silhouette: ${clusteringReport.overallQuality.averageSilhouette.toFixed(3)}, Davies-Bouldin: ${clusteringReport.overallQuality.daviesBouldinIndex.toFixed(3)}`);

      await storage.updateJob(jobId, { 
        status: "done", 
        progress: 100,
        finishedAt: new Date(),
        metaJson: {
          clustersCreated: clustersToStore.length,
          algorithm: clusteringReport.algorithm,
          qualityMetrics: {
            silhouette: clusteringReport.overallQuality.averageSilhouette,
            daviesBouldin: clusteringReport.overallQuality.daviesBouldinIndex
          }
        }
      });

    } catch (error) {
      console.error("Preprocessing error:", error);
      await storage.updateJob(jobId, { 
        status: "failed", 
        error: error instanceof Error ? error.message : "Unknown error",
        finishedAt: new Date()
      });
    }
  }

  async calculateImpactMetrics(projectId: string): Promise<any> {
    const result = await storage.getDrivingForces(projectId);
    const forces = result.forces;
    
    const metrics = {
      totalForces: forces.length,
      avgImpact: 0,
      steepDistribution: {} as { [key: string]: number },
      sentimentDistribution: {} as { [key: string]: number },
      timeHorizonDistribution: {} as { [key: string]: number },
    };

    forces.forEach(force => {
      if (force.impact) {
        metrics.avgImpact += force.impact;
      }
      
      if (force.steep) {
        metrics.steepDistribution[force.steep] = (metrics.steepDistribution[force.steep] || 0) + 1;
      }
      
      if (force.sentiment) {
        metrics.sentimentDistribution[force.sentiment] = (metrics.sentimentDistribution[force.sentiment] || 0) + 1;
      }
      
      if (force.ttm) {
        metrics.timeHorizonDistribution[force.ttm] = (metrics.timeHorizonDistribution[force.ttm] || 0) + 1;
      }
    });

    metrics.avgImpact = metrics.avgImpact / forces.length;

    return metrics;
  }
}

export const preprocessingService = new PreprocessingService();