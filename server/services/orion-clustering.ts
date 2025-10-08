import type { DrivingForce } from "@shared/schema";
import type { ClusterResult, ClusteringParams } from "./clustering";
import { spawn } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";

/**
 * ORION Clustering Service
 * 
 * Supports both modern clustering computation and FixedClusters patch approach.
 * 
 * FixedClusters Mode (when STRICT_FEATURES=true):
 * - Loads precomputed clusters from pickle file (exactly 37 semantic clusters)
 * - Uses integrity validation for data consistency
 * - Prevents recomputation to maintain exact cluster assignments
 * 
 * Legacy Mode (when STRICT_FEATURES=false):
 * - Implements modern ORION clustering with Sentence Transformers + UMAP + Louvain
 * - Real-time computation with semantic cluster generation
 * - Targets exactly 37 clusters with resolution tuning
 * 
 * Environment Variables:
 * - STRICT_FEATURES: Enable FixedClusters mode (default: true)
 * - FEATURES_FILE: Path to precomputed features pickle file
 */

export interface OrionClusteringResult {
  clusters: ClusterResult[];
  coordinates3d: { [forceId: string]: { x: number; y: number; z: number } };
  overallQuality: {
    averageSilhouette: number;
    daviesBouldinIndex: number;
    calinskiHarabaszIndex: number;
    totalInertia: number;
  };
}

export interface PrecomputedFeatures {
  id: string[];
  cluster_labels: number[];
  cluster_titles: { [key: number]: string };
  umap2d_x: number[];
  umap2d_y: number[];
  tsne_x: number[];  // UMAP 3D coordinates (compatibility)
  tsne_y: number[];
  tsne_z: number[];
  umap3d_x?: number[];
  umap3d_y?: number[];
  umap3d_z?: number[];
  silhouette_score: number;
  n_clusters: number;
  resolution_used?: number;
}

export class OrionClusteringService {
  private readonly randomSeed = 42;
  private readonly targetClusters = 37;
  
  /**
   * Check if FixedClusters mode is enabled
   */
  private isFixedClustersMode(): boolean {
    const strictFeatures = process.env.STRICT_FEATURES?.toLowerCase();
    return strictFeatures === 'true' || strictFeatures === '1' || strictFeatures === 'yes';
  }
  
