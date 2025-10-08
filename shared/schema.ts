import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define project type enum for database
export const projectTypeEnum = pgEnum("project_type", ["full_orion", "megatrends", "early_warning", "new_project"]);

// Define subscription status enum
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "canceled", "past_due", "unpaid", "trialing", "incomplete", "incomplete_expired"]);

// Define subscription tier enum
export const subscriptionTierEnum = pgEnum("subscription_tier", ["basic", "professional", "enterprise"]);

// Permission system types for subscription access control
export const PAGE_ACCESS = {
  DASHBOARD: 'dashboard',
  SCANNING: 'scanning', 
  ANALYTICS: 'analytics',
  REPORTS: 'reports',
  COPILOT: 'copilot'
} as const;

export const FEATURE_ACCESS = {
  API_ACCESS: 'api_access',
  TEAM_SHARING: 'team_sharing',
  CUSTOM_REPORTS: 'custom_reports',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  PRIORITY_SUPPORT: 'priority_support'
} as const;

export type PageAccess = typeof PAGE_ACCESS[keyof typeof PAGE_ACCESS];
export type FeatureAccess = typeof FEATURE_ACCESS[keyof typeof FEATURE_ACCESS];

// Subscription tier permission configurations
export const TIER_PERMISSIONS = {
  basic: {
    pages: [PAGE_ACCESS.DASHBOARD, PAGE_ACCESS.SCANNING, PAGE_ACCESS.ANALYTICS] as PageAccess[],
    features: [] as FeatureAccess[]
  },
  professional: {
    pages: [PAGE_ACCESS.DASHBOARD, PAGE_ACCESS.SCANNING, PAGE_ACCESS.ANALYTICS, PAGE_ACCESS.REPORTS, PAGE_ACCESS.COPILOT] as PageAccess[],
    features: [FEATURE_ACCESS.CUSTOM_REPORTS] as FeatureAccess[]
  },
  enterprise: {
    pages: [PAGE_ACCESS.DASHBOARD, PAGE_ACCESS.SCANNING, PAGE_ACCESS.ANALYTICS, PAGE_ACCESS.REPORTS, PAGE_ACCESS.COPILOT] as PageAccess[],
    features: [FEATURE_ACCESS.API_ACCESS, FEATURE_ACCESS.TEAM_SHARING, FEATURE_ACCESS.CUSTOM_REPORTS, FEATURE_ACCESS.ADVANCED_ANALYTICS, FEATURE_ACCESS.PRIORITY_SUPPORT] as FeatureAccess[]
  }
} as const;

// Define driving force type constants
export const FORCE_TYPES = {
  MEGATRENDS: 'Megatrends',
  TRENDS: 'Trends', 
  WEAK_SIGNALS: 'Weak Signals',
  WILDCARDS: 'Wildcards',
  SCENARIOS: 'Signals'
} as const;

// Type for force types
export type ForceType = typeof FORCE_TYPES[keyof typeof FORCE_TYPES];

