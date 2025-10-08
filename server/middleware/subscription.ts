import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import type { SubscriptionTier } from '@shared/schema';

// Define feature capabilities for each subscription tier
const TIER_CAPABILITIES = {
  basic: {
    projects: 5,
    drivingForces: 6000, // Generous limit to accommodate all curated forces (currently ~5,772 due to data duplication)
    aiQueriesPerMonth: 50,
    users: 1,
    apiAccess: false,
    customReports: true, // Allow reports access for Basic tier
    prioritySupport: false,
    fullOrionCopilot: false,
    multimodalAI: false,
    advancedClustering: true, // Allow analytics/radar access for Basic
    teamCollaboration: false,
    curatedOnly: true, // Basic tier can only access curated forces (M, T, WS, WC)
    scanningAssistant: false, // Block Scanning Assistant for Basic tier
  },
  professional: {
    projects: -1, // Unlimited projects
    drivingForces: 29769, // All forces including signals (29,769 total)
    aiQueriesPerMonth: 500,
    users: 1,
    apiAccess: false,
    customReports: true,
    prioritySupport: true,
    fullOrionCopilot: true,
    multimodalAI: true,
    advancedClustering: true,
    teamCollaboration: false,
    curatedOnly: false, // Professional can access all forces
    scanningAssistant: true, // Professional has Scanning Assistant access
  },
  enterprise: {
    projects: -1, // Unlimited
    drivingForces: 29769, // All forces including signals (29,769 total)
    aiQueriesPerMonth: 5000,
    users: 5, // Increased from 4 to 5
    apiAccess: true,
    customReports: true,
    prioritySupport: true,
    fullOrionCopilot: true,
    multimodalAI: true,
    advancedClustering: true,
    teamCollaboration: true,
    curatedOnly: false, // Enterprise can access all forces
    scanningAssistant: true, // Enterprise has Scanning Assistant access
  },
} as const;

interface AuthenticatedRequest extends Request {
  user?: {
    claims: {
      sub: string;
    };
  };
}

export interface FeatureRequirement {
  feature: keyof typeof TIER_CAPABILITIES.basic;
  minimumTier?: SubscriptionTier;
}

/**
 * Middleware to check if user has access to specific features based on their subscription
 */
export function requireSubscriptionFeature(requirements: FeatureRequirement | FeatureRequirement[]) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims.sub;
      const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
      
      
      // Check if user has an active subscription
      if (!subscriptionStatus.hasActiveSubscription) {
        return res.status(403).json({
          success: false,
          error: 'This feature requires an active subscription',
          code: 'SUBSCRIPTION_REQUIRED',
          upgradeUrl: '/pricing',
        });
      }

      const userTier = subscriptionStatus.tier;
      if (!userTier) {
        return res.status(403).json({
          success: false,
          error: 'Unable to determine subscription tier',
          code: 'TIER_UNKNOWN',
        });
      }

      const userCapabilities = TIER_CAPABILITIES[userTier as SubscriptionTier];
      const requirementsList = Array.isArray(requirements) ? requirements.flat() : [requirements];

      // Check each requirement
      for (const requirement of requirementsList) {
        const { feature, minimumTier } = requirement;
        
        // Check if user's tier supports this feature
        if (!userCapabilities[feature]) {
          // Find the minimum tier that supports this feature
          const supportingTier = findMinimumTierForFeature(feature);
          
          return res.status(403).json({
            success: false,
            error: `This feature requires ${supportingTier} subscription or higher`,
            code: 'FEATURE_NOT_AVAILABLE',
            currentTier: userTier,
            requiredTier: supportingTier,
            feature: feature,
            upgradeUrl: '/pricing',
          });
        }

        // Check minimum tier requirement if specified
        if (minimumTier && !isTierSufficient(userTier, minimumTier)) {
          return res.status(403).json({
            success: false,
            error: `This feature requires ${minimumTier} subscription or higher`,
            code: 'INSUFFICIENT_TIER',
            currentTier: userTier,
            requiredTier: minimumTier,
            upgradeUrl: '/pricing',
          });
        }
      }

      // Add user capabilities to request for downstream use
      (req as any).userCapabilities = userCapabilities;
      (req as any).subscriptionTier = userTier;
      
      next();
    } catch (error) {
      console.error('Error checking subscription features:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify subscription features',
        code: 'SUBSCRIPTION_CHECK_ERROR',
      });
    }
  };
}

/**
 * Middleware to check resource limits (projects, driving forces, etc.)
 */
