import { readFileSync } from "fs";
import { join } from "path";
import { storage } from "../storage";
import type { InsertCluster } from "@shared/schema";

interface OldClusterData {
  cluster_titles: { [key: string]: string };
  total_points: number;
  total_clusters: number;
  silhouette_score: number;
}

export class ImportService {
  private static clusterTitleCache: Map<string, string> = new Map();

  /**
   * Clean up TF-IDF cluster titles to be more readable
   * E.g., "biotechnology & biotechnologygenetic" → "Biotechnology & Genetic Engineering"
   */
  private static cleanClusterTitle(rawTitle: string): string {
    if (this.clusterTitleCache.has(rawTitle)) {
      return this.clusterTitleCache.get(rawTitle)!;
    }

    // Define common word transformations for better readability
    const wordTransforms: { [key: string]: string } = {
      'biotechnology': 'Biotechnology',
      'genetic': 'Genetic Engineering',
      'intelligence': 'Artificial Intelligence',
      'sustainability': 'Sustainability',
      'cybersecurity': 'Cybersecurity',
      'cyberwarfare': 'Cyber Warfare',
      'quantumcomputing': 'Quantum Computing',
      'automation': 'Automation',
      'urbanization': 'Urbanization',
      'globalization': 'Globalization',
      'blockchain': 'Blockchain',
      'cryptocurrency': 'Cryptocurrency',
      'renewable': 'Renewable Energy',
      'nuclear': 'Nuclear Power',
      'aeronautic': 'Aeronautics',
      'aerospace': 'Aerospace',
      'mobility': 'Mobility & Transport',
      'employment': 'Employment & Labor',
      'warfare': 'Warfare & Security',
      'disinformation': 'Disinformation',
      'misinformation': 'Misinformation',
      'virtualization': 'Virtualization',
      'telecommunication': 'Telecommunications',
      'neuroscience': 'Neuroscience',
      'recycling': 'Recycling',
      'inflation': 'Economic Trends',
      'recession': 'Economic Trends',
      'intergenerational': 'Social Dynamics',
      'ageism': 'Social Issues',
      'activism': 'Social Activism'
    };

    // Split by & to handle compound titles
    const parts = rawTitle.split(' & ').map(part => {
      // Extract meaningful terms from concatenated words
      const extractedTerms: string[] = [];
      
      // Check for direct matches in transforms
      for (const [key, value] of Object.entries(wordTransforms)) {
        if (part.toLowerCase().includes(key)) {
          extractedTerms.push(value);
          part = part.replace(new RegExp(key, 'gi'), '');
        }
      }
      
      // Extract remaining meaningful words (3+ chars, not common words)
      const remainingWords = part.split(/(?=[A-Z])|[\s-]+/)
        .map(word => word.toLowerCase().trim())
        .filter(word => 
          word.length > 2 && 
          !this.STOPWORDS.has(word.toLowerCase())
        )
        .filter((word, index, arr) => arr.indexOf(word) === index) // Remove duplicates
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .filter(word => !extractedTerms.some(term => term.toLowerCase().includes(word.toLowerCase())));

      // Combine transformed terms with remaining words
      const allTerms = [...extractedTerms, ...remainingWords].slice(0, 3); // Limit to 3 terms max
      return allTerms.join(' ');
    }).filter(part => part.trim().length > 0);

    let cleanTitle = parts.join(' & ');
    
    // If result is empty or too short, use a fallback approach
    if (cleanTitle.length < 5) {
      // Fallback: Split camelCase and capitalize
      cleanTitle = rawTitle
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(/[\s&]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .filter(word => word.length > 2)
        .slice(0, 4)
        .join(' & ');
    }

    // Final cleanup
    cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
    if (cleanTitle.length === 0) {
      cleanTitle = `Cluster ${rawTitle.slice(0, 10)}...`; // Ultimate fallback
    }

    this.clusterTitleCache.set(rawTitle, cleanTitle);
    return cleanTitle;
  }

  /**
   * Enhanced stopwords list for better semantic filtering
   */
  private static readonly STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'during', 'including',
    'this', 'that', 'these', 'those', 'will', 'would', 'could', 'should',
    'can', 'may', 'might', 'must', 'such', 'very', 'more', 'most',
    'some', 'any', 'all', 'each', 'many', 'few', 'several', 'other',
    'another', 'through', 'between', 'among', 'within', 'without',
    'before', 'after', 'above', 'below', 'over', 'under', 'around'
  ]);

  /**
   * Calculate enhanced semantic similarity between two strings using token overlap
   * with improved filtering and weighting
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    // Clean and filter tokens more thoroughly
    const cleanTokens = (text: string): Set<string> => {
      return new Set(
        text.toLowerCase()
          .split(/\W+/)
          .filter(token => 
            token.length > 2 && 
            !this.STOPWORDS.has(token) &&
            !/^\d+$/.test(token) // Filter out pure numbers
          )
          .map(token => token.substring(0, 15)) // Limit token length for consistency
      );
    };

    const tokens1 = cleanTokens(str1);
    const tokens2 = cleanTokens(str2);
    
    if (tokens1.size === 0 || tokens2.size === 0) {
      return 0;
    }
    
    const intersection = new Set(Array.from(tokens1).filter(x => tokens2.has(x)));
    const union = new Set([...Array.from(tokens1), ...Array.from(tokens2)]);
    
    // Jaccard similarity with minimum intersection threshold
    const jaccardSimilarity = intersection.size / union.size;
    
    // Boost similarity if there are exact matches in important terms
    const intersectionSize = intersection.size;
    const boostFactor = intersectionSize >= 2 ? 1.2 : 1.0;
    
    return Math.min(1.0, jaccardSimilarity * boostFactor);
  }

  /**
   * Map driving forces to clusters based on semantic similarity with pagination support
   */
  private static async mapForcesToClusters(
    projectId: string,
    clusterTitles: string[]
  ): Promise<Map<string, string[]>> {
    const forceMapping = new Map<string, string[]>();
    
    // Initialize mapping for each cluster
    clusterTitles.forEach(title => {
      forceMapping.set(title, []);
    });

    // Get all driving forces for the project with pagination
    let allForces: any[] = [];
    let offset = 0;
    const batchSize = 5000; // Process in batches to handle large datasets
    let hasMore = true;

    while (hasMore) {
      const { forces, total } = await storage.getDrivingForces(projectId, undefined, {}, {
        limit: batchSize,
        offset,
        includeSignals: true
      });
      
      allForces = allForces.concat(forces);
      offset += batchSize;
      hasMore = allForces.length < total;

      // Safety check to prevent infinite loops
      if (offset > 100000) {
        console.warn(`Large dataset detected (${total} forces). Processing first 100k forces.`);
        break;
      }
    }

    console.log(`Processing ${allForces.length} forces for cluster mapping`);

    // Map each force to the best matching cluster
    for (const force of allForces) {
      let bestMatch = '';
      let bestScore = 0;
      
      const forceText = `${force.title} ${force.text || ''}`.toLowerCase();
      
      for (const clusterTitle of clusterTitles) {
        const similarity = this.calculateSimilarity(forceText, clusterTitle);
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = clusterTitle;
        }
      }
      
      // Improved threshold: 0.15 (15% token overlap) for better mapping quality
      if (bestScore > 0.15 && bestMatch) {
        forceMapping.get(bestMatch)!.push(force.id);
      }
    }

    return forceMapping;
  }

  /**
   * Import old cluster data into the database
   */
  static async importOldClusters(projectId: string): Promise<{
    success: boolean;
    clustersCreated: number;
    forcesMapped: number;
    message: string;
  }> {
    try {
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return {
          success: false,
          clustersCreated: 0,
          forcesMapped: 0,
          message: "Project not found"
        };
      }

      // Check existing legacy clusters for partial recovery (improved idempotency)
      const existingClusters = await storage.getClusters(projectId);
      const legacyClusters = existingClusters.filter(c => c.method === 'legacy');
      const existingLegacyTitles = new Set(legacyClusters.map(c => c.label));
      
      // Read old cluster data to determine what should be imported
      const dataPath = join(process.cwd(), 'attached_assets', 'old_cluster_data.json');
      const oldData: OldClusterData = JSON.parse(readFileSync(dataPath, 'utf-8'));
      const expectedClusterTitles = Object.values(oldData.cluster_titles).map(title => 
        this.cleanClusterTitle(title)
      );
      
      // If all clusters already exist, skip import
      const allClustersExist = expectedClusterTitles.every(title => existingLegacyTitles.has(title));
      
      if (allClustersExist) {
        const totalForcesInLegacy = legacyClusters.reduce((sum, cluster) => 
          sum + (cluster.forceIds?.length || 0), 0
        );
        
        return {
          success: true,
          clustersCreated: 0,
          forcesMapped: totalForcesInLegacy,
          message: `All legacy clusters already exist (${legacyClusters.length} found). Import complete.`
        };
      }
      
      // Identify clusters that need to be created (partial recovery)
      const clustersToImport = expectedClusterTitles.filter(title => !existingLegacyTitles.has(title));
      
      if (clustersToImport.length < expectedClusterTitles.length) {
        console.log(`Partial import: Creating ${clustersToImport.length} missing clusters (${legacyClusters.length} already exist)`);
      }

      // Use only the clusters that need to be imported
      const clusterTitles = clustersToImport;

      // BUGFIX: Build proper mapping to maintain correct originalIndex during partial recovery
      const titleToOriginalMetadata = new Map<string, { originalTitle: string; originalIndex: string }>();
      
      // Build mapping from cleaned titles to their original metadata
      Object.entries(oldData.cluster_titles).forEach(([originalIndex, originalTitle]) => {
        const cleanedTitle = this.cleanClusterTitle(originalTitle);
        titleToOriginalMetadata.set(cleanedTitle, { originalTitle, originalIndex });
      });

      // Map forces to clusters
      const forceMapping = await this.mapForcesToClusters(projectId, clusterTitles);

      // Create clusters in database
      const clustersToCreate: InsertCluster[] = clusterTitles.map((title) => {
        const forceIds = forceMapping.get(title) || [];
        const originalMetadata = titleToOriginalMetadata.get(title);
        
        if (!originalMetadata) {
          console.warn(`Warning: Could not find original metadata for cluster title: ${title}`);
        }
        
        return {
          projectId,
          label: title,
          method: 'legacy',
          params: {
            originalTitle: originalMetadata?.originalTitle || title,
            originalIndex: originalMetadata?.originalIndex || 'unknown',
            source: 'old_orion_import',
            totalPoints: oldData.total_points,
            totalClusters: oldData.total_clusters
          },
          forceIds,
          size: forceIds.length,
          silhouetteScore: oldData.silhouette_score,
          centroid: null, // No centroid data available from old system
          cohesion: null,
          separation: null,
          inertia: null
        };
      });

      // Batch create clusters
      const createdClusters = await storage.createClusters(clustersToCreate);
      
      // Calculate total forces mapped
      const totalForcesMapped = createdClusters.reduce((sum, cluster) => 
        sum + (cluster.forceIds?.length || 0), 0
      );

      return {
        success: true,
        clustersCreated: createdClusters.length,
        forcesMapped: totalForcesMapped,
        message: `Successfully imported ${createdClusters.length} legacy clusters with ${totalForcesMapped} mapped forces`
      };

    } catch (error) {
      console.error('Error importing old clusters:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : error);
      return {
        success: false,
        clustersCreated: 0,
        forcesMapped: 0,
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get import status for a project
   */
  static async getImportStatus(projectId: string): Promise<{
    hasLegacyClusters: boolean;
    legacyClusterCount: number;
    totalForcesInLegacyClusters: number;
  }> {
    const clusters = await storage.getClusters(projectId);
    const legacyClusters = clusters.filter(c => c.method === 'legacy');
    
    const totalForcesInLegacyClusters = legacyClusters.reduce((sum, cluster) => 
      sum + (cluster.forceIds?.length || 0), 0
    );

    return {
      hasLegacyClusters: legacyClusters.length > 0,
      legacyClusterCount: legacyClusters.length,
      totalForcesInLegacyClusters
    };
  }

  /**
   * Populate forces for existing orion_import clusters that have empty forceIds
   * Uses efficient batching to handle large datasets
   */
  static async populateExistingClusterForces(projectId: string): Promise<{
    success: boolean;
    clustersUpdated: number;
    forcesMapped: number;
    message: string;
  }> {
    try {
      console.log(`Starting optimized force population for existing clusters in project ${projectId}`);
      
      // Get existing orion_import clusters with empty force assignments
      const existingClusters = await storage.getClusters(projectId);
      const orionClusters = existingClusters.filter(c => c.method === 'orion_import');
      const emptyClusters = orionClusters.filter(c => !c.forceIds || c.forceIds.length === 0);
      
      if (emptyClusters.length === 0) {
        return {
          success: true,
          clustersUpdated: 0,
          forcesMapped: 0,
          message: "No empty clusters found - all orion_import clusters already have force assignments"
        };
      }

      console.log(`Found ${emptyClusters.length} empty clusters out of ${orionClusters.length} total orion_import clusters`);

      // Get all forces for the project
      const allForces = await storage.getDrivingForces(projectId, undefined, {}, {});
      console.log(`Processing ${allForces.forces.length} forces in batches`);
      
      // Process in batches to avoid memory issues
      const BATCH_SIZE = 1000;
      const clusterAssignments = new Map<string, string[]>(); // clusterId -> forceIds
      
      // Initialize cluster assignments
      emptyClusters.forEach(cluster => {
        clusterAssignments.set(cluster.id, []);
      });

      // Process forces in batches
      for (let i = 0; i < allForces.forces.length; i += BATCH_SIZE) {
        const batch = allForces.forces.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(allForces.forces.length/BATCH_SIZE)} (${batch.length} forces)`);
        
        // For each force in the batch, find the best matching cluster
        batch.forEach(force => {
          const bestCluster = this.findBestMatchingCluster(force, emptyClusters);
          if (bestCluster) {
            const currentAssignments = clusterAssignments.get(bestCluster.id) || [];
            currentAssignments.push(force.id);
            clusterAssignments.set(bestCluster.id, currentAssignments);
          }
        });
        
        // Small delay between batches to avoid overwhelming the system
        if (i + BATCH_SIZE < allForces.forces.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      // Update clusters with their assigned forces
      let totalForcesMapped = 0;
      let clustersUpdated = 0;
      
      for (const cluster of emptyClusters) {
        const assignedForceIds = clusterAssignments.get(cluster.id) || [];
        
        if (assignedForceIds.length > 0) {
          // Update cluster with force assignments
          await storage.updateCluster(cluster.id, {
            forceIds: assignedForceIds,
            size: assignedForceIds.length
          });
          
          totalForcesMapped += assignedForceIds.length;
          clustersUpdated++;
          
          console.log(`Cluster "${cluster.label}": assigned ${assignedForceIds.length} forces`);
        } else {
          console.log(`Cluster "${cluster.label}": no forces matched`);
        }
      }

      return {
        success: true,
        clustersUpdated,
        forcesMapped: totalForcesMapped,
        message: `Successfully updated ${clustersUpdated} clusters with ${totalForcesMapped} total force assignments using batch processing`
      };

    } catch (error) {
      console.error('Error populating cluster forces:', error);
      return {
        success: false,
        clustersUpdated: 0,
        forcesMapped: 0,
        message: `Failed to populate cluster forces: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Find the best matching cluster for a given force using semantic similarity
   */
  private static findBestMatchingCluster(force: any, clusters: any[]): any | null {
    const SIMILARITY_THRESHOLD = 0.15; // 15% token overlap threshold
    
    let bestMatch = null;
    let bestScore = 0;
    
    // Combine force title and description for matching
    const forceText = `${force.title} ${force.description || ''}`.toLowerCase();
    const forceTokens = new Set(forceText.split(/\s+/).filter(token => token.length > 2));
    
    for (const cluster of clusters) {
      const clusterText = cluster.label.toLowerCase();
      const clusterTokens = new Set(clusterText.split(/\s+/).filter((token: string) => token.length > 2));
      
      // Calculate Jaccard similarity (intersection over union)
      const intersection = new Set(Array.from(forceTokens).filter(token => clusterTokens.has(token)));
      const union = new Set([...Array.from(forceTokens), ...Array.from(clusterTokens)]);
      const similarity = intersection.size / union.size;
      
      if (similarity > bestScore && similarity >= SIMILARITY_THRESHOLD) {
        bestScore = similarity;
        bestMatch = cluster;
      }
    }
    
    return bestMatch;
  }

  /**
   * Populate all 36 remaining ORION clusters using SQL-based keyword matching
   * This method creates comprehensive keyword patterns for each cluster and uses efficient
   * SQL queries to assign forces based on semantic similarity.
   */
  static async populateAllOrionClusters(projectId: string): Promise<{
    success: boolean;
    clustersPopulated: number;
    totalForcesAssigned: number;
    message: string;
    results: Array<{cluster: string; forces: number; keywords: string[]}>;
  }> {
    try {
      console.log(`🚀 Starting comprehensive ORION cluster population for project ${projectId}`);
      
      // Get all ORION clusters that need population (excluding AI & Information Systems)
      const allClusters = await storage.getClusters(projectId, 'orion_import');
      const emptyClusters = allClusters.filter(c => 
        !c.forceIds || c.forceIds.length === 0
      );
      
      console.log(`📊 Found ${emptyClusters.length} empty clusters to populate`);
      
      if (emptyClusters.length === 0) {
        return {
          success: true,
          clustersPopulated: 0,
          totalForcesAssigned: 0,
          message: "All ORION clusters are already populated",
          results: []
        };
      }

      // Define comprehensive keyword patterns for each cluster
      const clusterKeywordMap = this.createClusterKeywordMapping();
      
      const results: Array<{cluster: string; forces: number; keywords: string[]}> = [];
      let totalForcesAssigned = 0;
      let clustersPopulated = 0;

      // Process each cluster sequentially to avoid SQL conflicts
      for (const cluster of emptyClusters) {
        const keywords = clusterKeywordMap[cluster.label];
        
        if (!keywords) {
          console.warn(`⚠️  No keyword pattern found for cluster: ${cluster.label}`);
          continue;
        }

        console.log(`🔍 Processing cluster "${cluster.label}" with ${keywords.length} keyword patterns`);
        
        try {
          // Use SQL-based approach to find matching forces
          const matchingForces = await this.findMatchingForcesByKeywords(
            projectId, 
            keywords, 
            cluster.label
          );
          
          if (matchingForces.length > 0) {
            // Update cluster with force assignments
            await storage.updateCluster(cluster.id, {
              forceIds: matchingForces,
              size: matchingForces.length
            });
            
            results.push({
              cluster: cluster.label,
              forces: matchingForces.length,
              keywords: keywords
            });
            
            totalForcesAssigned += matchingForces.length;
            clustersPopulated++;
            
            console.log(`✅ Populated "${cluster.label}": ${matchingForces.length} forces`);
          } else {
            console.log(`❌ No matches found for "${cluster.label}"`);
            results.push({
              cluster: cluster.label,
              forces: 0,
              keywords: keywords
            });
          }
          
          // Small delay to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ Error processing cluster "${cluster.label}":`, error);
          results.push({
            cluster: cluster.label,
            forces: 0,
            keywords: keywords
          });
        }
      }

      console.log(`🎉 Completed ORION cluster population:`);
      console.log(`   Clusters populated: ${clustersPopulated}/${emptyClusters.length}`);
      console.log(`   Total forces assigned: ${totalForcesAssigned}`);

      return {
        success: true,
        clustersPopulated,
        totalForcesAssigned,
        message: `Successfully populated ${clustersPopulated} clusters with ${totalForcesAssigned} total force assignments`,
        results
      };

    } catch (error) {
      console.error('❌ Error in populateAllOrionClusters:', error);
      return {
        success: false,
        clustersPopulated: 0,
        totalForcesAssigned: 0,
        message: `Failed to populate clusters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        results: []
      };
    }
  }

  /**
   * Create comprehensive keyword mapping for all 36 ORION clusters
   * Each cluster gets multiple keyword patterns for semantic matching
   */
  private static createClusterKeywordMapping(): { [clusterName: string]: string[] } {
    return {
      "Aerospace & Transportation": [
        'aerospace', 'aviation', 'aircraft', 'airline', 'flight', 'airport', 'transportation',
        'logistics', 'mobility', 'boeing', 'airbus', 'spacecraft', 'satellite', 'drone',
        'autonomous vehicle', 'supply chain', 'shipping', 'freight', 'cargo'
      ],
      
      "Automotive Industry": [
        'automotive', 'vehicle', 'car', 'automobile', 'tesla', 'ford', 'gm', 'toyota',
        'electric vehicle', 'ev', 'autonomous driving', 'self-driving', 'manufacturing',
        'assembly line', 'dealership', 'hybrid', 'battery car', 'mobility service'
      ],
      
      "Battery Technology & Energy Storage": [
        'battery', 'lithium', 'energy storage', 'cell technology', 'charging', 'power storage',
        'grid storage', 'renewable storage', 'ion battery', 'solid state', 'energy density',
        'charge cycle', 'energy management', 'power bank', 'storage system'
      ],
      
      "Biotechnology & Genetics": [
        'biotechnology', 'genetics', 'dna', 'gene', 'genome', 'crispr', 'genetic engineering',
        'biotech', 'pharmaceutical', 'drug development', 'clinical trial', 'bioengineering',
        'synthetic biology', 'gene therapy', 'personalized medicine', 'biopharmaceutical'
      ],
      
      "Blockchain & Cryptocurrency": [
        'blockchain', 'cryptocurrency', 'bitcoin', 'ethereum', 'crypto', 'digital currency',
        'defi', 'nft', 'smart contract', 'decentralized', 'ledger', 'mining', 'wallet',
        'token', 'digital asset', 'web3', 'metaverse', 'dao'
      ],
      
      "Corporate Governance & ESG": [
        'corporate governance', 'esg', 'sustainability reporting', 'board governance',
        'stakeholder engagement', 'ethical business', 'compliance', 'risk management',
        'corporate responsibility', 'transparency', 'audit', 'fiduciary', 'shareholders'
      ],
      
      "Corporate Technology & Competition": [
        'corporate technology', 'enterprise software', 'business technology', 'competition',
        'market competition', 'tech rivalry', 'innovation race', 'digital transformation',
        'enterprise solution', 'b2b technology', 'corporate strategy', 'competitive advantage'
      ],
      
      "Cybersecurity & Information Warfare": [
        'cybersecurity', 'cyber', 'hacking', 'malware', 'ransomware', 'data breach',
        'information warfare', 'cyber attack', 'security threat', 'encryption', 'firewall',
        'privacy', 'data protection', 'cyber defense', 'threat intelligence'
      ],
      
      "Demographics & Intergenerational Issues": [
        'demographics', 'population', 'aging', 'generation', 'millennial', 'gen z', 'boomer',
        'intergenerational', 'workforce demographics', 'age distribution', 'population growth',
        'birth rate', 'life expectancy', 'demographic shift', 'generational divide'
      ],
      
      "Digital Education & Civic Engagement": [
        'digital education', 'online learning', 'edtech', 'civic engagement', 'democracy',
        'digital literacy', 'e-learning', 'educational technology', 'civic participation',
        'digital citizenship', 'online education', 'remote learning', 'civic tech'
      ],
      
      "Digital Work & Employment": [
        'remote work', 'digital work', 'gig economy', 'freelancing', 'employment',
        'workforce', 'job market', 'labor', 'work from home', 'digital nomad',
        'online work', 'platform economy', 'future of work', 'employment trends'
      ],
      
      "Entertainment Venues": [
        'entertainment', 'venue', 'theater', 'concert', 'stadium', 'arena', 'cinema',
        'theme park', 'gaming', 'sports venue', 'event space', 'entertainment industry',
        'live events', 'hospitality', 'leisure'
      ],
      
      "Environmental Sustainability": [
        'environmental', 'sustainability', 'climate', 'carbon', 'green technology',
        'renewable', 'conservation', 'ecosystem', 'pollution', 'emission', 'sustainable',
        'environmental protection', 'climate change', 'carbon footprint', 'eco-friendly'
      ],
      
      "Food & Nutrition": [
        'food', 'nutrition', 'agriculture', 'farming', 'organic', 'food security',
        'diet', 'health food', 'sustainable food', 'food technology', 'food production',
        'food system', 'nutritional', 'food industry', 'culinary'
      ],
      
      "Globalization & International Politics": [
        'globalization', 'international', 'global trade', 'geopolitics', 'diplomacy',
        'international relations', 'global economy', 'trade war', 'global governance',
        'multilateral', 'international cooperation', 'global policy', 'world politics'
      ],
      
      "Health & Wellness Brands": [
        'health brand', 'wellness', 'healthcare brand', 'fitness brand', 'nutrition brand',
        'health product', 'wellness industry', 'health consumer', 'wellness technology',
        'health marketplace', 'wellness service', 'health lifestyle'
      ],
      
      "Health Technology & Medicine": [
        'health technology', 'medical', 'healthcare', 'telemedicine', 'medical device',
        'digital health', 'healthtech', 'medical innovation', 'diagnostic', 'therapeutic',
        'clinical', 'hospital', 'patient care', 'medical research', 'pharmaceutical'
      ],
      
      "Industrial AI & Automation": [
        'industrial ai', 'automation', 'manufacturing', 'factory automation', 'robotics',
        'industrial robot', 'smart manufacturing', 'industry 4.0', 'process automation',
        'machine learning', 'predictive maintenance', 'industrial iot', 'production line'
      ],
      
      "Justice & Drug Policy": [
        'justice', 'legal', 'drug policy', 'criminal justice', 'law enforcement',
        'legal system', 'court', 'prison', 'rehabilitation', 'drug law', 'legal reform',
        'justice system', 'drug regulation', 'law and order'
      ],
      
      "Macroeconomic & Financial Policy": [
        'macroeconomic', 'economic policy', 'financial policy', 'monetary policy',
        'fiscal policy', 'central bank', 'interest rate', 'inflation', 'recession',
        'economic growth', 'gdp', 'economic indicator', 'financial regulation'
      ],
      
      "Nuclear Energy": [
        'nuclear', 'nuclear power', 'nuclear energy', 'reactor', 'uranium', 'nuclear plant',
        'atomic energy', 'nuclear technology', 'nuclear safety', 'nuclear waste',
        'nuclear fuel', 'nuclear industry', 'nuclear reactor'
      ],
      
      "Quantum Computing": [
        'quantum computing', 'quantum', 'quantum technology', 'quantum computer',
        'quantum algorithm', 'quantum supremacy', 'quantum physics', 'qubit',
        'quantum information', 'quantum cryptography', 'quantum research'
      ],
      
      "Recycling & Waste Management": [
        'recycling', 'waste management', 'waste', 'circular economy', 'waste reduction',
        'landfill', 'waste disposal', 'recycled material', 'waste treatment',
        'waste technology', 'sustainable waste', 'waste stream', 'trash', 'garbage'
      ],
      
      "Renewable Energy": [
        'renewable energy', 'solar', 'wind', 'renewable', 'clean energy', 'green energy',
        'solar power', 'wind power', 'hydroelectric', 'geothermal', 'renewable power',
        'sustainable energy', 'energy transition', 'clean tech'
      ],
      
      "Residential Communities": [
        'residential', 'housing', 'community', 'neighborhood', 'real estate',
        'residential development', 'housing market', 'home', 'property', 'residential area',
        'community development', 'urban planning', 'suburban', 'residential property'
      ],
      
      "Social Activism": [
        'social activism', 'activism', 'social movement', 'protest', 'social justice',
        'human rights', 'civil rights', 'social change', 'advocacy', 'grassroots',
        'social reform', 'community organizing', 'social cause', 'activist'
      ],
      
      "Social Resilience": [
        'social resilience', 'community resilience', 'social stability', 'social cohesion',
        'community strength', 'social support', 'social capital', 'community health',
        'social adaptation', 'resilience building', 'social recovery'
      ],
      
      "Space Exploration": [
        'space', 'space exploration', 'nasa', 'spacex', 'mars', 'lunar', 'moon',
        'astronaut', 'satellite', 'space mission', 'space technology', 'rocket',
        'space station', 'planetary', 'cosmos', 'space program', 'space travel'
      ],
      
      "Sustainable Materials": [
        'sustainable materials', 'eco-friendly material', 'green material', 'recycled material',
        'biodegradable', 'sustainable manufacturing', 'material science', 'bio-material',
        'sustainable design', 'circular material', 'renewable material'
      ],
      
      "Sustainable Mobility & Economy": [
        'sustainable mobility', 'green transportation', 'sustainable transport',
        'electric mobility', 'shared mobility', 'sustainable economy', 'green economy',
        'circular economy', 'sustainable business', 'eco-economy', 'green transport'
      ],
      
      "Taxation & Fiscal Policy": [
        'taxation', 'tax', 'fiscal policy', 'tax policy', 'government revenue',
        'tax reform', 'fiscal', 'tax code', 'tax system', 'government spending',
        'budget', 'public finance', 'tax law', 'fiscal responsibility'
      ],
      
      "Tourism & Climate": [
        'tourism', 'travel', 'hospitality', 'climate tourism', 'sustainable tourism',
        'eco-tourism', 'travel industry', 'tourist', 'vacation', 'climate travel',
        'tourism climate', 'destination', 'travel climate'
      ],
      
      "Urban Development": [
        'urban development', 'city development', 'urban planning', 'smart city',
        'urban growth', 'metropolitan', 'city planning', 'urban infrastructure',
        'urban design', 'city management', 'urban policy', 'municipal'
      ],
      
      "Vaccines & Pandemic Prevention": [
        'vaccine', 'vaccination', 'pandemic', 'epidemic', 'infectious disease',
        'immunization', 'public health', 'disease prevention', 'vaccine development',
        'pandemic prevention', 'outbreak', 'health emergency', 'vaccine technology'
      ],
      
      "Virtualization & Telecommunications": [
        'virtualization', 'telecommunications', 'telecom', 'network', 'cloud computing',
        'virtual', '5g', 'internet', 'communication', 'digital infrastructure',
        'connectivity', 'virtual reality', 'telecommunication'
      ],
      
      "Vision & Neuroscience": [
        'vision', 'neuroscience', 'brain', 'neural', 'cognitive', 'neurotechnology',
        'brain research', 'neurology', 'optical', 'eye', 'visual', 'sight',
        'brain science', 'neural network', 'cognitive science'
      ]
    };
  }

  /**
   * Use direct SQL to efficiently find forces that match keyword patterns for a cluster
   */
  private static async findMatchingForcesByKeywords(
    projectId: string, 
    keywords: string[], 
    clusterName: string
  ): Promise<string[]> {
    
    try {
      // Use the existing storage method to get forces and filter them
      const { forces } = await storage.getDrivingForces(projectId, undefined, {}, { 
        limit: 10000, 
        offset: 0 
      });
      
      // Filter forces based on keyword matching
      const matchingForces = forces.filter(force => {
        const searchText = `${force.title} ${force.text || ''}`.toLowerCase();
        return keywords.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );
      });
      
      const forceIds = matchingForces.map(force => force.id);
      console.log(`   🔍 Found ${forceIds.length} matching forces for "${clusterName}"`);
      
      return forceIds;
      
    } catch (error) {
      console.error(`❌ Error finding matches for "${clusterName}":`, error);
      return [];
    }
  }
}

export const importService = ImportService;