// Session storage table for Replit Auth (MANDATORY)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with custom authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  
  // Custom authentication fields
  passwordHash: varchar("password_hash"), // bcrypt hashed password
  emailVerified: boolean("email_verified").default(false).notNull(),
  emailVerificationToken: varchar("email_verification_token"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at"),
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at"),
  loginAttempts: integer("login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  
  // Additional profile fields for SaaS onboarding
  companyName: varchar("company_name"),
  jobTitle: varchar("job_title"),
  industry: varchar("industry"),
  country: varchar("country"),
  
  // Stripe integration fields
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionTier: subscriptionTierEnum("subscription_tier"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end").default(false),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Nullable initially for migration
  name: text("name").notNull(),
  description: text("description"),
  projectType: projectTypeEnum("project_type").notNull().default("new_project"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const drivingForces = pgTable("driving_forces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  type: text("type").notNull(), // M/T/WS/WC/S
  steep: text("steep").notNull(), // Social/Technological/Economic/Environmental/Political
  dimension: text("dimension"), // New column for radar visualization - corresponds to radar CSV "dimension" field
  scope: text("scope"),
  impact: real("impact"), // 1-10 scale (Level of Impact)
  ttm: text("ttm"), // time to market (Time to Market)
  sentiment: text("sentiment"), // Positive/Negative/Neutral
  source: text("source"),
  tags: text("tags").array(),
  text: text("text").notNull(),
  embeddingVector: real("embedding_vector").array(),
  embeddingModel: text("embedding_model").default("text-embedding-3-large"),
  // Cluster assignment fields
  clusterId: varchar("cluster_id").references(() => clusters.id),
  clusterLabel: text("cluster_label"),
  // Radar visualization fields
  magnitude: real("magnitude"), // Magnitude for radar positioning
  distance: real("distance"), // Distance from center in radar
  colorHex: text("color_hex"), // Hex color for radar points
  feasibility: real("feasibility"), // Feasibility score (1-10)
  urgency: real("urgency"), // Urgency score (1-10)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clusters = pgTable("clusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  label: text("label").notNull(),
  method: text("method").notNull(), // orion (ORION clustering only)
  params: jsonb("params"),
  forceIds: text("force_ids").array(),
  centroid: real("centroid").array(),
  size: integer("size").notNull(),
  // Quality metrics
  silhouetteScore: real("silhouette_score"),
  cohesion: real("cohesion"),
  separation: real("separation"),
  inertia: real("inertia"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clusteringReports = pgTable("clustering_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  algorithm: text("algorithm").notNull(),
  params: jsonb("params"),
  executionTime: integer("execution_time"),
  recommendedClusters: integer("recommended_clusters"),
  // Overall quality metrics
  averageSilhouette: real("average_silhouette"),
  daviesBouldinIndex: real("davies_bouldin_index"),
  calinskiHarabaszIndex: real("calinski_harabasz_index"),
  totalInertia: real("total_inertia"),
  clustersCount: integer("clusters_count"),
  forcesProcessed: integer("forces_processed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  lens: text("lens").notNull(), // megatrends/trends/weak_signals
  filtersJson: jsonb("filters_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // preprocess/report/etc
  status: text("status").notNull().default("pending"), // pending/running/done/failed
  progress: integer("progress").default(0),
  metaJson: jsonb("meta_json"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  format: text("format").notNull(), // pdf/docx/xlsx
  status: text("status").notNull().default("pending"),
  url: text("url"),
  sections: text("sections"), // Comma-separated list of sections to include
  selectedForceIds: text("selected_force_ids").array(), // Array of selected force IDs for the report
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Subscription plans table for defining pricing tiers
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tier: subscriptionTierEnum("tier").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(), // Price in cents
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  stripePriceId: varchar("stripe_price_id").notNull(),
  features: jsonb("features").notNull(), // JSON array of feature descriptions
  limits: jsonb("limits").notNull(), // JSON object with feature limits
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Subscription history for tracking changes
export const subscriptionHistory = pgTable("subscription_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  fromTier: subscriptionTierEnum("from_tier"),
  toTier: subscriptionTierEnum("to_tier").notNull(),
  stripeEventId: varchar("stripe_event_id"),
  eventType: text("event_type").notNull(), // subscription_created, tier_changed, canceled, etc.
  metadata: jsonb("metadata"), // Additional event data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI usage tracking for monthly limits
export const aiUsageTracking = pgTable("ai_usage_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // Format: YYYY-MM
  queriesUsed: integer("queries_used").default(0).notNull(),
  resetAt: timestamp("reset_at").notNull(), // When the monthly counter resets
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Unique constraint on userId + month to prevent duplicates
  index("idx_ai_usage_user_month").on(table.userId, table.month)
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  subscriptionHistory: many(subscriptionHistory),
  aiUsageTracking: many(aiUsageTracking),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  drivingForces: many(drivingForces),
  clusters: many(clusters),
  clusteringReports: many(clusteringReports),
  workspaces: many(workspaces),
  reports: many(reports),
}));

export const drivingForcesRelations = relations(drivingForces, ({ one }) => ({
  project: one(projects, {
    fields: [drivingForces.projectId],
    references: [projects.id],
  }),
}));

export const clustersRelations = relations(clusters, ({ one }) => ({
  project: one(projects, {
    fields: [clusters.projectId],
    references: [projects.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ one }) => ({
  project: one(projects, {
    fields: [workspaces.projectId],
    references: [projects.id],
  }),
}));

export const clusteringReportsRelations = relations(clusteringReports, ({ one }) => ({
  project: one(projects, {
    fields: [clusteringReports.projectId],
    references: [projects.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  project: one(projects, {
    fields: [reports.projectId],
    references: [projects.id],
  }),
}));

export const subscriptionHistoryRelations = relations(subscriptionHistory, ({ one }) => ({
  user: one(users, {
    fields: [subscriptionHistory.userId],
    references: [users.id],
  }),
}));

export const aiUsageTrackingRelations = relations(aiUsageTracking, ({ one }) => ({
  user: one(users, {
    fields: [aiUsageTracking.userId],
    references: [users.id],
  }),
}));

// Project type validation schema (must be defined before insertProjectSchema)
export const projectTypeSchema = z.enum(["full_orion", "megatrends", "early_warning", "new_project"]);
export type ProjectType = z.infer<typeof projectTypeSchema>;

// Insert schemas
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectType: projectTypeSchema.optional(), // Allow validation with proper enum values
});

export const insertDrivingForceSchema = createInsertSchema(drivingForces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Schema for updating driving forces including embeddings
export const updateDrivingForceSchema = createInsertSchema(drivingForces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const insertClusterSchema = createInsertSchema(clusters).omit({
  id: true,
  createdAt: true,
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  finishedAt: true,
});

export const insertClusteringReportSchema = createInsertSchema(clusteringReports).omit({
  id: true,
  createdAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionHistorySchema = createInsertSchema(subscriptionHistory).omit({
  id: true,
  createdAt: true,
});

export const insertAiUsageTrackingSchema = createInsertSchema(aiUsageTracking).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// User authentication schemas  
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  emailVerificationToken: true,
  emailVerificationExpiresAt: true,
  passwordResetToken: true,
  passwordResetExpiresAt: true,
  loginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
});

// Registration schema for new user signup
export const userRegistrationSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/(?=.*[a-z])/, "Password must contain at least one lowercase letter")
    .regex(/(?=.*[A-Z])/, "Password must contain at least one uppercase letter")
    .regex(/(?=.*\d)/, "Password must contain at least one number"),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
});

// Login schema
export const userLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Password reset request schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Password reset schema
export const passwordResetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/(?=.*[a-z])/, "Password must contain at least one lowercase letter")
    .regex(/(?=.*[A-Z])/, "Password must contain at least one uppercase letter")
    .regex(/(?=.*\d)/, "Password must contain at least one number"),
});

// Email verification schema
export const emailVerificationSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

// Profile update schema
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  companyName: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

// Helper type to convert null to undefined for optional fields
type NullToUndefined<T> = {
  [K in keyof T]: T[K] extends infer U | null ? U | undefined : T[K];
};

export type DrivingForce = NullToUndefined<typeof drivingForces.$inferSelect>;
export type InsertDrivingForce = z.infer<typeof insertDrivingForceSchema>;

export type Cluster = typeof clusters.$inferSelect;
export type InsertCluster = z.infer<typeof insertClusterSchema>;

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type ClusteringReport = typeof clusteringReports.$inferSelect;
export type InsertClusteringReport = z.infer<typeof insertClusteringReportSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

export type SubscriptionHistory = typeof subscriptionHistory.$inferSelect;
export type InsertSubscriptionHistory = z.infer<typeof insertSubscriptionHistorySchema>;

export type AiUsageTracking = typeof aiUsageTracking.$inferSelect;
export type InsertAiUsageTracking = z.infer<typeof insertAiUsageTrackingSchema>;

// Subscription tier type for easier access
export type SubscriptionTier = "basic" | "professional" | "enterprise";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "unpaid" | "trialing" | "incomplete" | "incomplete_expired";

// Authentication types
export type UserRegistration = z.infer<typeof userRegistrationSchema>;
export type UserLogin = z.infer<typeof userLoginSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;
export type EmailVerification = z.infer<typeof emailVerificationSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

// Saved searches table for persistent search functionality
export const savedSearches = pgTable("saved_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  query: jsonb("query").notNull(), // Stores search parameters
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations for saved searches
export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  project: one(projects, {
    fields: [savedSearches.projectId],
    references: [projects.id],
  }),
}));

// Comprehensive search query schema with all filtering options
export const searchQuerySchema = z.object({
  q: z.string().optional(), // Full-text search query
  projectId: z.string().optional(), // Filter by project
  types: z.array(z.enum(["M", "T", "WS", "WC", "S"])).optional(), // Multiple force types
  steep: z.array(z.enum(["Social", "Technological", "Economic", "Environmental", "Political"])).optional(), // Multiple STEEP categories
  sentiments: z.array(z.enum(["Positive", "Negative", "Neutral"])).optional(), // Multiple sentiments
  impactMin: z.number().min(1).max(10).optional(), // Minimum impact score
  impactMax: z.number().min(1).max(10).optional(), // Maximum impact score
  horizons: z.array(z.string()).optional(), // Time horizons (TTM values)
  tags: z.array(z.string()).optional(), // Specific tags to include
  dimensions: z.array(z.string()).optional(), // Dimension filters
  source: z.string().optional(), // Source filter
  scope: z.string().optional(), // Scope filter
  selectedForceIds: z.array(z.string()).optional(), // Selected force IDs for radar filtering
  forceIds: z.array(z.string()).optional(), // Specific force IDs to query
  createdAfter: z.string().datetime().optional(), // Created after date
  createdBefore: z.string().datetime().optional(), // Created before date
  sort: z.enum(["relevance", "impact", "created_at", "updated_at", "title"]).default("relevance"), // Sort options
  sortOrder: z.enum(["asc", "desc"]).default("desc"), // Sort direction
  page: z.number().int().min(1).default(1), // Page number
  pageSize: z.number().int().min(1).max(1000).default(50), // Results per page
  includeFacets: z.boolean().default(true), // Whether to include facet counts
  includeEmbeddings: z.boolean().default(false), // Include embedding vectors
});

// Facet counts for search results
export const facetCountsSchema = z.object({
  types: z.record(z.string(), z.number()), // Type counts: M: 100, T: 200, etc.
  steep: z.record(z.string(), z.number()), // STEEP counts: Social: 150, etc.
  sentiments: z.record(z.string(), z.number()), // Sentiment counts
  impactRanges: z.object({
    "1-3": z.number(),
    "4-6": z.number(), 
    "7-8": z.number(),
    "9-10": z.number(),
  }),
  horizons: z.record(z.string(), z.number()), // Horizon counts
  sources: z.record(z.string(), z.number()).optional(), // Top sources with counts
  scopes: z.record(z.string(), z.number()).optional(), // Scope counts
  tags: z.record(z.string(), z.number()).optional(), // Popular tags with counts
});

// Comprehensive search response schema
export const searchResponseSchema = z.object({
  forces: z.array(z.object({
    id: z.string(),
    projectId: z.string(),
    title: z.string(),
    type: z.string(),
    steep: z.string(),
    scope: z.string().nullable(),
    impact: z.number().nullable(),
    ttm: z.string().nullable(),
    sentiment: z.string().nullable(),
    source: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    text: z.string(),
    embeddingVector: z.array(z.number()).optional(),
    embeddingModel: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    relevanceScore: z.number().optional(), // Search relevance score
  })),
  total: z.number(), // Total matching results
  page: z.number(), // Current page
  pageSize: z.number(), // Results per page
  totalPages: z.number(), // Total number of pages
  hasMore: z.boolean(), // Whether there are more results
  facets: facetCountsSchema.optional(), // Facet counts for filtering
  took: z.number(), // Query execution time in ms
});

// Insert schemas for saved searches
export const insertSavedSearchSchema = createInsertSchema(savedSearches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for search functionality
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type FacetCounts = z.infer<typeof facetCountsSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type SavedSearch = typeof savedSearches.$inferSelect;
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;

// Bulk edit schemas for Enhanced Scanning Assistant
export const bulkEditFieldsSchema = z.object({
  type: z.enum(['M', 'T', 'WS', 'WC', 'S']).optional(),
  steep: z.enum(['Social', 'Technological', 'Economic', 'Environmental', 'Political']).optional(),
  scope: z.string().optional(),
  impact: z.number().min(1).max(10).optional(),
  ttm: z.string().optional(),
  sentiment: z.enum(['Positive', 'Negative', 'Neutral']).optional(),
});

export const bulkEditFiltersSchema = z.object({
  forceIds: z.array(z.string()).optional(), // Specific force IDs to update
  steep: z.array(z.string()).optional(), // Filter by STEEP dimensions
  type: z.array(z.string()).optional(), // Filter by force types
  selectedOnly: z.boolean().optional(), // Update only selected forces
  searchPattern: z.string().optional(), // Update forces matching pattern
  count: z.number().positive().optional(), // Limit number of forces to update
  position: z.enum(['first', 'last']).optional(), // Take first/last N forces
});

export const bulkEditRequestSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  filters: bulkEditFiltersSchema,
  updates: bulkEditFieldsSchema,
});

export const parseCommandRequestSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  message: z.string().min(1, "Message is required"),
  selectedForces: z.array(z.string()).optional(),
});

export const bulkEditPreviewSchema = z.object({
  affectedForces: z.array(z.object({
    id: z.string(),
    title: z.string(),
    currentValues: z.record(z.any()),
    newValues: z.record(z.any()),
  })),
  totalCount: z.number(),
  summary: z.string(),
});

// Types for chat functionality
export type ChatImage = z.infer<typeof chatImageSchema>;
export type ChatStreamRequest = z.infer<typeof chatStreamRequestSchema>;

// Types for bulk editing
export type BulkEditFields = z.infer<typeof bulkEditFieldsSchema>;
export type BulkEditFilters = z.infer<typeof bulkEditFiltersSchema>;
export type BulkEditRequest = z.infer<typeof bulkEditRequestSchema>;
export type BulkEditPreview = z.infer<typeof bulkEditPreviewSchema>;
export type ParseCommandRequest = z.infer<typeof parseCommandRequestSchema>;

// Commonly used search filters as a separate schema
export const searchFiltersSchema = searchQuerySchema.omit({
  page: true,
  pageSize: true,
  sort: true,
  sortOrder: true,
  includeFacets: true,
  includeEmbeddings: true,
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

// Image data schema for chat requests
export const chatImageSchema = z.object({
  data: z.string(), // base64 encoded image data
  type: z.string(), // MIME type (image/png, image/jpeg, etc.)
  name: z.string(), // Original filename
  size: z.number(), // File size in bytes
});

// Chat stream request validation schema
export const chatStreamRequestSchema = z.object({
  project_id: z.string().min(1, "Project ID is required"),
  query: z.string().min(1, "Query is required"),
  assistant_type: z.enum(['copilot', 'scanning']).default('copilot'),
  thread_id: z.string().nullable().optional(),
  mode: z.string().optional(),
  images: z.array(chatImageSchema).optional(), // Array of images for multimodal requests
  context: z.any().optional(), // Additional context data
});

// Admin API response types to prevent field inconsistencies
export const importStatusResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    hasLegacyClusters: z.boolean(),
    legacyClusterCount: z.number(),
    totalForcesInLegacyClusters: z.number(),
  }),
});

export const importClustersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    clustersCreated: z.number(),
    forcesMapped: z.number(), // CONSISTENT FIELD NAME: forcesMapped (not forcesMaped)
  }).optional(),
  error: z.string().optional(),
});

export const adminErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  hint: z.string().optional(),
});

// Standard API response wrappers
export const apiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional(),
  });

export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.any().optional(),
});

// Export response types
export type ImportStatusResponse = z.infer<typeof importStatusResponseSchema>;
export type ImportClustersResponse = z.infer<typeof importClustersResponseSchema>;
export type AdminErrorResponse = z.infer<typeof adminErrorResponseSchema>;
export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

// Subscription-related API schemas
export const createCheckoutSessionRequestSchema = z.object({
  tier: z.enum(["basic", "professional", "enterprise"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const subscriptionStatusResponseSchema = z.object({
  hasActiveSubscription: z.boolean(),
  tier: z.enum(["basic", "professional", "enterprise"]).nullable(),
  status: z.enum(["active", "canceled", "past_due", "unpaid", "trialing", "incomplete", "incomplete_expired"]).nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  trialEndsAt: z.string().nullable(),
});

export type CreateCheckoutSessionRequest = z.infer<typeof createCheckoutSessionRequestSchema>;
export type SubscriptionStatusResponse = z.infer<typeof subscriptionStatusResponseSchema>;