export function checkResourceLimits(resourceType: 'projects' | 'drivingForces') {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims.sub;
      const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
      
      
      if (!subscriptionStatus.hasActiveSubscription || !subscriptionStatus.tier) {
        return res.status(403).json({
          success: false,
          error: 'Active subscription required',
          code: 'SUBSCRIPTION_REQUIRED',
          upgradeUrl: '/pricing',
        });
      }

      const userCapabilities = TIER_CAPABILITIES[subscriptionStatus.tier as SubscriptionTier];
      const limit = userCapabilities[resourceType];

      // Skip check for unlimited resources
      if (limit === -1) {
        next();
        return;
      }

      // Get current usage
      let currentCount = 0;
      if (resourceType === 'projects') {
        const projects = await storage.getProjectsByUser(userId);
        currentCount = projects.length;
      } else if (resourceType === 'drivingForces') {
        // Get total driving forces across all user's projects
        const projects = await storage.getProjectsByUser(userId);
        for (const project of projects) {
          // For Basic tier with curatedOnly restriction, only count curated forces
          if (userCapabilities.curatedOnly) {
            const { total } = await storage.getDrivingForces(project.id, undefined, undefined, {
              includeSignals: false // Exclude signals for Basic tier
            });
            currentCount += total;
          } else {
            const { total } = await storage.getDrivingForces(project.id);
            currentCount += total;
          }
        }
      }

      if (currentCount >= limit) {
        const supportingTier = findMinimumTierForLimit(resourceType, currentCount + 1);
        
        return res.status(403).json({
          success: false,
          error: `You've reached your ${resourceType} limit of ${limit}`,
          code: 'RESOURCE_LIMIT_EXCEEDED',
          currentTier: subscriptionStatus.tier,
          requiredTier: supportingTier,
          currentUsage: currentCount,
          limit: limit,
          upgradeUrl: '/pricing',
        });
      }

      next();
    } catch (error) {
      console.error('Error checking resource limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify resource limits',
        code: 'LIMIT_CHECK_ERROR',
      });
    }
  };
}

/**
 * Middleware to check and increment AI usage limits
 */
export function checkAiUsageLimit() {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims.sub;
      
      
      // Increment AI usage and check limits
      const result = await storage.incrementAiUsage(userId);
      
      if (!result.success) {
        return res.status(403).json({
          success: false,
          error: `You've reached your monthly AI query limit of ${result.limit}`,
          code: 'AI_USAGE_LIMIT_EXCEEDED',
          currentUsage: result.limit,
          limit: result.limit,
          remaining: 0,
          upgradeUrl: '/pricing',
        });
      }

      // Add usage info to request for potential logging/monitoring
      (req as any).aiUsage = {
        remaining: result.remaining,
        limit: result.limit,
      };

      next();
    } catch (error) {
      console.error('Error checking AI usage limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify AI usage limits',
        code: 'AI_USAGE_CHECK_ERROR',
      });
    }
  };
}

/**
 * Helper function to find the minimum tier that supports a specific feature
 */
function findMinimumTierForFeature(feature: keyof typeof TIER_CAPABILITIES.basic): SubscriptionTier {
  const tiers: SubscriptionTier[] = ['basic', 'professional', 'enterprise'];
  
  for (const tier of tiers) {
    if (TIER_CAPABILITIES[tier][feature]) {
      return tier;
    }
  }
  
  return 'enterprise'; // Fallback to highest tier
}

/**
 * Helper function to find the minimum tier that supports a specific resource limit
 */
function findMinimumTierForLimit(resourceType: 'projects' | 'drivingForces', requiredAmount: number): SubscriptionTier {
  const tiers: SubscriptionTier[] = ['basic', 'professional', 'enterprise'];
  
  for (const tier of tiers) {
    const limit = TIER_CAPABILITIES[tier][resourceType];
    if (limit === -1 || limit >= requiredAmount) {
      return tier;
    }
  }
  
  return 'enterprise'; // Fallback to highest tier
}

/**
 * Helper function to check if user's tier is sufficient for a minimum requirement
 */
function isTierSufficient(userTier: SubscriptionTier, minimumTier: SubscriptionTier): boolean {
  const tierOrder: Record<SubscriptionTier, number> = {
    basic: 1,
    professional: 2,
    enterprise: 3,
  };
  
  return tierOrder[userTier] >= tierOrder[minimumTier];
}

/**
 * Get user's subscription capabilities for frontend use
 */
export async function getUserCapabilities(userId: string) {
  const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
  
  if (!subscriptionStatus.hasActiveSubscription || !subscriptionStatus.tier) {
    return {
      hasActiveSubscription: false,
      tier: null,
      capabilities: null,
    };
  }

  return {
    hasActiveSubscription: true,
    tier: subscriptionStatus.tier,
    capabilities: TIER_CAPABILITIES[subscriptionStatus.tier],
    status: subscriptionStatus,
  };
}

export { TIER_CAPABILITIES };