  /**
   * Main ORION clustering method - supports both FixedClusters and dynamic computation
   */
  async performOrionClustering(forces: DrivingForce[], params: ClusteringParams): Promise<OrionClusteringResult> {
    const isFixedMode = this.isFixedClustersMode();
    
    if (isFixedMode) {
      console.log(`Starting ORION clustering for ${forces.length} forces using FixedClusters approach`);
      console.log(`Features file: ${process.env.FEATURES_FILE || 'default'}`);
      console.log(`Strict mode: ${process.env.STRICT_FEATURES}`);
      
      try {
        // Step 1: Load precomputed features from pickle file
        const features = await this.loadPrecomputedFeatures();
        console.log(`Successfully loaded precomputed features with ${features.n_clusters} clusters`);
        console.log(`Clustering quality: Silhouette score = ${features.silhouette_score.toFixed(3)}`);
        
        // Step 2: Create cluster results from precomputed features
        const clusters = this.createClustersFromFeatures(forces, features, params);
        console.log(`Created ${clusters.length} cluster objects`);
        
        // Step 3: Generate 3D coordinates mapping for visualization
        const coordinates3d = this.generateCoordinatesMapping(forces, features);
        console.log(`Generated 3D coordinates for ${Object.keys(coordinates3d).length} forces`);
        
        // Step 4: Calculate overall quality metrics
        const overallQuality = {
          averageSilhouette: features.silhouette_score,
          daviesBouldinIndex: 0, // Not computed by precomputed clusters but keep for compatibility
          calinskiHarabaszIndex: 0, // Not computed by precomputed clusters but keep for compatibility
          totalInertia: 0 // Not applicable to precomputed clusters but keep for compatibility
        };
        
        console.log(`ORION FixedClusters completed successfully!`);
        console.log(`- Loaded ${clusters.length} precomputed clusters`);
        console.log(`- Silhouette score: ${features.silhouette_score.toFixed(3)}`);
        console.log(`- Using fixed cluster assignments (no recomputation)`);
        
        return {
          clusters,
          coordinates3d,
          overallQuality
        };
        
      } catch (error) {
        console.error("Error during ORION FixedClusters loading:", error);
        throw new Error(`ORION FixedClusters failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
    } else {
      console.log(`Starting ORION clustering for ${forces.length} forces using dynamic computation (Sentence Transformers + UMAP + Louvain)`);
      
      try {
        // Step 1: Run Python preprocessing script with modern ML techniques
        const features = await this.runPythonPreprocessing(forces);
        console.log(`Successfully processed ${forces.length} forces into ${features.n_clusters} clusters`);
        console.log(`Clustering quality: Silhouette score = ${features.silhouette_score.toFixed(3)}`);
        
        // Step 2: Create cluster results from processed features
        const clusters = this.createClustersFromFeatures(forces, features, params);
        console.log(`Created ${clusters.length} cluster objects`);
        
        // Step 3: Generate 3D coordinates mapping for visualization
        const coordinates3d = this.generateCoordinatesMapping(forces, features);
        console.log(`Generated 3D coordinates for ${Object.keys(coordinates3d).length} forces`);
        
        // Step 4: Calculate overall quality metrics
        const overallQuality = {
          averageSilhouette: features.silhouette_score,
          daviesBouldinIndex: 0, // Not computed by Louvain but keep for compatibility
          calinskiHarabaszIndex: 0, // Not computed by Louvain but keep for compatibility
          totalInertia: 0 // Not applicable to Louvain but keep for compatibility
        };
        
        console.log(`ORION dynamic clustering completed successfully!`);
        console.log(`- Generated ${clusters.length} clusters`);
        console.log(`- Silhouette score: ${features.silhouette_score.toFixed(3)}`);
        console.log(`- Resolution used: ${features.resolution_used || 'N/A'}`);
        
        return {
          clusters,
          coordinates3d,
          overallQuality
        };
        
      } catch (error) {
        console.error("Error during ORION dynamic clustering:", error);
        throw new Error(`ORION dynamic clustering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Load precomputed features from pickle file using FixedClusters approach
   */
  private async loadPrecomputedFeatures(): Promise<PrecomputedFeatures> {
    const sessionId = nanoid();
    const outputFile = join(process.cwd(), `temp_fixed_features_${sessionId}.json`);
    
    try {
      console.log("Loading precomputed features using FixedClusters approach...");
      
      // Call Python bridge script to load pickle data
      const pythonScript = join(process.cwd(), "backend/orion/orion_fixed_bridge.py");
      console.log(`Calling Python bridge script: ${pythonScript}`);
      
      const pythonArgs = [
        pythonScript,
        "--output", outputFile,
        "--mode", "clusters"
      ];
      
      console.log(`Running: python3 ${pythonArgs.join(" ")}`);
      
      const pythonProcess = spawn("python3", pythonArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          // Ensure environment variables are passed to Python
          FEATURES_FILE: process.env.FEATURES_FILE || 'attached_assets/precomputed_features_1758013839680.pkl',
          STRICT_FEATURES: process.env.STRICT_FEATURES || 'true'
        }
      });
      
      let stdout = "";
      let stderr = "";
      
      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log(`[Python Bridge]: ${data.toString().trim()}`);
      });
      
      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error(`[Python Bridge Error]: ${data.toString().trim()}`);
      });
      
      // Wait for Python process to complete
      const exitCode = await new Promise<number>((resolve) => {
        pythonProcess.on("close", resolve);
      });
      
      if (exitCode !== 0) {
        throw new Error(`Python bridge script failed with exit code ${exitCode}:\n${stderr}`);
      }
      
      console.log("Python bridge script completed successfully");
      
      // Load results from JSON output file
      if (!existsSync(outputFile)) {
        throw new Error(`Output file not found: ${outputFile}`);
      }
      
      const resultsData = JSON.parse(readFileSync(outputFile, "utf-8"));
      
      if (!resultsData.success) {
        throw new Error(`Bridge script failed: ${resultsData.error || 'Unknown error'}`);
      }
      
      const features = resultsData.features;
      
      console.log(`Loaded precomputed features for ${features.id.length} forces`);
      console.log(`Found ${features.n_clusters} clusters`);
      console.log(`Silhouette score: ${features.silhouette_score}`);
      console.log(`Metadata: ${JSON.stringify(resultsData.metadata)}`);
      
