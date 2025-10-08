import { 
  projects, 
  drivingForces,
  clusters,
  clusteringReports,
  workspaces,
  jobs,
  reports,
  savedSearches,
  users,
  subscriptionPlans,
  subscriptionHistory,
  aiUsageTracking,
  FORCE_TYPES,
  type User,
  type UpsertUser,
  type Project, 
  type InsertProject,
  type DrivingForce,
  type InsertDrivingForce,
  type Cluster,
  type InsertCluster,
  type ClusteringReport,
  type InsertClusteringReport,
  type Workspace,
  type InsertWorkspace,
  type Job,
  type InsertJob,
  type Report,
  type InsertReport,
  type SearchQuery,
  type SearchResponse,
  type FacetCounts,
  type SavedSearch,
  type InsertSavedSearch,
  type SubscriptionPlan,
  type InsertSubscriptionPlan,
  type SubscriptionHistory,
  type InsertSubscriptionHistory,
  type AiUsageTracking,
  type InsertAiUsageTracking,
  type SubscriptionTier,
  type SubscriptionStatus
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, ne, or, ilike, between, inArray, count, like, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (MANDATORY for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Partial<User>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // User onboarding
  ensureUserDefaultProject(userId: string): Promise<Project>;

  // Projects
  ensureDefaultProject(): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  getProjects(): Promise<Project[]>;
  getProjectsByUser(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: string): Promise<boolean>;
  duplicateProject(id: string, newName: string, selectedForceIds?: string[]): Promise<Project>;

  // Driving Forces
  getDrivingForce(id: string): Promise<DrivingForce | undefined>;
  getDrivingForces(projectId?: string, lens?: string, filters?: any, options?: {
    limit?: number;
    offset?: number;
    includeEmbeddings?: boolean;
    includeSignals?: boolean;
  }): Promise<{ forces: DrivingForce[], total: number }>;
  getDrivingForcesByIds(ids: string[], projectId?: string, options?: {
    includeEmbeddings?: boolean;
    includeSignals?: boolean;
  }): Promise<{ forces: DrivingForce[], notFound: string[] }>;
  createDrivingForce(force: InsertDrivingForce): Promise<DrivingForce>;
  createDrivingForces(forces: InsertDrivingForce[]): Promise<DrivingForce[]>;
  updateDrivingForce(id: string, force: Partial<DrivingForce>): Promise<DrivingForce>;
  deleteDrivingForce(id: string): Promise<boolean>;

  // Clusters
  getCluster(id: string): Promise<Cluster | undefined>;
  getClusters(projectId: string, method?: string): Promise<Cluster[]>;
  createCluster(cluster: InsertCluster): Promise<Cluster>;
  createClusters(clusters: InsertCluster[]): Promise<Cluster[]>;
  updateCluster(id: string, cluster: Partial<InsertCluster>): Promise<Cluster>;
  deleteCluster(id: string): Promise<boolean>;
  deleteClustersByProject(projectId: string): Promise<boolean>;

  // Clustering Reports
  getClusteringReport(id: string): Promise<ClusteringReport | undefined>;
  getClusteringReports(projectId: string): Promise<ClusteringReport[]>;
  createClusteringReport(report: InsertClusteringReport): Promise<ClusteringReport>;
  updateClusteringReport(id: string, report: Partial<InsertClusteringReport>): Promise<ClusteringReport>;
  deleteClusteringReport(id: string): Promise<boolean>;

  // Workspaces
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaces(projectId: string): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, workspace: Partial<InsertWorkspace>): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<boolean>;

  // Jobs
  getJob(id: string): Promise<Job | undefined>;
  getJobs(status?: string): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, job: Partial<Job>): Promise<Job>;
  deleteJob(id: string): Promise<boolean>;

  // Reports
  getReport(id: string): Promise<Report | undefined>;
  getReports(projectId?: string): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: string, report: Partial<InsertReport>): Promise<Report>;
  deleteReport(id: string): Promise<boolean>;

  // Advanced Search
  queryForces(query: SearchQuery): Promise<SearchResponse>;

  // Bulk Edit Operations for Enhanced Scanning Assistant
  getDrivingForcesBulkEditPreview(projectId: string, filters: any): Promise<DrivingForce[]>;
  updateDrivingForcesBulk(projectId: string, filters: any, updates: any): Promise<DrivingForce[]>;

  // Saved Searches
  getSavedSearch(id: string): Promise<SavedSearch | undefined>;
  getSavedSearches(projectId: string): Promise<SavedSearch[]>;
  createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch>;
  updateSavedSearch(id: string, search: Partial<InsertSavedSearch>): Promise<SavedSearch>;
  deleteSavedSearch(id: string): Promise<boolean>;

  // Optimized paginated force retrieval for clustering
  getDrivingForcesForClustering(
    projectId: string,
    options?: {
      pageSize?: number;
      includeSignals?: boolean;
    }
  ): Promise<{
    totalCount: number;
    getPage: (pageIndex: number) => Promise<Array<{
      id: string;
      title: string;
      text: string;
      embeddingVector?: number[];
    }>>;
  }>;

  // Subscription Management
  getSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getSubscriptionPlan(tier: SubscriptionTier): Promise<SubscriptionPlan | undefined>;
  getSubscriptionPlanById(id: string): Promise<SubscriptionPlan | undefined>;
  createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  updateSubscriptionPlan(id: string, plan: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan>;
  
  // User subscription operations
  updateUserSubscription(userId: string, updates: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionTier?: SubscriptionTier;
    subscriptionStatus?: SubscriptionStatus;
    subscriptionCurrentPeriodEnd?: Date;
    subscriptionCancelAtPeriodEnd?: boolean;
    trialEndsAt?: Date;
  }): Promise<User>;
  
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  getSubscriptionPlanByPriceId(priceId: string): Promise<SubscriptionPlan | undefined>;
  updateUser(userId: string, updates: Partial<UpsertUser>): Promise<User>;
  
  getUserSubscriptionStatus(userId: string): Promise<{
    hasActiveSubscription: boolean;
    tier: SubscriptionTier | null;
    status: SubscriptionStatus | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: Date | null;
  }>;

  // Subscription history
  createSubscriptionHistory(history: InsertSubscriptionHistory): Promise<SubscriptionHistory>;
  getSubscriptionHistory(userId: string): Promise<SubscriptionHistory[]>;

  // AI Usage Tracking
  getOrCreateAiUsage(userId: string, month: string): Promise<AiUsageTracking>;
  incrementAiUsage(userId: string): Promise<{ success: boolean; remaining: number; limit: number }>;
  getAiUsageForMonth(userId: string, month: string): Promise<AiUsageTracking | undefined>;
  resetMonthlyAiUsage(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Helper method to convert null values to undefined for compatibility with TypeScript types
  private convertNullToUndefined<T extends Record<string, any>>(obj: T): DrivingForce {
    const result = { ...obj } as any;
    for (const key in result) {
      if (result[key] === null) {
        result[key] = undefined;
      }
    }
    return result as DrivingForce;
  }

  // User operations (MANDATORY for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async createUser(userData: Partial<User>): Promise<User> {
    const [user] = await db.insert(users).values(userData as any).returning();
    
    // NOTE: Project population is deferred to first login for better registration UX
    // This prevents the heavy project population (90k+ forces) from blocking registration
    // The project will be created when the user first accesses the system after email verification
    
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // User onboarding
  async ensureUserDefaultProject(userId: string): Promise<Project> {
    // Check if user already has a default project
    const [existingDefault] = await db.select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.isDefault, true)))
      .limit(1);

    if (existingDefault) {
      return existingDefault;
    }

    // Create a default project for the user (starts empty - no force duplication)
    const [defaultProject] = await db.insert(projects).values({
      userId,
      name: "My ORION Project",
      description: "Your personal strategic intelligence workspace - select forces from the ORION Global Dataset",
      isDefault: true,
    }).returning();

    // REMOVED: Auto-population disabled to prevent force duplication
    // Users will access forces from the global default project based on their subscription tier
    // They can duplicate specific forces to their projects when needed

    return defaultProject;
  }

  // Helper method to populate a project with forces based on subscription tier
  private async populateProjectWithTierForces(projectId: string, tier: 'basic' | 'professional' | 'enterprise'): Promise<void> {
    // Get the main default project that contains all forces
    const mainDefaultProject = await this.ensureDefaultProject();
    
    // Define force type filters based on tier
    let forceTypeFilter;
    if (tier === 'basic') {
      // Basic: Only curated forces (M, T, WS, WC) - no signals
      forceTypeFilter = ['M', 'T', 'WS', 'WC'];
    } else {
      // Professional/Enterprise: All forces including signals
      forceTypeFilter = ['M', 'T', 'WS', 'WC', 'S'];
    }
    
    // Get forces from main default project that match the tier restrictions
    const forcesToCopy = await db.select()
      .from(drivingForces)
      .where(and(
        eq(drivingForces.projectId, mainDefaultProject.id),
        inArray(drivingForces.type, forceTypeFilter)
      ));
    
    if (forcesToCopy.length > 0) {
      // Copy forces to the user's project
      const newForces = forcesToCopy.map((force: any) => ({
        ...force,
        id: undefined, // Let database generate new ID
        projectId: projectId,
        clusterId: undefined, // Clear cluster assignments for new project
        clusterLabel: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Insert forces in batches to avoid SQL parameter limits
      const batchSize = 150;
      const totalBatches = Math.ceil(newForces.length / batchSize);
      
      console.log(`[populateProjectWithTierForces] Populating project ${projectId} with ${newForces.length} ${tier} tier forces in ${totalBatches} batches`);
      
      for (let i = 0; i < totalBatches; i++) {
        const startIndex = i * batchSize;
        const endIndex = Math.min(startIndex + batchSize, newForces.length);
        const batch = newForces.slice(startIndex, endIndex);
        
        await db.insert(drivingForces).values(batch);
      }
      
      console.log(`[populateProjectWithTierForces] Successfully populated project ${projectId} with ${newForces.length} forces for ${tier} tier`);
    }
  }

  // Projects
  async ensureDefaultProject(): Promise<Project> {
    console.log('[ensureDefaultProject] Starting default project validation...');
    
    // Get total force count for verification
    const [totalForceCount] = await db.select({ count: sql<number>`count(*)` }).from(drivingForces);
    const totalForces = totalForceCount?.count || 0;
    console.log(`[ensureDefaultProject] Total forces in database: ${totalForces}`);
    
    // Find all default projects
    const defaultProjects = await db.select()
      .from(projects)
      .where(eq(projects.isDefault, true))
      .orderBy(desc(projects.createdAt));

    if (defaultProjects.length === 0) {
      console.log('[ensureDefaultProject] No default project found, creating one...');
      
      // Create the default project first
      const [defaultProject] = await db.insert(projects).values({
        name: "New Project",
        description: "Default project containing all ORION strategic intelligence forces",
        isDefault: true,
      }).returning();

      // Assign ALL forces to the default project (only NULL project_id forces)
      // This is more efficient than nested SELECT queries
      const result = await db.update(drivingForces)
        .set({ projectId: defaultProject.id, updatedAt: new Date() })
        .where(sql`project_id IS NULL`);
      
      const movedCount = result.rowCount || 0;
      console.log(`[ensureDefaultProject] Moved ${movedCount} forces to new default project`);
      
      // Verify all forces are now assigned
      const [assignedCount] = await db.select({ count: sql<number>`count(*)` })
        .from(drivingForces)
        .where(eq(drivingForces.projectId, defaultProject.id));
      
      const assignedForces = assignedCount?.count || 0;
      console.log(`[ensureDefaultProject] Default project now contains ${assignedForces}/${totalForces} forces`);
      
      if (assignedForces !== totalForces) {
        console.warn(`[ensureDefaultProject] WARNING: Force count mismatch! Expected ${totalForces}, got ${assignedForces}`);
      }

      console.log(`[ensureDefaultProject] Created default project: ${defaultProject.id}`);
      return defaultProject;
    }

    if (defaultProjects.length === 1) {
      const defaultProject = defaultProjects[0];
      console.log(`[ensureDefaultProject] Found exactly one default project: ${defaultProject.id}`);
      
      // Verify this default project contains all forces
      const [assignedCount] = await db.select({ count: sql<number>`count(*)` })
        .from(drivingForces)
        .where(eq(drivingForces.projectId, defaultProject.id));
      
      const assignedForces = assignedCount?.count || 0;
      console.log(`[ensureDefaultProject] Default project contains ${assignedForces}/${totalForces} forces`);
      
      // If default project is missing forces, assign all orphaned forces to it
      if (assignedForces < totalForces) {
        console.log(`[ensureDefaultProject] Fixing orphaned forces - assigning to default project`);
        
        // Only assign forces with NULL project_id - more efficient query
        const result = await db.update(drivingForces)
          .set({ projectId: defaultProject.id, updatedAt: new Date() })
          .where(sql`project_id IS NULL`);
        
        const movedCount = result.rowCount || 0;
        console.log(`[ensureDefaultProject] Moved ${movedCount} orphaned forces to default project`);
        
        // Re-verify
        const [newAssignedCount] = await db.select({ count: sql<number>`count(*)` })
          .from(drivingForces)
          .where(eq(drivingForces.projectId, defaultProject.id));
        
        const newAssignedForces = newAssignedCount?.count || 0;
        console.log(`[ensureDefaultProject] Default project now contains ${newAssignedForces}/${totalForces} forces`);
      }
      
      return defaultProject;
    }

    // Multiple defaults found - keep the newest one and migrate all forces
    console.log(`[ensureDefaultProject] Found ${defaultProjects.length} default projects, consolidating...`);
    
    const [newestDefault, ...oldDefaults] = defaultProjects;
    const oldDefaultIds = oldDefaults.map(p => p.id);
    
    console.log(`[ensureDefaultProject] Keeping newest default: ${newestDefault.id}`);
    console.log(`[ensureDefaultProject] Migrating forces from old defaults: ${oldDefaultIds.join(', ')}`);
    
    // Migrate all forces from old defaults to the newest default
    const migrationResult = await db.update(drivingForces)
      .set({ projectId: newestDefault.id, updatedAt: new Date() })
      .where(inArray(drivingForces.projectId, oldDefaultIds));
    
    const migratedCount = migrationResult.rowCount || 0;
    console.log(`[ensureDefaultProject] Migrated ${migratedCount} forces from old defaults`);
    
    // Also assign any orphaned forces to the kept default (only NULL project_id)
    const orphanResult = await db.update(drivingForces)
      .set({ projectId: newestDefault.id, updatedAt: new Date() })
      .where(sql`project_id IS NULL`);
    
    const orphanCount = orphanResult.rowCount || 0;
    if (orphanCount > 0) {
      console.log(`[ensureDefaultProject] Also moved ${orphanCount} orphaned forces to default`);
    }
    
    // Set old defaults to isDefault = false
    await db.update(projects)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(inArray(projects.id, oldDefaultIds));
    
    console.log(`[ensureDefaultProject] Set ${oldDefaults.length} old defaults to non-default`);
    
    // Final verification
    const [finalCount] = await db.select({ count: sql<number>`count(*)` })
      .from(drivingForces)
      .where(eq(drivingForces.projectId, newestDefault.id));
    
    const finalForces = finalCount?.count || 0;
    console.log(`[ensureDefaultProject] Final verification: default project contains ${finalForces}/${totalForces} forces`);
    
    if (finalForces !== totalForces) {
      console.error(`[ensureDefaultProject] CRITICAL: Force count mismatch after consolidation! Expected ${totalForces}, got ${finalForces}`);
    }
    
    return newestDefault;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async getProjects(): Promise<Project[]> {
    // Order with default first, then by creation date (newest first)
    return await db.select().from(projects).orderBy(desc(projects.isDefault), desc(projects.createdAt));
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
    // Return projects owned by the specified user, ordered with default first
    return await db.select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.isDefault), desc(projects.createdAt));
  }

  /**
   * Initialize a project with driving forces based on its type
   * Must be called within a transaction
   * DISABLED: Force copying removed to prevent database duplication
   * All projects now start empty - users select forces manually
   */
  private async initializeProjectByType(
    tx: any, // Transaction object
    projectId: string, 
    projectType: "full_orion" | "megatrends" | "early_warning" | "new_project"
  ): Promise<number> {
    // ALL projects now start empty - no force duplication
    // Users will access forces from the global default project based on their subscription tier
    console.log(`[initializeProjectByType] Project ${projectId} initialized as ${projectType} (empty - no force duplication)`);
    return 0;
  }

  async createProject(project: InsertProject): Promise<Project> {
    // Strip isDefault flag - only server can set this through ensureDefaultProject
    const { isDefault, ...projectData } = project;
    
    // Use database transaction to ensure atomicity
    try {
      const result = await db.transaction(async (tx) => {
        console.log(`[createProject] Starting transaction for project: ${projectData.name}`);
        
        // Check for duplicate names (case-insensitive) within transaction
        const existingProjects = await tx.select().from(projects)
          .where(sql`LOWER(name) = LOWER(${projectData.name})`);
        
        if (existingProjects.length > 0) {
          throw new Error("DUPLICATE_NAME");
        }

        // Create project with isDefault always false (only ensureDefaultProject can create default)
        const [created] = await tx.insert(projects).values({
          ...projectData,
          isDefault: false,
        }).returning();
        
        if (!created) {
          throw new Error("Failed to create project");
        }
        
        console.log(`[createProject] Project created in DB: ${created.id} - ${created.name}`);
        
        // Initialize project with forces based on its type (within same transaction)
        const forcesCount = await this.initializeProjectByType(tx, created.id, projectData.projectType || "new_project");
        
        console.log(`[createProject] Transaction completed successfully: ${created.id} - ${created.name} (type: ${projectData.projectType || "new_project"}) with ${forcesCount} forces`);
        return { project: created, forcesCount };
      });
      
      return result.project;
      
    } catch (error: any) {
      console.error(`[createProject] Transaction failed for project "${projectData.name}":`, error.message);
      
      // Re-throw known errors with same message for proper HTTP status codes
      if (error.message === "DUPLICATE_NAME") {
        throw error;
      }
      
      // Wrap other errors to provide better context
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project> {
    // Strip isDefault flag - only server can modify this through ensureDefaultProject
    const { isDefault, ...projectData } = project;
    
    // If name is being changed, check for duplicates (case-insensitive)
    if (projectData.name) {
      const existingProjects = await db.select().from(projects)
        .where(and(
          sql`LOWER(name) = LOWER(${projectData.name})`,
          ne(projects.id, id) // Exclude the current project
        ));
      
      if (existingProjects.length > 0) {
        throw new Error("DUPLICATE_NAME");
      }
    }

    const [updated] = await db
      .update(projects)
      .set({ ...projectData, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    
    if (!updated) {
      throw new Error("Project not found");
    }
    
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    try {
      // First, check if the project exists
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      if (!project) {
        return false; // Project not found - will result in 404 response
      }
      
      // Check if this is a default project
      if (project.isDefault) {
        throw new Error("Cannot delete default project"); // Will result in 403 response
      }
      
      console.log(`[deleteProject] Starting cascade deletion for project: ${id} - ${project.name}`);
      
      // Cascade delete all related entities in the correct order
      // Delete in order from most dependent to least dependent to avoid foreign key constraints
      
      // 1. Delete saved searches
      const savedSearchesResult = await db.delete(savedSearches).where(eq(savedSearches.projectId, id));
      console.log(`[deleteProject] Deleted ${savedSearchesResult.rowCount || 0} saved searches`);
      
      // 2. Delete reports
      const reportsResult = await db.delete(reports).where(eq(reports.projectId, id));
      console.log(`[deleteProject] Deleted ${reportsResult.rowCount || 0} reports`);
      
      // 3. Delete workspaces
      const workspacesResult = await db.delete(workspaces).where(eq(workspaces.projectId, id));
      console.log(`[deleteProject] Deleted ${workspacesResult.rowCount || 0} workspaces`);
      
      // 4. Delete clustering reports
      const clusteringReportsResult = await db.delete(clusteringReports).where(eq(clusteringReports.projectId, id));
      console.log(`[deleteProject] Deleted ${clusteringReportsResult.rowCount || 0} clustering reports`);
      
      // 5. Delete clusters 
      const clustersResult = await db.delete(clusters).where(eq(clusters.projectId, id));
      console.log(`[deleteProject] Deleted ${clustersResult.rowCount || 0} clusters`);
      
      // 6. Delete driving forces
      const drivingForcesResult = await db.delete(drivingForces).where(eq(drivingForces.projectId, id));
      console.log(`[deleteProject] Deleted ${drivingForcesResult.rowCount || 0} driving forces`);
      
      // 7. Finally, delete the project itself
      const projectResult = await db.delete(projects).where(eq(projects.id, id));
      console.log(`[deleteProject] Deleted project: ${project.name}`);
      
      return projectResult.rowCount! > 0;
      
    } catch (error: any) {
      // Re-throw known errors for proper HTTP status codes
      if (error.message === "Cannot delete default project") {
        throw error;
      }
      
      // Log unexpected errors and provide generic message to prevent 500 errors
      console.error(`[deleteProject] Unexpected error deleting project ${id}:`, error);
      throw new Error("Failed to delete project due to database constraints");
    }
  }

  async duplicateProject(id: string, newName: string, selectedForceIds?: string[]): Promise<Project> {
    // Get the original project
    const [originalProject] = await db.select().from(projects).where(eq(projects.id, id));
    if (!originalProject) {
      throw new Error("Project not found");
    }

    // Prevent full-copy duplication from default project
    if (originalProject.isDefault && (!selectedForceIds || selectedForceIds.length === 0)) {
      throw new Error("FULL_COPY_FROM_DEFAULT_FORBIDDEN");
    }

    // Check for duplicate names (case-insensitive)
    const existingProjects = await db.select().from(projects)
      .where(sql`LOWER(name) = LOWER(${newName})`);
    
    if (existingProjects.length > 0) {
      throw new Error("DUPLICATE_NAME");
    }

    // Create new project (not default)
    const [newProject] = await db.insert(projects).values({
      name: newName,
      description: originalProject.description || "",
      isDefault: false, // Duplicated projects are never default
    }).returning();

    let forcesToCopy;
    
    if (selectedForceIds && selectedForceIds.length > 0) {
      // Selective copying: only copy specified forces
      console.log(`Duplicating project with ${selectedForceIds.length} selected forces`);
      
      // Validate that all selectedForceIds exist in the source project
      const existingForces = await db.select().from(drivingForces)
        .where(and(
          eq(drivingForces.projectId, id),
          inArray(drivingForces.id, selectedForceIds)
        ));
      
      if (existingForces.length !== selectedForceIds.length) {
        const foundIds = existingForces.map(f => f.id);
        const missingIds = selectedForceIds.filter(id => !foundIds.includes(id));
        throw new Error(`Some selected forces not found in project: ${missingIds.join(', ')}`);
      }
      
      forcesToCopy = existingForces;
      
      // When copying selected forces, do NOT copy clusters 
      // as they would be invalid with partial forces
      console.log('Skipping cluster copying for selective duplication');
    } else {
      // Full project duplication: copy all forces
      console.log('Duplicating entire project (all forces)');
      
      forcesToCopy = await db.select().from(drivingForces)
        .where(eq(drivingForces.projectId, id));
      
      // Copy clusters only when duplicating all forces
      const originalClusters = await db.select().from(clusters)
        .where(eq(clusters.projectId, id));
      
      if (originalClusters.length > 0) {
        const newClusters = originalClusters.map(cluster => ({
          ...cluster,
          id: undefined, // Let database generate new ID
          projectId: newProject.id,
          createdAt: new Date(),
        }));
        
        await db.insert(clusters).values(newClusters);
        console.log(`Copied ${originalClusters.length} clusters`);
      }
    }
    
    // Copy the determined forces
    if (forcesToCopy.length > 0) {
      const newForces = forcesToCopy.map(force => ({
        ...force,
        id: undefined, // Let database generate new ID
        projectId: newProject.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      // Insert forces in batches to avoid SQL parameter limits
      const batchSize = 150;
      const totalBatches = Math.ceil(newForces.length / batchSize);
      let insertedCount = 0;
      
      console.log(`Inserting ${newForces.length} forces in ${totalBatches} batches of ${batchSize}`);
      
      for (let i = 0; i < totalBatches; i++) {
        const startIndex = i * batchSize;
        const endIndex = Math.min(startIndex + batchSize, newForces.length);
        const batch = newForces.slice(startIndex, endIndex);
        
        try {
          await db.insert(drivingForces).values(batch);
          insertedCount += batch.length;
          console.log(`Batch ${i + 1}/${totalBatches}: Inserted ${batch.length} forces (${insertedCount}/${newForces.length} total)`);
        } catch (error: any) {
          console.error(`Failed to insert batch ${i + 1}/${totalBatches}:`, error.message);
          throw new Error(`Failed to insert driving forces batch ${i + 1}: ${error.message}`);
        }
      }
      
      console.log(`Copied ${insertedCount} driving forces`);
    } else {
      console.log('No forces to copy');
    }

    return newProject;
  }

  // Driving Forces
  async getDrivingForce(id: string): Promise<DrivingForce | undefined> {
    const [force] = await db.select().from(drivingForces).where(eq(drivingForces.id, id));
    if (!force) return undefined;
    return this.convertNullToUndefined(force);
  }

  async getDrivingForces(
    projectId?: string, 
    lens?: string, 
    filters?: any,
    options: {
      limit?: number;
      offset?: number;
      includeEmbeddings?: boolean;
      includeSignals?: boolean;
      forceTypeRestrictions?: string[] | null;
    } = {}
  ): Promise<{ forces: DrivingForce[], total: number }> {
    const { limit = 10000, offset = 0, includeEmbeddings = false, includeSignals = false, forceTypeRestrictions = null } = options;
    
    // Fallback logic: if user project is specified, check if it has forces
    // If empty, fallback to global default project with tier restrictions
    let effectiveProjectId = projectId;
    
    if (projectId) {
      const [projectForceCount] = await db.select({ count: sql<number>`count(*)` })
        .from(drivingForces)
        .where(eq(drivingForces.projectId, projectId));
      
      const forceCount = Number(projectForceCount?.count || 0);
      console.log(`[getDrivingForces] Project ${projectId} has ${forceCount} forces`);
      
      if (forceCount === 0) {
        // User project is empty - fallback to global default project
        const defaultProject = await this.ensureDefaultProject();
        effectiveProjectId = defaultProject.id;
        console.log(`[getDrivingForces] Project is empty - falling back to global default project ${effectiveProjectId}`);
      }
    }
    
    // Build base query conditions
    const conditions = [];
    if (effectiveProjectId) {
      conditions.push(eq(drivingForces.projectId, effectiveProjectId));
    }
    if (filters?.steep) {
      conditions.push(eq(drivingForces.steep, filters.steep));
    }
    if (filters?.type) {
      conditions.push(eq(drivingForces.type, filters.type));
    }
    
    // Map lens parameter to type filtering (use abbreviated codes)
    if (lens) {
      if (lens === 'megatrends') {
        conditions.push(eq(drivingForces.type, 'M'));
      } else if (lens === 'trends') {
        conditions.push(eq(drivingForces.type, 'T'));
      } else if (lens === 'weak_signals') {
        // Handle both Weak Signals (WS) and Wildcards (WC) types
        conditions.push(or(
          eq(drivingForces.type, 'WS'), 
          eq(drivingForces.type, 'WC')
        ));
      }
    }
    
    // Apply subscription-based force type restrictions
    if (forceTypeRestrictions && forceTypeRestrictions.length > 0) {
      // Basic tier: restrict to specific types (M, T, WS, WC - exclude S for Signals)
      console.log(`[getDrivingForces] Applying tier restrictions:`, forceTypeRestrictions);
      conditions.push(inArray(drivingForces.type, forceTypeRestrictions));
    } else if (!includeSignals) {
      // When includeSignals is false (default), filter out signals (type 'S')
      // When includeSignals is true, include all types including signals
      console.log(`[getDrivingForces] Excluding signals (type 'S')`);
      conditions.push(ne(drivingForces.type, 'S'));
    } else {
      console.log(`[getDrivingForces] Including all types including signals`);
    }
    
    console.log(`[getDrivingForces] Using effectiveProjectId: ${effectiveProjectId}, conditions count: ${conditions.length}`);
    
    // Create the where condition once
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;
    
    
    // Build queries based on whether we need embeddings or not
    if (includeEmbeddings) {
      // Include all fields including embedding vectors
      const baseQuery = db.select().from(drivingForces);
      const baseCountQuery = db.select({ count: sql<number>`count(*)` }).from(drivingForces);
      
      // Apply conditions and execute queries
      const [forces, totalResult] = await Promise.all([
        whereCondition 
          ? baseQuery.where(whereCondition).orderBy(desc(drivingForces.createdAt)).limit(limit).offset(offset)
          : baseQuery.orderBy(desc(drivingForces.createdAt)).limit(limit).offset(offset),
        whereCondition 
          ? baseCountQuery.where(whereCondition)
          : baseCountQuery
      ]);
      
      const total = totalResult[0]?.count || 0;
      
      // Convert null to undefined and attach cluster information to forces
      const convertedForces = forces.map(force => this.convertNullToUndefined(force));
      const forcesWithClusters = await this.attachClusterInfoToForces(convertedForces, projectId);
      
      return { forces: forcesWithClusters, total };
    } else {
      // Exclude embedding vectors for performance
      const selectFields = {
        id: drivingForces.id,
        projectId: drivingForces.projectId,
        title: drivingForces.title,
        type: drivingForces.type,
        steep: drivingForces.steep,
        scope: drivingForces.scope,
        impact: drivingForces.impact,
        ttm: drivingForces.ttm,
        sentiment: drivingForces.sentiment,
        source: drivingForces.source,
        tags: drivingForces.tags,
        text: drivingForces.text,
        embeddingModel: drivingForces.embeddingModel,
        // Radar visualization fields
        magnitude: drivingForces.magnitude,
        distance: drivingForces.distance,
        colorHex: drivingForces.colorHex,
        feasibility: drivingForces.feasibility,
        urgency: drivingForces.urgency,
        createdAt: drivingForces.createdAt,
        updatedAt: drivingForces.updatedAt,
      };
      
      const baseQuery = db.select(selectFields).from(drivingForces);
      const baseCountQuery = db.select({ count: sql<number>`count(*)` }).from(drivingForces);
      
      // Apply conditions and execute queries
      const [forces, totalResult] = await Promise.all([
        whereCondition 
          ? baseQuery.where(whereCondition).orderBy(desc(drivingForces.createdAt)).limit(limit).offset(offset)
          : baseQuery.orderBy(desc(drivingForces.createdAt)).limit(limit).offset(offset),
        whereCondition 
          ? baseCountQuery.where(whereCondition)
          : baseCountQuery
      ]);
      
      const total = totalResult[0]?.count || 0;
      
      // Convert null to undefined and attach cluster information to forces
      const convertedForces = forces.map(force => this.convertNullToUndefined(force));
      const forcesWithClusters = await this.attachClusterInfoToForces(convertedForces, projectId);
      
      return { forces: forcesWithClusters, total };
    }
  }

  // Helper method to attach cluster information to driving forces
  private async attachClusterInfoToForces(forces: DrivingForce[], projectId?: string): Promise<DrivingForce[]> {
    if (!projectId || forces.length === 0) {
      return forces;
    }

    try {
      // Get all clusters for the project
      const projectClusters = await this.getClusters(projectId);
      
      // Create a map from force ID to cluster info
      const forceToClusterMap = new Map<string, { clusterId: string; clusterLabel: string }>();
      
      for (const cluster of projectClusters) {
        if (cluster.forceIds && Array.isArray(cluster.forceIds)) {
          for (const forceId of cluster.forceIds) {
            forceToClusterMap.set(forceId, {
              clusterId: cluster.id,
              clusterLabel: cluster.label
            });
          }
        }
      }
      
      // Attach cluster info to each force
      return forces.map(force => {
        const clusterInfo = forceToClusterMap.get(force.id!);
        return {
          ...force,
          clusterId: clusterInfo?.clusterId,
          clusterLabel: clusterInfo?.clusterLabel
        };
      });
    } catch (error) {
      console.error('Error attaching cluster info to forces:', error);
      // Return forces without cluster info if there's an error
      return forces;
    }
  }

  async createDrivingForce(force: InsertDrivingForce): Promise<DrivingForce> {
    const [created] = await db.insert(drivingForces).values(force).returning();
    return this.convertNullToUndefined(created);
  }

  async createDrivingForces(forces: InsertDrivingForce[]): Promise<DrivingForce[]> {
    if (forces.length === 0) {
      return [];
    }
    
    // For small batches, insert directly
    if (forces.length <= 150) {
      const created = await db.insert(drivingForces).values(forces).returning();
      return created.map(force => this.convertNullToUndefined(force));
    }
    
    // For large batches, use batch insertion
    const batchSize = 150;
    const totalBatches = Math.ceil(forces.length / batchSize);
    const allCreated: DrivingForce[] = [];
    
    console.log(`Creating ${forces.length} forces in ${totalBatches} batches of ${batchSize}`);
    
    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, forces.length);
      const batch = forces.slice(startIndex, endIndex);
      
      try {
        const batchCreated = await db.insert(drivingForces).values(batch).returning();
        allCreated.push(...batchCreated.map(force => this.convertNullToUndefined(force)));
        console.log(`Batch ${i + 1}/${totalBatches}: Created ${batch.length} forces (${allCreated.length}/${forces.length} total)`);
      } catch (error: any) {
        console.error(`Failed to create batch ${i + 1}/${totalBatches}:`, error.message);
        throw new Error(`Failed to create driving forces batch ${i + 1}: ${error.message}`);
      }
    }
    
    return allCreated;
  }

  async getDrivingForcesByIds(
    ids: string[],
    projectId?: string,
    options: {
      includeEmbeddings?: boolean;
      includeSignals?: boolean;
    } = {}
  ): Promise<{ forces: DrivingForce[], notFound: string[] }> {
    const { includeEmbeddings = false, includeSignals = false } = options;
    
    if (ids.length === 0) {
      return { forces: [], notFound: [] };
    }
    
    // Fallback logic: if user project is specified, check if it has forces
    // If empty, fallback to global default project
    let effectiveProjectId = projectId;
    
    if (projectId) {
      const [projectForceCount] = await db.select({ count: sql<number>`count(*)` })
        .from(drivingForces)
        .where(eq(drivingForces.projectId, projectId));
      
      const forceCount = Number(projectForceCount?.count || 0);
      
      if (forceCount === 0) {
        // User project is empty - fallback to global default project
        console.log(`[getDrivingForcesByIds] Project ${projectId} is empty, falling back to global default project`);
        const defaultProject = await this.ensureDefaultProject();
        effectiveProjectId = defaultProject.id;
      }
    }
    
    // Build base query conditions
    const conditions = [inArray(drivingForces.id, ids)];
    
    // Add project validation if projectId is provided
    if (effectiveProjectId) {
      conditions.push(eq(drivingForces.projectId, effectiveProjectId));
    }
    
    // Filter out signals if includeSignals is false (default)
    if (!includeSignals) {
      conditions.push(ne(drivingForces.type, 'S'));
    }
    
    const whereCondition = and(...conditions);
    
    // Build query based on whether we need embeddings
    let forces: any[] = [];
    if (includeEmbeddings) {
      // Include all fields including embedding vectors
      forces = await db.select().from(drivingForces).where(whereCondition);
    } else {
      // Exclude embedding vectors for performance
      const selectFields = {
        id: drivingForces.id,
        projectId: drivingForces.projectId,
        title: drivingForces.title,
        type: drivingForces.type,
        steep: drivingForces.steep,
        scope: drivingForces.scope,
        impact: drivingForces.impact,
        ttm: drivingForces.ttm,
        sentiment: drivingForces.sentiment,
        source: drivingForces.source,
        tags: drivingForces.tags,
        text: drivingForces.text,
        embeddingModel: drivingForces.embeddingModel,
        // Radar visualization fields
        magnitude: drivingForces.magnitude,
        distance: drivingForces.distance,
        colorHex: drivingForces.colorHex,
        feasibility: drivingForces.feasibility,
        urgency: drivingForces.urgency,
        createdAt: drivingForces.createdAt,
        updatedAt: drivingForces.updatedAt,
      };
      forces = await db.select(selectFields).from(drivingForces).where(whereCondition);
    }
    
    // Convert null to undefined and attach cluster information
    const convertedForces = forces.map(force => this.convertNullToUndefined(force));
    const forcesWithClusters = await this.attachClusterInfoToForces(convertedForces, projectId);
    
    // Determine which IDs were not found
    const foundIds = new Set(forcesWithClusters.map(f => f.id));
    const notFound = ids.filter(id => !foundIds.has(id));
    
    return { forces: forcesWithClusters, notFound };
  }

  async updateDrivingForce(id: string, force: Partial<InsertDrivingForce>): Promise<DrivingForce> {
    const [updated] = await db
      .update(drivingForces)
      .set({ ...force, updatedAt: new Date() })
      .where(eq(drivingForces.id, id))
      .returning();
    return this.convertNullToUndefined(updated);
  }

  async deleteDrivingForce(id: string): Promise<boolean> {
    const result = await db.delete(drivingForces).where(eq(drivingForces.id, id));
    return result.rowCount! > 0;
  }

  // Clusters
  async getCluster(id: string): Promise<Cluster | undefined> {
    const [cluster] = await db.select().from(clusters).where(eq(clusters.id, id));
    return cluster || undefined;
  }

  async getClusters(projectId: string, method?: string): Promise<Cluster[]> {
    // Build query conditions
    const conditions = [eq(clusters.projectId, projectId)];
    
    // Add method filter if specified
    if (method) {
      conditions.push(eq(clusters.method, method));
    }
    
    return await db.select().from(clusters)
      .where(and(...conditions))
      .orderBy(desc(clusters.createdAt));
  }

  async createCluster(cluster: InsertCluster): Promise<Cluster> {
    try {
      console.log("Creating single cluster:", {
        projectId: cluster.projectId,
        label: cluster.label,
        method: cluster.method,
        size: cluster.size
      });
      
      // Validate single cluster
      if (!cluster.projectId || !cluster.label || !cluster.method || !cluster.size) {
        throw new Error("Cluster validation failed: missing required fields");
      }
      
      if (!Array.isArray(cluster.forceIds)) {
        throw new Error("Cluster validation failed: forceIds must be an array");
      }
      
      const [created] = await db.insert(clusters).values(cluster).returning();
      console.log("Successfully created cluster:", created.id);
      return created;
    } catch (error) {
      console.error("Failed to create cluster:", error);
      console.error("Cluster data:", cluster);
      throw new Error(`Cluster creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateCluster(id: string, cluster: Partial<InsertCluster>): Promise<Cluster> {
    const [updated] = await db
      .update(clusters)
      .set(cluster)
      .where(eq(clusters.id, id))
      .returning();
    return updated;
  }

  async createClusters(clusterList: InsertCluster[]): Promise<Cluster[]> {
    if (clusterList.length === 0) {
      console.log("No clusters to create - empty cluster list");
      return [];
    }
    
    const startTime = Date.now();
    console.log(`Creating ${clusterList.length} clusters in database with batched insertion`);
    
    try {
      // Enhanced validation with detailed field checking
      for (let i = 0; i < clusterList.length; i++) {
        const cluster = clusterList[i];
        
        // Check required fields
        if (!cluster.projectId || !cluster.label || !cluster.method || cluster.size === undefined || cluster.size === null) {
          console.error(`Cluster validation failed at index ${i}:`, {
            projectId: cluster.projectId,
            label: cluster.label,
            method: cluster.method,
            size: cluster.size,
            hasParams: !!cluster.params,
            forceIdsLength: Array.isArray(cluster.forceIds) ? cluster.forceIds.length : 'not_array'
          });
          throw new Error(`Cluster validation failed at index ${i}: missing required fields (projectId, label, method, or size)`);
        }
        
        // Validate forceIds array
        if (!Array.isArray(cluster.forceIds)) {
          console.error(`Cluster forceIds validation failed at index ${i}:`, {
            forceIds: cluster.forceIds,
            type: typeof cluster.forceIds
          });
          throw new Error(`Cluster validation failed at index ${i}: forceIds must be an array, got ${typeof cluster.forceIds}`);
        }
        
        if (cluster.forceIds.length === 0) {
          console.error(`Cluster has empty forceIds at index ${i}:`, cluster.label);
          throw new Error(`Cluster validation failed at index ${i}: forceIds array cannot be empty`);
        }
        
        // Validate centroid array if provided
        if (cluster.centroid !== undefined && cluster.centroid !== null && !Array.isArray(cluster.centroid)) {
          console.error(`Cluster centroid validation failed at index ${i}:`, {
            centroid: cluster.centroid,
            type: typeof cluster.centroid
          });
          throw new Error(`Cluster validation failed at index ${i}: centroid must be an array or null`);
        }
        
        // Ensure numeric fields are valid
        if (typeof cluster.size !== 'number' || cluster.size < 1) {
          throw new Error(`Cluster validation failed at index ${i}: size must be a positive number, got ${cluster.size}`);
        }
        
        // Validate quality metrics if provided
        const numericFields = ['silhouetteScore', 'cohesion', 'separation', 'inertia'];
        for (const field of numericFields) {
          const value = cluster[field as keyof InsertCluster];
          if (value !== undefined && value !== null && (typeof value !== 'number' || isNaN(value))) {
            throw new Error(`Cluster validation failed at index ${i}: ${field} must be a valid number, got ${value}`);
          }
        }
      }
      
      console.log(`All ${clusterList.length} clusters passed validation in ${Date.now() - startTime}ms`);
      
      // Implement batch insertion with proper database insert loop
      const BATCH_SIZE = 10;
      const allResults: Cluster[] = [];
      
      console.log(`Inserting ${clusterList.length} clusters in batches of ${BATCH_SIZE}`);
      
      // Actual batch insert loop
      for (let i = 0; i < clusterList.length; i += BATCH_SIZE) {
        const batch = clusterList.slice(i, i + BATCH_SIZE);
        console.log(`Inserting batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} clusters`);
        
        try {
          // Perform database insert for this batch
          const results = await db.insert(clusters).values(batch).returning();
          console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${results.length} clusters inserted`);
          
          if (results.length !== batch.length) {
            throw new Error(`Batch insertion failed: expected ${batch.length} clusters, got ${results.length}`);
          }
          
          allResults.push(...results);
          
        } catch (batchError) {
          console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, {
            error: batchError instanceof Error ? batchError.message : String(batchError),
            batchSize: batch.length,
            startIndex: i
          });
          throw new Error(`Database insert failed for batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
        }
      }
      
      const totalTime = Date.now() - startTime;
      console.log(`SUCCESS: Created ${allResults.length} clusters in database in ${totalTime}ms`);
      console.log(`Cluster IDs:`, allResults.map(c => c.id));
      
      // Final validation: Ensure all clusters were inserted correctly
      if (allResults.length !== clusterList.length) {
        throw new Error(`Total insertion mismatch: expected ${clusterList.length} clusters, got ${allResults.length}`);
      }
      
      return allResults;
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("CRITICAL: Cluster persistence failed", {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        clusterCount: clusterList.length,
        timeElapsed: totalTime
      });
      
      throw new Error(`Cluster persistence failed after ${totalTime}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteCluster(id: string): Promise<boolean> {
    const result = await db.delete(clusters).where(eq(clusters.id, id));
    return result.rowCount! > 0;
  }

  async deleteClustersByProject(projectId: string): Promise<boolean> {
    const result = await db.delete(clusters).where(eq(clusters.projectId, projectId));
    return result.rowCount! > 0;
  }

  // Clustering Reports
  async getClusteringReport(id: string): Promise<ClusteringReport | undefined> {
    const [report] = await db.select().from(clusteringReports).where(eq(clusteringReports.id, id));
    return report || undefined;
  }

  async getClusteringReports(projectId: string): Promise<ClusteringReport[]> {
    return await db.select().from(clusteringReports)
      .where(eq(clusteringReports.projectId, projectId))
      .orderBy(desc(clusteringReports.createdAt));
  }

  async createClusteringReport(report: InsertClusteringReport): Promise<ClusteringReport> {
    const [created] = await db.insert(clusteringReports).values(report).returning();
    return created;
  }

  async updateClusteringReport(id: string, report: Partial<InsertClusteringReport>): Promise<ClusteringReport> {
    const [updated] = await db
      .update(clusteringReports)
      .set(report)
      .where(eq(clusteringReports.id, id))
      .returning();
    return updated;
  }

  async deleteClusteringReport(id: string): Promise<boolean> {
    const result = await db.delete(clusteringReports).where(eq(clusteringReports.id, id));
    return result.rowCount! > 0;
  }

  // Workspaces
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace || undefined;
  }

  async getWorkspaces(projectId: string): Promise<Workspace[]> {
    return await db.select().from(workspaces)
      .where(eq(workspaces.projectId, projectId))
      .orderBy(desc(workspaces.createdAt));
  }

  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    const [created] = await db.insert(workspaces).values(workspace).returning();
    return created;
  }

  async updateWorkspace(id: string, workspace: Partial<InsertWorkspace>): Promise<Workspace> {
    const [updated] = await db
      .update(workspaces)
      .set(workspace)
      .where(eq(workspaces.id, id))
      .returning();
    return updated;
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    const result = await db.delete(workspaces).where(eq(workspaces.id, id));
    return result.rowCount! > 0;
  }

  // Jobs
  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async getJobs(status?: string): Promise<Job[]> {
    if (status) {
      return await db.select().from(jobs)
        .where(eq(jobs.status, status))
        .orderBy(desc(jobs.createdAt));
    }
    
    return await db.select().from(jobs)
      .orderBy(desc(jobs.createdAt));
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async updateJob(id: string, job: Partial<Job>): Promise<Job> {
    const [updated] = await db
      .update(jobs)
      .set(job)
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  async deleteJob(id: string): Promise<boolean> {
    const result = await db.delete(jobs).where(eq(jobs.id, id));
    return result.rowCount! > 0;
  }

  // Reports
  async getReport(id: string): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report || undefined;
  }

  async getReports(projectId?: string): Promise<Report[]> {
    if (projectId) {
      return await db.select().from(reports)
        .where(eq(reports.projectId, projectId))
        .orderBy(desc(reports.createdAt));
    }
    
    return await db.select().from(reports)
      .orderBy(desc(reports.createdAt));
  }

  async createReport(report: InsertReport): Promise<Report> {
    const [created] = await db.insert(reports).values(report).returning();
    return created;
  }

  async updateReport(id: string, report: Partial<InsertReport>): Promise<Report> {
    const [updated] = await db
      .update(reports)
      .set(report)
      .where(eq(reports.id, id))
      .returning();
    return updated;
  }

  async deleteReport(id: string): Promise<boolean> {
    const result = await db.delete(reports).where(eq(reports.id, id));
    return result.rowCount! > 0;
  }

  // Advanced Search
  async queryForces(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    const { page, pageSize, sort, sortOrder, includeFacets, includeEmbeddings, ...filters } = query;
    
    // Fallback logic: if user project is specified, check if it has forces
    // If empty, fallback to global default project
    let effectiveProjectId = filters.projectId;
    
    if (filters.projectId) {
      const [projectForceCount] = await db.select({ count: sql<number>`count(*)` })
        .from(drivingForces)
        .where(eq(drivingForces.projectId, filters.projectId));
      
      const forceCount = Number(projectForceCount?.count || 0);
      
      if (forceCount === 0) {
        // User project is empty - fallback to global default project
        console.log(`[queryForces] Project ${filters.projectId} is empty, falling back to global default project`);
        const defaultProject = await this.ensureDefaultProject();
        effectiveProjectId = defaultProject.id;
      }
    }
    
    // Build where conditions
    const conditions = [];
    
    // Project filter (use effective project ID)
    if (effectiveProjectId) {
      conditions.push(eq(drivingForces.projectId, effectiveProjectId));
    }
    
    // Type filters (M, T, WS, WC, S)
    if (filters.types && filters.types.length > 0) {
      conditions.push(inArray(drivingForces.type, filters.types));
    }
    
    // STEEP filters
    if (filters.steep && filters.steep.length > 0) {
      conditions.push(inArray(drivingForces.steep, filters.steep));
    }
    
    // Sentiment filters
    if (filters.sentiments && filters.sentiments.length > 0) {
      conditions.push(inArray(drivingForces.sentiment, filters.sentiments));
    }
    
    // Impact range
    if (filters.impactMin !== undefined && filters.impactMax !== undefined) {
      conditions.push(between(drivingForces.impact, filters.impactMin, filters.impactMax));
    } else if (filters.impactMin !== undefined) {
      conditions.push(gte(drivingForces.impact, filters.impactMin));
    } else if (filters.impactMax !== undefined) {
      conditions.push(lte(drivingForces.impact, filters.impactMax));
    }
    
    // Time horizon filters
    if (filters.horizons && filters.horizons.length > 0) {
      conditions.push(inArray(drivingForces.ttm, filters.horizons));
    }
    
    // Source filter
    if (filters.source) {
      conditions.push(ilike(drivingForces.source, `%${filters.source}%`));
    }
    
    // Scope filter
    if (filters.scope) {
      conditions.push(ilike(drivingForces.scope, `%${filters.scope}%`));
    }
    
    // Date range filters
    if (filters.createdAfter) {
      conditions.push(gte(drivingForces.createdAt, new Date(filters.createdAfter)));
    }
    if (filters.createdBefore) {
      conditions.push(lte(drivingForces.createdAt, new Date(filters.createdBefore)));
    }
    
    // Text search with boolean operators (AND, OR) and quoted phrases
    if (filters.q) {
      const searchCondition = this.parseSearchQuery(filters.q);
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }
    
    // Tag filtering - need to handle array fields properly
    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(tag => 
        sql`${drivingForces.tags} @> ARRAY[${tag}]::text[]`
      );
      conditions.push(or(...tagConditions));
    }
    
    // Force IDs filter - for specific force selection (used by radar)
    if (filters.forceIds && filters.forceIds.length > 0) {
      conditions.push(inArray(drivingForces.id, filters.forceIds));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Build sort order
    const sortOrderDir = sortOrder === 'asc' ? asc : desc;
    let orderBy;
    switch (sort) {
      case 'impact':
        orderBy = sortOrderDir(drivingForces.impact);
        break;
      case 'created_at':
        orderBy = sortOrderDir(drivingForces.createdAt);
        break;
      case 'updated_at':
        orderBy = sortOrderDir(drivingForces.updatedAt);
        break;
      case 'title':
        orderBy = sortOrderDir(drivingForces.title);
        break;
      case 'relevance':
      default:
        // For text search, order by relevance (simplified)
        if (filters.q) {
          orderBy = desc(drivingForces.updatedAt); // Fallback to updated date for relevance
        } else {
          orderBy = desc(drivingForces.createdAt);
        }
        break;
    }
    
    // Get total count
    const totalQuery = db.select({ count: count() }).from(drivingForces);
    if (whereClause) {
      totalQuery.where(whereClause);
    }
    const [{ count: total }] = await totalQuery;
    
    // Build main query
    const selectFields = {
      id: drivingForces.id,
      projectId: drivingForces.projectId,
      title: drivingForces.title,
      type: drivingForces.type,
      steep: drivingForces.steep,
      dimension: drivingForces.dimension,
      scope: drivingForces.scope,
      impact: drivingForces.impact,
      ttm: drivingForces.ttm,
      sentiment: drivingForces.sentiment,
      source: drivingForces.source,
      tags: drivingForces.tags,
      text: drivingForces.text,
      clusterId: drivingForces.clusterId,
      clusterLabel: drivingForces.clusterLabel,
      // Radar visualization fields
      magnitude: drivingForces.magnitude,
      distance: drivingForces.distance,
      colorHex: drivingForces.colorHex,
      feasibility: drivingForces.feasibility,
      urgency: drivingForces.urgency,
      createdAt: drivingForces.createdAt,
      updatedAt: drivingForces.updatedAt,
      ...(includeEmbeddings && {
        embeddingVector: drivingForces.embeddingVector,
        embeddingModel: drivingForces.embeddingModel,
      }),
    };
    
    const mainQuery = db
      .select(selectFields)
      .from(drivingForces)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    
    if (whereClause) {
      mainQuery.where(whereClause);
    }
    
    if (orderBy) {
      mainQuery.orderBy(orderBy);
    }
    
    let forces = await mainQuery;
    
    // Attach cluster information if project is specified
    if (filters.projectId && forces.length > 0) {
      forces = await this.attachClusterInfoToForces(forces, filters.projectId) as typeof forces;
    }
    
    // Generate facets if requested
    let facets: FacetCounts | undefined;
    if (includeFacets) {
      facets = await this.generateFacetCounts(filters.projectId, whereClause);
    }
    
    const took = Date.now() - startTime;
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;
    
    return {
      forces: forces.map(force => ({
        ...force,
        scope: force.scope ?? undefined, // Convert null to undefined
        dimension: force.dimension ?? undefined, // Convert null to undefined
        embeddingVector: force.embeddingVector ?? undefined, // Convert null to undefined
        embeddingModel: force.embeddingModel ?? undefined, // Convert null to undefined
        createdAt: force.createdAt.toISOString(),
        updatedAt: force.updatedAt.toISOString(),
        relevanceScore: filters.q ? Math.random() * 0.5 + 0.5 : undefined, // Simplified relevance
      })),
      total,
      page,
      pageSize,
      totalPages,
      hasMore,
      facets,
      took,
    };
  }

  /**
   * Parse search query to handle boolean operators (AND, OR) and quoted phrases
   * Examples:
   * - "artificial intelligence" → exact phrase match
   * - artificial AND intelligence → both terms must be present
   * - AI OR machine → either term can be present
   * - "artificial intelligence" AND blockchain → phrase AND term
   */
  private parseSearchQuery(query: string): any {
    if (!query || !query.trim()) {
      return null;
    }

    const normalizedQuery = query.trim();
    
    // Handle wildcard search - return null to match all records
    if (normalizedQuery === '*') {
      return null;
    }
    
    // If no operators or quotes, treat as simple search (backward compatibility)
    if (!normalizedQuery.includes('AND') && 
        !normalizedQuery.includes('OR') && 
        !normalizedQuery.includes('"')) {
      const searchTerm = `%${normalizedQuery}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    }

    // Handle simple OR queries first (e.g., "term1 OR term2")
    if (normalizedQuery.includes(' OR ')) {
      return this.parseSimpleORQuery(normalizedQuery);
    }
    
    // Handle simple AND queries (e.g., "term1 AND term2") 
    if (normalizedQuery.includes(' AND ')) {
      return this.parseSimpleANDQuery(normalizedQuery);
    }
    
    // Handle quoted phrases
    if (normalizedQuery.includes('"')) {
      return this.parseQuotedQuery(normalizedQuery);
    }
    
    // Fallback to simple search
    const searchTerm = `%${normalizedQuery}%`;
    return or(
      ilike(drivingForces.title, searchTerm),
      ilike(drivingForces.text, searchTerm)
    );
  }
  
  private parseSimpleORQuery(query: string): any {
    const terms = query.split(' OR ').map(term => term.trim()).filter(term => term.length > 0);
    if (terms.length < 2) {
      const searchTerm = `%${query}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    }
    
    const termConditions = terms.map(term => {
      const searchTerm = `%${term}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    });
    
    return termConditions.reduce((acc, condition) => 
      acc ? or(acc, condition) : condition
    );
  }
  
  private parseSimpleANDQuery(query: string): any {
    const terms = query.split(' AND ').map(term => term.trim()).filter(term => term.length > 0);
    if (terms.length < 2) {
      const searchTerm = `%${query}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    }
    
    const termConditions = terms.map(term => {
      const searchTerm = `%${term}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    });
    
    return termConditions.reduce((acc, condition) => 
      acc ? and(acc, condition) : condition
    );
  }
  
  private parseQuotedQuery(query: string): any {
    // Extract quoted phrases
    const phraseRegex = /"([^"]+)"/g;
    const phrases: string[] = [];
    let match;
    
    while ((match = phraseRegex.exec(query)) !== null) {
      phrases.push(match[1]);
    }
    
    if (phrases.length === 0) {
      const searchTerm = `%${query}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    }
    
    // For simplicity, handle single quoted phrase
    if (phrases.length === 1) {
      const searchTerm = `%${phrases[0]}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    }
    
    // Multiple phrases - OR them together
    const phraseConditions = phrases.map(phrase => {
      const searchTerm = `%${phrase}%`;
      return or(
        ilike(drivingForces.title, searchTerm),
        ilike(drivingForces.text, searchTerm)
      );
    });
    
    return phraseConditions.reduce((acc, condition) => 
      acc ? or(acc, condition) : condition
    );
  }

  
  private async generateFacetCounts(projectId?: string, baseWhere?: any): Promise<FacetCounts> {
    const conditions = [];
    if (projectId) {
      conditions.push(eq(drivingForces.projectId, projectId));
    }
    if (baseWhere) {
      conditions.push(baseWhere);
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Get all records for facet calculation
    const query = db.select({
      type: drivingForces.type,
      steep: drivingForces.steep,
      sentiment: drivingForces.sentiment,
      impact: drivingForces.impact,
      ttm: drivingForces.ttm,
      source: drivingForces.source,
      scope: drivingForces.scope,
      tags: drivingForces.tags,
    }).from(drivingForces);
    
    if (whereClause) {
      query.where(whereClause);
    }
    
    const records = await query;
    
    // Calculate facet counts
    const typeCounts: Record<string, number> = {};
    const steepCounts: Record<string, number> = {};
    const sentimentCounts: Record<string, number> = {};
    const horizonCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const scopeCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    
    const impactRanges = {
      "1-3": 0,
      "4-6": 0,
      "7-8": 0,
      "9-10": 0,
    };
    
    records.forEach(record => {
      // Type counts
      if (record.type) {
        typeCounts[record.type] = (typeCounts[record.type] || 0) + 1;
      }
      
      // STEEP counts
      if (record.steep) {
        steepCounts[record.steep] = (steepCounts[record.steep] || 0) + 1;
      }
      
      // Sentiment counts
      if (record.sentiment) {
        sentimentCounts[record.sentiment] = (sentimentCounts[record.sentiment] || 0) + 1;
      }
      
      // Impact ranges
      if (record.impact !== null && record.impact !== undefined) {
        if (record.impact >= 1 && record.impact <= 3) impactRanges["1-3"]++;
        else if (record.impact >= 4 && record.impact <= 6) impactRanges["4-6"]++;
        else if (record.impact >= 7 && record.impact <= 8) impactRanges["7-8"]++;
        else if (record.impact >= 9 && record.impact <= 10) impactRanges["9-10"]++;
      }
      
      // Horizon counts
      if (record.ttm) {
        horizonCounts[record.ttm] = (horizonCounts[record.ttm] || 0) + 1;
      }
      
      // Source counts (top 10 only)
      if (record.source) {
        sourceCounts[record.source] = (sourceCounts[record.source] || 0) + 1;
      }
      
      // Scope counts
      if (record.scope) {
        scopeCounts[record.scope] = (scopeCounts[record.scope] || 0) + 1;
      }
      
      // Tag counts
      if (record.tags && Array.isArray(record.tags)) {
        record.tags.forEach(tag => {
          if (tag) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });
    
    // Limit source and tag counts to top items
    const topSources = Object.entries(sourceCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      
    const topTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    return {
      types: typeCounts,
      steep: steepCounts,
      sentiments: sentimentCounts,
      impactRanges,
      horizons: horizonCounts,
      sources: topSources,
      scopes: scopeCounts,
      tags: topTags,
    };
  }

  // Saved Searches
  async getSavedSearch(id: string): Promise<SavedSearch | undefined> {
    const [search] = await db.select().from(savedSearches).where(eq(savedSearches.id, id));
    return search || undefined;
  }

  async getSavedSearches(projectId: string): Promise<SavedSearch[]> {
    return await db.select().from(savedSearches)
      .where(eq(savedSearches.projectId, projectId))
      .orderBy(desc(savedSearches.createdAt));
  }

  async createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch> {
    const [created] = await db.insert(savedSearches).values(search).returning();
    return created;
  }

  async updateSavedSearch(id: string, search: Partial<InsertSavedSearch>): Promise<SavedSearch> {
    const [updated] = await db
      .update(savedSearches)
      .set({ ...search, updatedAt: new Date() })
      .where(eq(savedSearches.id, id))
      .returning();
    return updated;
  }

  async deleteSavedSearch(id: string): Promise<boolean> {
    const result = await db.delete(savedSearches).where(eq(savedSearches.id, id));
    return result.rowCount! > 0;
  }

  // Optimized paginated force retrieval for clustering with only needed fields
  async getDrivingForcesForClustering(
    projectId: string,
    options: {
      pageSize?: number;
      includeSignals?: boolean;
    } = {}
  ): Promise<{
    totalCount: number;
    getPage: (pageIndex: number) => Promise<Array<{
      id: string;
      title: string;
      text: string;
      embeddingVector?: number[];
    }>>;
  }> {
    const { pageSize = 750, includeSignals = false } = options;
    
    // Build query conditions
    const conditions = [eq(drivingForces.projectId, projectId)];
    
    // Exclude signals by default for better clustering quality
    if (!includeSignals) {
      conditions.push(ne(drivingForces.type, 'S'));
    }
    
    const whereCondition = and(...conditions);
    
    // Get total count first
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drivingForces)
      .where(whereCondition);
    
    const totalCount = countResult?.count || 0;
    
    // Return paginated getter function
    const getPage = async (pageIndex: number) => {
      const offset = pageIndex * pageSize;
      
      // Only select minimal fields needed for clustering
      const forces = await db
        .select({
          id: drivingForces.id,
          title: drivingForces.title,
          text: drivingForces.text,
          embeddingVector: drivingForces.embeddingVector
        })
        .from(drivingForces)
        .where(whereCondition)
        .orderBy(desc(drivingForces.createdAt))
        .limit(pageSize)
        .offset(offset);
      
      return forces.map(f => ({
        ...f,
        embeddingVector: f.embeddingVector ? f.embeddingVector : undefined
      }));
    };
    
    return { totalCount, getPage };
  }

  // Bulk Edit Operations for Enhanced Scanning Assistant
  async getDrivingForcesBulkEditPreview(projectId: string, filters: any): Promise<DrivingForce[]> {
    let conditions = [eq(drivingForces.projectId, projectId)];
    
    // Apply filters to find matching forces
    if (filters.forceIds && filters.forceIds.length > 0) {
      conditions.push(inArray(drivingForces.id, filters.forceIds));
    }
    
    if (filters.steep && filters.steep.length > 0) {
      conditions.push(inArray(drivingForces.steep, filters.steep));
    }
    
    if (filters.type && filters.type.length > 0) {
      conditions.push(inArray(drivingForces.type, filters.type));
    }
    
    if (filters.searchPattern) {
      const searchCondition = or(
        ilike(drivingForces.title, `%${filters.searchPattern}%`),
        ilike(drivingForces.text, `%${filters.searchPattern}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }
    
    let query = db.select().from(drivingForces).where(and(...conditions));
    
    // Apply position and count filters
    if (filters.position === 'first' || filters.position === 'last') {
      const orderDirection = filters.position === 'first' ? asc : desc;
      query = query.orderBy(orderDirection(drivingForces.createdAt));
    } else {
      query = query.orderBy(desc(drivingForces.createdAt));
    }
    
    if (filters.count && filters.count > 0) {
      query = query.limit(filters.count);
    }
    
    const result = await query;
    return result.map(force => this.convertNullToUndefined(force));
  }

  async updateDrivingForcesBulk(projectId: string, filters: any, updates: any): Promise<DrivingForce[]> {
    // First get the forces that match the criteria
    const forcesToUpdate = await this.getDrivingForcesBulkEditPreview(projectId, filters);
    
    if (forcesToUpdate.length === 0) {
      return [];
    }
    
    const forceIds = forcesToUpdate.map(f => f.id);
    
    // Prepare the update object, filtering out undefined values
    const updateData: any = {};
    
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.steep !== undefined) updateData.steep = updates.steep;
    if (updates.scope !== undefined) updateData.scope = updates.scope;
    if (updates.impact !== undefined) updateData.impact = updates.impact;
    if (updates.ttm !== undefined) updateData.ttm = updates.ttm;
    if (updates.sentiment !== undefined) updateData.sentiment = updates.sentiment;
    
    // Always update the timestamp
    updateData.updatedAt = new Date();
    
    // Execute the bulk update
    const result = await db
      .update(drivingForces)
      .set(updateData)
      .where(and(
        eq(drivingForces.projectId, projectId),
        inArray(drivingForces.id, forceIds.filter(id => id !== undefined))
      ))
      .returning();
    
    return result.map(force => this.convertNullToUndefined(force));
  }

  // Subscription Management
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }

  async getSubscriptionPlan(tier: SubscriptionTier): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.tier, tier), eq(subscriptionPlans.isActive, true)));
    return plan;
  }

  async getSubscriptionPlanById(id: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.id, id), eq(subscriptionPlans.isActive, true)));
    return plan;
  }

  async createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [newPlan] = await db.insert(subscriptionPlans).values(plan).returning();
    return newPlan;
  }

  async updateSubscriptionPlan(id: string, plan: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan> {
    const [updatedPlan] = await db.update(subscriptionPlans)
      .set({ ...plan, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return updatedPlan;
  }

  // User subscription operations
  async updateUserSubscription(userId: string, updates: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionTier?: SubscriptionTier;
    subscriptionStatus?: SubscriptionStatus;
    subscriptionCurrentPeriodEnd?: Date;
    subscriptionCancelAtPeriodEnd?: boolean;
    trialEndsAt?: Date;
  }): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserSubscriptionStatus(userId: string): Promise<{
    hasActiveSubscription: boolean;
    tier: SubscriptionTier | null;
    status: SubscriptionStatus | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: Date | null;
  }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      return {
        hasActiveSubscription: false,
        tier: null,
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
      };
    }

    const hasActiveSubscription = user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing';
    
    return {
      hasActiveSubscription,
      tier: user.subscriptionTier,
      status: user.subscriptionStatus,
      currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd || false,
      trialEndsAt: user.trialEndsAt,
    };
  }

  // Subscription history
  async createSubscriptionHistory(history: InsertSubscriptionHistory): Promise<SubscriptionHistory> {
    const [newHistory] = await db.insert(subscriptionHistory).values(history).returning();
    return newHistory;
  }

  async getSubscriptionHistory(userId: string): Promise<SubscriptionHistory[]> {
    return await db.select().from(subscriptionHistory)
      .where(eq(subscriptionHistory.userId, userId))
      .orderBy(desc(subscriptionHistory.createdAt));
  }

  // AI Usage Tracking
  async getOrCreateAiUsage(userId: string, month: string): Promise<AiUsageTracking> {
    // Try to find existing usage record for the month
    const [existing] = await db.select().from(aiUsageTracking)
      .where(and(eq(aiUsageTracking.userId, userId), eq(aiUsageTracking.month, month)))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Create new usage record for the month
    const resetDate = new Date();
    resetDate.setMonth(resetDate.getMonth() + 1);
    resetDate.setDate(1);
    resetDate.setHours(0, 0, 0, 0);

    const [created] = await db.insert(aiUsageTracking).values({
      userId,
      month,
      queriesUsed: 0,
      resetAt: resetDate,
    }).returning();

    return created;
  }

  async incrementAiUsage(userId: string): Promise<{ success: boolean; remaining: number; limit: number }> {
    // Get current month in YYYY-MM format
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get user subscription status to determine limit
    const subscriptionStatus = await this.getUserSubscriptionStatus(userId);
    
    if (!subscriptionStatus.hasActiveSubscription || !subscriptionStatus.tier) {
      return { success: false, remaining: 0, limit: 0 };
    }

    // Get tier limits from TIER_CAPABILITIES (we need to import this)
    const tierLimits = {
      basic: 50,
      professional: 500,
      enterprise: 5000,
    };
    
    const limit = tierLimits[subscriptionStatus.tier];
    
    // Get or create usage record for this month
    const usage = await this.getOrCreateAiUsage(userId, month);
    
    // Check if user has exceeded limit
    if (usage.queriesUsed >= limit) {
      return { success: false, remaining: 0, limit };
    }

    // Increment usage
    const [updated] = await db.update(aiUsageTracking)
      .set({ 
        queriesUsed: usage.queriesUsed + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(aiUsageTracking.userId, userId), eq(aiUsageTracking.month, month)))
      .returning();

    const remaining = limit - updated.queriesUsed;

    return { success: true, remaining, limit };
  }

  async getAiUsageForMonth(userId: string, month: string): Promise<AiUsageTracking | undefined> {
    const [usage] = await db.select().from(aiUsageTracking)
      .where(and(eq(aiUsageTracking.userId, userId), eq(aiUsageTracking.month, month)))
      .limit(1);
    
    return usage;
  }

  async resetMonthlyAiUsage(userId: string): Promise<void> {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await db.update(aiUsageTracking)
      .set({ 
        queriesUsed: 0,
        updatedAt: new Date(),
      })
      .where(and(eq(aiUsageTracking.userId, userId), eq(aiUsageTracking.month, month)));
  }

  // Additional user lookup methods for webhooks
  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);
    
    return user;
  }

  async getSubscriptionPlanByPriceId(priceId: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.stripePriceId, priceId))
      .limit(1);
    
    return plan;
  }

  // Unified user update method that webhooks can use
  async updateUser(userId: string, updates: Partial<UpsertUser>): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    return user;
  }
}

export const storage = new DatabaseStorage();