      return features as PrecomputedFeatures;
      
    } catch (error) {
      console.error("Error loading precomputed features:", error);
      throw error;
    } finally {
      // Clean up temporary files
      try {
        if (existsSync(outputFile)) unlinkSync(outputFile);
      } catch (cleanupError) {
        console.warn("Warning: Could not clean up temporary files:", cleanupError);
      }
    }
  }

  /**
   * Run Python preprocessing script with Sentence Transformers + UMAP + Louvain
   */
  private async runPythonPreprocessing(forces: DrivingForce[]): Promise<PrecomputedFeatures> {
    const sessionId = nanoid();
    const inputFile = join(process.cwd(), `temp_forces_${sessionId}.json`);
    const outputFile = join(process.cwd(), `temp_features_${sessionId}.json`);
    
    try {
      console.log("Preparing forces data for Python preprocessing...");
      
      // Prepare forces data for Python script
      const forcesData = forces.map((force, index) => ({
        id: force.id,
        title: force.title || "",
        text: force.text || "", // Using 'text' field as description
        tags: Array.isArray(force.tags) ? force.tags.join(" ") : (force.tags || ""),
        // Add original index to ensure consistency
        original_index: index
      }));
      
      // Write forces data to temporary JSON file
      writeFileSync(inputFile, JSON.stringify(forcesData, null, 2));
      console.log(`Wrote ${forcesData.length} forces to ${inputFile}`);
      
      // Call Python preprocessing script
      const pythonScript = join(process.cwd(), "backend/orion/orion_preprocessing.py");
      console.log(`Calling Python script: ${pythonScript}`);
      
      const pythonArgs = [
        pythonScript,
        "--input", inputFile,
        "--output", outputFile,
        "--target-clusters", this.targetClusters.toString(),
        "--random-state", this.randomSeed.toString()
      ];
      
      console.log(`Running: python3 ${pythonArgs.join(" ")}`);
      
      const pythonProcess = spawn("python3", pythonArgs, {
        stdio: ["pipe", "pipe", "pipe"]
      });
      
      let stdout = "";
      let stderr = "";
      
      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log(`[Python]: ${data.toString().trim()}`);
      });
      
      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error(`[Python Error]: ${data.toString().trim()}`);
      });
      
      // Wait for Python process to complete
      const exitCode = await new Promise<number>((resolve) => {
        pythonProcess.on("close", resolve);
      });
      
      if (exitCode !== 0) {
        throw new Error(`Python preprocessing failed with exit code ${exitCode}:\n${stderr}`);
      }
      
      console.log("Python preprocessing completed successfully");
      
      // Load results from pickle file (for now, we'll expect JSON format)
      // In production, you'd use a Python script to convert pickle to JSON
      if (!existsSync(outputFile)) {
        throw new Error(`Output file not found: ${outputFile}`);
      }
      
      // For MVP, we expect JSON output instead of pickle
      const resultsData = JSON.parse(readFileSync(outputFile, "utf-8"));
      
      console.log(`Loaded features for ${resultsData.id.length} forces`);
      console.log(`Generated ${resultsData.n_clusters} clusters`);
      console.log(`Silhouette score: ${resultsData.silhouette_score}`);
      
      return resultsData as PrecomputedFeatures;
      
    } catch (error) {
      console.error("Error in Python preprocessing:", error);
      throw error;
    } finally {
      // Clean up temporary files
      try {
        if (existsSync(inputFile)) unlinkSync(inputFile);
        if (existsSync(outputFile)) unlinkSync(outputFile);
      } catch (cleanupError) {
        console.warn("Warning: Could not clean up temporary files:", cleanupError);
      }
    }
  }

  /**
   * Create cluster results from precomputed features
   */
  private createClustersFromFeatures(
    forces: DrivingForce[], 
    features: PrecomputedFeatures, 
    params: ClusteringParams
  ): ClusterResult[] {
    const clusters: ClusterResult[] = [];
    const clusterGroups = new Map<number, string[]>();
    
    // Group force IDs by cluster label
    features.cluster_labels.forEach((clusterLabel, index) => {
      const forceId = features.id[index];
      if (!clusterGroups.has(clusterLabel)) {
        clusterGroups.set(clusterLabel, []);
      }
      clusterGroups.get(clusterLabel)!.push(forceId);
    });
    
    // Import fixed cluster names mapping
    const CLUSTER_NAMES = {
      0: "AI & Automation", 1: "Healthcare Tech", 2: "Sustainability", 3: "Financial Tech",
      4: "Social Dynamics", 5: "Smart Cities", 6: "Energy Systems", 7: "Digital Transformation",
      8: "Education Innovation", 9: "Manufacturing 4.0", 10: "Space & Defense", 11: "Food & Agriculture",
      12: "Materials Science", 13: "Quantum Computing", 14: "Biotechnology", 15: "Cybersecurity",
      16: "Transportation", 17: "Climate Action", 18: "Governance", 19: "Future of Work",
      20: "Consumer Tech", 21: "Media Evolution", 22: "Supply Chain", 23: "Data Economy",
      24: "Health & Wellness", 25: "Urban Development", 26: "Resource Management", 27: "Scientific Research",
      28: "Risk & Resilience", 29: "Human Enhancement", 30: "Digital Society", 31: "Environmental Tech",
      32: "Infrastructure", 33: "Global Systems", 34: "Emerging Markets", 35: "Innovation Ecosystems"
    };
    
    // Create cluster objects
    clusterGroups.forEach((forceIds, clusterLabel) => {
      // Use fixed cluster names instead of dynamic titles
      const clusterTitle = CLUSTER_NAMES[clusterLabel as keyof typeof CLUSTER_NAMES] || `Cluster ${clusterLabel}`;
      
      // Calculate centroid from 3D coordinates
      const centroid = this.calculateCentroidFromCoordinates(forceIds, features);
      
      // Calculate quality metrics
      const quality = this.calculateModernClusterQuality(forceIds, features, clusterLabel);
      
      clusters.push({
        id: `orion_cluster_${Date.now()}_${clusterLabel}`,
        label: clusterTitle,
        forceIds,
        centroid,
        size: forceIds.length,
        quality,
        algorithm: "orion_modern",
        params
      });
    });
    
    console.log(`Created ${clusters.length} cluster results`);
    return clusters;
  }
  
  /**
   * Generate 3D coordinates mapping for visualization
   */
  private generateCoordinatesMapping(
    forces: DrivingForce[], 
    features: PrecomputedFeatures
  ): { [forceId: string]: { x: number; y: number; z: number } } {
    const coordinates: { [forceId: string]: { x: number; y: number; z: number } } = {};
    
    features.id.forEach((forceId, index) => {
      if (index < features.tsne_x.length) {
        coordinates[forceId] = {
          x: features.tsne_x[index],
          y: features.tsne_y[index], 
          z: features.tsne_z[index]
        };
      }
    });
    
    console.log(`Generated coordinates for ${Object.keys(coordinates).length} forces`);
    return coordinates;
  }
  
  /**
   * Calculate centroid from 3D coordinates
   */
  private calculateCentroidFromCoordinates(
    forceIds: string[], 
    features: PrecomputedFeatures
  ): number[] {
    let sumX = 0, sumY = 0, sumZ = 0;
    let count = 0;
    
    forceIds.forEach(forceId => {
      const index = features.id.indexOf(forceId);
      if (index !== -1 && index < features.tsne_x.length) {
        sumX += features.tsne_x[index];
        sumY += features.tsne_y[index];
        sumZ += features.tsne_z[index];
        count++;
      }
    });
    
    if (count === 0) return [0, 0, 0];
    
    return [sumX / count, sumY / count, sumZ / count];
  }
  
  /**
   * Calculate cluster quality using modern ML metrics
   */
  private calculateModernClusterQuality(
    forceIds: string[], 
    features: PrecomputedFeatures, 
    clusterLabel: number
  ): { silhouetteScore: number; cohesion: number; separation: number; inertia?: number } {
    // Get coordinates for this cluster
    const clusterCoords: { x: number; y: number; z: number }[] = [];
    let centroidX = 0, centroidY = 0, centroidZ = 0;
    
    forceIds.forEach(forceId => {
      const index = features.id.indexOf(forceId);
      if (index !== -1 && index < features.tsne_x.length) {
        const coord = {
          x: features.tsne_x[index],
          y: features.tsne_y[index],
          z: features.tsne_z[index]
        };
        clusterCoords.push(coord);
        centroidX += coord.x;
        centroidY += coord.y;
        centroidZ += coord.z;
      }
    });
    
    if (clusterCoords.length === 0) {
      return {
        silhouetteScore: 0,
        cohesion: 0,
        separation: 0,
        inertia: 0
      };
    }
    
    // Calculate cluster centroid
    centroidX /= clusterCoords.length;
    centroidY /= clusterCoords.length;
    centroidZ /= clusterCoords.length;
    
    // Calculate cohesion (average distance to centroid)
    let cohesion = 0;
    clusterCoords.forEach(coord => {
      const distance = Math.sqrt(
        (coord.x - centroidX) ** 2 + 
        (coord.y - centroidY) ** 2 + 
        (coord.z - centroidZ) ** 2
      );
      cohesion += distance;
    });
    cohesion /= clusterCoords.length;
    
    // Use the overall silhouette score from Louvain clustering
    const silhouetteScore = features.silhouette_score;
    
    // Calculate separation (simplified as distance from origin)
    const separation = Math.sqrt(centroidX ** 2 + centroidY ** 2 + centroidZ ** 2);
    
    return {
      silhouetteScore,
      cohesion,
      separation,
      inertia: cohesion * clusterCoords.length
    };
  }

}

export const orionClusteringService = new OrionClusteringService();
