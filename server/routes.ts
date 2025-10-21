import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { storage } from "./storage";
import { isAuthenticated, jwtAuthentication, optionalJwtAuthentication } from "./middleware/jwtAuth.js";

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { 
  insertProjectSchema, 
  insertDrivingForceSchema, 
  insertJobSchema, 
  insertReportSchema,
  searchQuerySchema,
  insertSavedSearchSchema,
  chatStreamRequestSchema,
  bulkEditRequestSchema,
  parseCommandRequestSchema,
  createCheckoutSessionRequestSchema,
  subscriptionStatusResponseSchema,
  type SubscriptionTier,
  drivingForces,
  subscriptionPlans
} from "@shared/schema";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { existsSync } from "fs";
import { openaiService } from "./services/openai";
import { preprocessingService } from "./services/preprocessing";
import { jobsService } from "./services/jobs";
import { fileParserService } from "./services/file-parser";
import { visualizationService } from "./services/visualization";
import { exportService, type ClusterExportOptions } from "./services/export";
import { importService } from "./services/importService";
import { commandParserService } from "./services/command-parser";
import { performIntegrityCheck, isReprocessAllowed, getReprocessBlockingReason } from "./services/integrity-validator.js";
import { isFixedLoaderEnabled, getFilePaths } from "./services/fixed-data-loader.js";
import { requireSubscriptionFeature, checkResourceLimits, getUserCapabilities, checkAiUsageLimit } from "./middleware/subscription.js";
import { authService } from "./services/authService.js";
import { 
  userRegistrationSchema, 
  userLoginSchema, 
  passwordResetRequestSchema, 
  passwordResetSchema, 
  emailVerificationSchema,
  users
} from "@shared/schema";
import { z } from "zod";

// Stripe integration for subscription management
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.TESTING_STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.warn('No Stripe secret key found - subscription features will be limited');
}
const stripe = stripeKey ? new Stripe(stripeKey) : null;

// Radar visualization helper functions
// Function to map database abbreviated codes to original parquet "Driving Force" values
function mapTypeToOriginalParquetValue(type: string): string {
  switch (type) {
    case 'M': return 'Megatrends';
    case 'T': return 'Trends';
    case 'WS': return 'Weak Signals';
    case 'WC': return 'Wildcards';
    case 'S': return 'Signals';
    default: return type;
  }
}

function calculateDefaultMagnitude(impact: number | null): number {
  // Use impact score to derive magnitude, fallback to middle value
  return impact ? Math.max(1, Math.min(10, impact)) : 5;
}

function calculateDefaultDistance(impact: number | null, feasibility: number | null): number {
  // Calculate distance based on impact and feasibility, normalized to 1-10 range
  const impactValue = impact || 5;
  const feasibilityValue = feasibility || 5;
  // Higher impact and feasibility = closer to center (lower distance)
  return Math.max(1, Math.min(10, 11 - ((impactValue + feasibilityValue) / 2)));
}

function generateColorFromType(type: string): string {
  // Generate color based on force type using the CSS design tokens
  switch (type) {
    case 'M': return '#64ffda'; // Social/Megatrend - teal
    case 'T': return '#f5a623'; // Technological/Trend - orange  
    case 'WS': return '#4a90e2'; // Economic/Weak Signal - blue
    case 'WC': return '#bd10e0'; // Environmental/Wildcard - purple
    case 'S': return '#d0021b'; // Political/Signal - red
    default: return '#64ffda';
  }
}

function calculateDefaultFeasibility(ttm: string | null): number {
  // Estimate feasibility based on time to market
  if (!ttm) return 5; // Default middle value
  
  const ttmLower = ttm.toLowerCase();
  if (ttmLower.includes('immediate') || ttmLower.includes('now')) return 9;
  if (ttmLower.includes('short') || ttmLower.includes('1-2')) return 8;
  if (ttmLower.includes('medium') || ttmLower.includes('3-5')) return 6;
  if (ttmLower.includes('long') || ttmLower.includes('5+')) return 3;
  if (ttmLower.includes('uncertain') || ttmLower.includes('unknown')) return 2;
  
  return 5; // Default
}

function calculateDefaultUrgency(ttm: string | null, type: string): number {
  // Calculate urgency based on time to market and force type
  let baseUrgency = 5;
  
  // Adjust based on force type
  switch (type) {
    case 'M': baseUrgency = 6; break; // Megatrends are generally more urgent
    case 'WC': baseUrgency = 8; break; // Wildcards are highly urgent
    case 'T': baseUrgency = 5; break; // Trends are medium urgency
    case 'WS': baseUrgency = 7; break; // Weak signals need attention
    default: baseUrgency = 5;
  }
  
  // Adjust based on time to market
  if (!ttm) return baseUrgency;
  
  const ttmLower = ttm.toLowerCase();
  if (ttmLower.includes('immediate') || ttmLower.includes('now')) return Math.min(10, baseUrgency + 3);
  if (ttmLower.includes('short')) return Math.min(10, baseUrgency + 1);
  if (ttmLower.includes('long')) return Math.max(1, baseUrgency - 2);
  
  return baseUrgency;
}

// Report generation helper
function generateReportContent(project: any, forces: any[], format: string): string {
  const reportDate = new Date().toLocaleDateString();
  const forceCount = forces.length;
  const forcesByType = forces.reduce((acc, force) => {
    const type = mapTypeToOriginalParquetValue(force.type);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  if (format === 'pdf') {
    // Generate basic HTML content that can be converted to PDF
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ORION Strategic Intelligence Report</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
        .header { text-align: center; border-bottom: 3px solid #64ffda; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .force-item { margin-bottom: 15px; border-left: 3px solid #64ffda; padding-left: 15px; }
        .force-title { font-weight: bold; color: #333; }
        .force-meta { color: #666; font-size: 0.9em; }
        .summary-stats { background: #f8f9fa; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ORION Strategic Intelligence Report</h1>
        <p><strong>Project:</strong> ${project.name}</p>
        <p><strong>Generated:</strong> ${reportDate}</p>
        <p><strong>Total Forces:</strong> ${forceCount}</p>
    </div>
    
    <div class="section">
        <h2>Executive Summary</h2>
        <div class="summary-stats">
            <h3>Forces Distribution:</h3>
            ${Object.entries(forcesByType).map(([type, count]) => 
                `<p><strong>${type}:</strong> ${count}</p>`
            ).join('')}
        </div>
        <p>This report analyzes ${forceCount} driving forces across multiple strategic dimensions. 
        The analysis provides insights into emerging trends, potential disruptions, and strategic opportunities 
        that could impact future business operations and strategic planning.</p>
    </div>
    
    <div class="section">
        <h2>Driving Forces Analysis</h2>
        ${forces.slice(0, 50).map(force => `
            <div class="force-item">
                <div class="force-title">${force.title || 'Untitled Force'}</div>
                <div class="force-meta">
                    Type: ${mapTypeToOriginalParquetValue(force.type)} | 
                    Dimension: ${force.dimension || 'Not specified'} | 
                    Impact: ${force.impact || 'Not rated'}
                </div>
                <p>${force.text || force.description || 'No description available'}</p>
            </div>
        `).join('')}
        ${forceCount > 50 ? `<p><em>Note: Showing first 50 of ${forceCount} total forces</em></p>` : ''}
    </div>
</body>
</html>`;
  } else {
    // Generate basic text content for Word documents
    return `ORION Strategic Intelligence Report

Project: ${project.name}
Generated: ${reportDate}
Total Forces: ${forceCount}

EXECUTIVE SUMMARY
================

Forces Distribution:
${Object.entries(forcesByType).map(([type, count]) => `${type}: ${count}`).join('\n')}

This report analyzes ${forceCount} driving forces across multiple strategic dimensions. 
The analysis provides insights into emerging trends, potential disruptions, and strategic opportunities 
that could impact future business operations and strategic planning.

DRIVING FORCES ANALYSIS
=======================

${forces.slice(0, 50).map(force => `
${force.title || 'Untitled Force'}
Type: ${mapTypeToOriginalParquetValue(force.type)} | Dimension: ${force.dimension || 'Not specified'} | Impact: ${force.impact || 'Not rated'}

${force.text || force.description || 'No description available'}

---
`).join('')}

${forceCount > 50 ? `Note: Showing first 50 of ${forceCount} total forces` : ''}

END OF REPORT`;
  }
}

// Admin authentication middleware
function requireAdminAuth(req: any, res: any, next: any) {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminKey = process.env.ADMIN_API_KEY;
  
  // CRITICAL SECURITY: In production, ADMIN_API_KEY must be explicitly set
  if (isProduction && !adminKey) {
    console.error('[CRITICAL SECURITY ERROR] ADMIN_API_KEY environment variable must be set in production');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: Admin authentication not properly configured'
    });
  }
  
  // Use dev fallback only in non-production environments
  const finalAdminKey = adminKey || (isProduction ? null : 'dev-admin-key');
  
  if (!finalAdminKey) {
    return res.status(500).json({
      success: false,
      error: 'Admin authentication not configured'
    });
  }
  
  // SECURITY: Check Authorization header first (preferred method)
  const authHeader = req.headers.authorization;
  let apiKey = authHeader?.replace('Bearer ', '') || null;
  
  // SECURITY: In production, only accept Authorization header for security
  // In development, allow query parameter for convenience but warn about it
  if (!apiKey && !isProduction) {
    apiKey = req.query.api_key as string || null;
    if (apiKey) {
      console.warn('[SECURITY WARNING] API key provided via query parameter. Use Authorization header in production.');
    }
  }
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Admin authentication required. Provide API key in Authorization header as "Bearer <key>".',
      hint: isProduction ? undefined : 'Development: Use dev-admin-key'
    });
  }
  
  if (apiKey !== finalAdminKey) {
    // Log failed auth attempts in production for security monitoring
    if (isProduction) {
      console.warn('[SECURITY] Failed admin authentication attempt');
    }
    return res.status(403).json({
      success: false,
      error: 'Invalid admin API key'
    });
  }
  
  // Log successful auth only in development to avoid log pollution
  if (!isProduction) {
    console.log('[ADMIN] Authenticated request to admin endpoint');
  }
  
  next();
}

// Strict mode integrity enforcement middleware
async function requireIntegrityOk(req: any, res: any, next: any) {
  const { strictMode } = getFilePaths();
  
  // Only enforce integrity checks in strict mode
  if (!strictMode) {
    return next();
  }
  
  try {
    const integrityCheck = await performIntegrityCheck();
    
    // Block access if integrity validation fails in strict mode
    if (integrityCheck.status === 'critical') {
      return res.status(503).json({
        error: 'Analytics functionality temporarily unavailable',
        reason: 'System integrity validation failed in strict mode',
        details: integrityCheck.summary,
        strictMode: true,
        status: integrityCheck.status,
        hint: 'Contact administrator to resolve data integrity issues'
      });
    }
    
    // Allow access with warnings for degraded status
    if (integrityCheck.status === 'degraded') {
      console.warn(`⚠️  Analytics accessed with degraded integrity: ${integrityCheck.summary}`);
    }
    
    next();
  } catch (error) {
    console.error('Integrity check middleware error:', error);
    
    // In strict mode, fail secure - block access on integrity check errors
    return res.status(503).json({
      error: 'Analytics functionality temporarily unavailable',
      reason: 'System integrity check failed',
      details: error instanceof Error ? error.message : 'Unknown integrity check error',
      strictMode: true,
      hint: 'Contact administrator to resolve system issues'
    });
  }
}

// Middleware to verify project ownership
async function verifyProjectOwnership(req: any, res: any, next: NextFunction) {
  try {
    const userId = req.user.id;
    // Check for project ID in various locations and formats (camelCase and snake_case)
    const projectId = req.params.projectId || req.params.id || req.params.project_id || 
                      req.query.projectId || req.query.project_id || 
                      req.body.projectId || req.body.project_id;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID required" });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.userId !== userId) {
      return res.status(403).json({ error: "Access denied: Project not owned by user" });
    }

    // Add project to request for use in route handler
    req.project = project;
    next();
  } catch (error) {
    console.error("Error verifying project ownership:", error);
    res.status(500).json({ error: "Failed to verify project ownership" });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Custom authentication now handled by JWT middleware on individual routes
  // No global setup needed

  // ======================
  // CUSTOM AUTHENTICATION ROUTES
  // ======================
  
  // User registration endpoint
  app.post('/api/auth/register', async (req, res) => {
    try {
      console.log('[AUTH] Registration attempt:', req.body.email);
      
      // Validate input data
      const validatedData = userRegistrationSchema.parse(req.body);
      const { email, password, firstName, lastName, companyName, jobTitle, industry, country } = validatedData;
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'An account with this email address already exists.',
          code: 'EMAIL_EXISTS'
        });
      }

      // Hash password
      const passwordHash = await authService.hashPassword(password);
      
      // Create user with custom authentication data (without verification token initially)
      const newUser = await storage.createUser({
        email: email.toLowerCase(),
        firstName,
        lastName,
        companyName: companyName || null,
        jobTitle: jobTitle || null,
        industry: industry || null,
        country: country || null,
        passwordHash,
        emailVerified: false,
        // Set up 7-day Basic trial subscription
        subscriptionTier: 'basic',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days trial
      });

      console.log('[AUTH] User created successfully:', newUser.id);

      // Create and send email verification using proper method
      try {
        const emailVerificationToken = await authService.createEmailVerificationToken(newUser.email!);
        if (emailVerificationToken) {
          await authService.sendEmailVerification(
            newUser.email!, 
            newUser.firstName || 'User', 
            emailVerificationToken
          );
        }
      } catch (emailError) {
        console.error('[AUTH] Failed to send verification email:', emailError);
        // Continue with registration - user can request verification later
      }

      // Generate JWT token for immediate login after verification
      const token = authService.generateToken({
        userId: newUser.id,
        email: newUser.email!,
        emailVerified: false // Will be true after email verification
      });

      // Remove sensitive fields from response
      const { passwordHash: _, emailVerificationToken: __, ...safeUser } = newUser;

      res.status(201).json({
        success: true,
        message: 'Account created successfully. Please check your email to verify your account.',
        user: safeUser,
        token,
        requiresVerification: true
      });

    } catch (error) {
      console.error('[AUTH] Registration error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid input data',
          details: error.errors.map((e: any) => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create account. Please try again.',
        code: 'REGISTRATION_FAILED'
      });
    }
  });

  // User login endpoint
  app.post('/api/auth/login', async (req, res) => {
    try {
      console.log('[AUTH] Login attempt:', req.body.email);
      
      // Validate input
      const { email, password } = userLoginSchema.parse(req.body);
      
      // Authenticate user
      const authResult = await authService.authenticateUser(email, password);
      
      if (!authResult.success) {
        // TEMPORARY: Allow login even if email not verified or account is locked (for testing)
        // Check if it's verification or lock issue
        if ((authResult.requiresVerification || authResult.isLocked) && !authResult.user) {
          const user = await storage.getUserByEmail(email.toLowerCase());
          if (user && user.passwordHash) {
            const isPasswordValid = await authService.verifyPassword(password, user.passwordHash);
            if (isPasswordValid) {
              // Clear lockout and allow login
              await authService.resetLoginAttempts(email);
              
              // Allow login but flag as unverified
              const token = authService.generateToken({
                userId: user.id,
                email: user.email!,
                emailVerified: false
              });
              
              console.log('[AUTH] Login successful (bypassed verification/lock):', user.id);
              
              return res.json({
                success: true,
                message: 'Login successful',
                user: { ...user, passwordHash: undefined },
                token,
                emailUnverified: !user.emailVerified // Flag for frontend
              });
            }
          }
        }
        
        return res.status(401).json({
          success: false,
          error: authResult.error,
          requiresVerification: authResult.requiresVerification,
          isLocked: authResult.isLocked
        });
      }

      console.log('[AUTH] Login successful:', authResult.user?.id);

      res.json({
        success: true,
        message: 'Login successful',
        user: authResult.user,
        token: authResult.token
      });

    } catch (error) {
      console.error('[AUTH] Login error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid input data'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Login failed. Please try again.'
      });
    }
  });

  // Email verification endpoint
  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = emailVerificationSchema.parse(req.body);
      
      const result = await authService.verifyEmailToken(token);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      console.log('[AUTH] Email verified successfully:', result.user?.id);

      res.json({
        success: true,
        message: 'Email verified successfully! You can now access all features.',
        user: result.user
      });

    } catch (error) {
      console.error('[AUTH] Email verification error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid verification token'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Email verification failed. Please try again.'
      });
    }
  });

  // Password reset request endpoint
  app.post('/api/auth/request-password-reset', async (req, res) => {
    try {
      const { email } = passwordResetRequestSchema.parse(req.body);
      
      // Always return success to prevent user enumeration
      // The service handles checking if user exists internally
      const token = await authService.createPasswordResetToken(email);
      
      console.log('[AUTH] Password reset requested for:', email);

      res.json({
        success: true,
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });

    } catch (error) {
      console.error('[AUTH] Password reset request error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to process password reset request. Please try again.'
      });
    }
  });

  // Password reset endpoint
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = passwordResetSchema.parse(req.body);
      
      const result = await authService.resetPassword(token, newPassword);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      console.log('[AUTH] Password reset successful:', result.user?.id);

      res.json({
        success: true,
        message: 'Password reset successful! You can now login with your new password.'
      });

    } catch (error) {
      console.error('[AUTH] Password reset error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid reset data',
          details: error.errors.map((e: any) => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      res.status(500).json({
        success: false,
        error: 'Password reset failed. Please try again.'
      });
    }
  });

  // ======================
  // EXISTING REPLIT AUTH ROUTES (TO BE REPLACED)
  // ======================

  // Auth routes  
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Simple in-memory cache for webhook event idempotency (24 hour TTL)
  const processedEvents = new Map<string, number>();
  const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  function isEventProcessed(eventId: string): boolean {
    const processedAt = processedEvents.get(eventId);
    if (!processedAt) return false;
    
    // Clean up expired entries
    if (Date.now() - processedAt > IDEMPOTENCY_TTL) {
      processedEvents.delete(eventId);
      return false;
    }
    
    return true;
  }
  
  function markEventProcessed(eventId: string): void {
    processedEvents.set(eventId, Date.now());
  }

  // Stripe webhook endpoint - must be BEFORE express.json() middleware
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(400).send('Webhook secret not configured');
    }

    let event: Stripe.Event;

    try {
      if (!stripe) throw new Error('Stripe not configured');
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return res.status(400).send(`Webhook Error: ${err}`);
    }

    // Idempotency check - skip if already processed
    if (isEventProcessed(event.id)) {
      console.log(`[Stripe Webhook] Event ${event.id} already processed, skipping`);
      return res.status(200).json({ received: true, skipped: 'duplicate' });
    }

    console.log(`[Stripe Webhook] Processing event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(session);
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionChanged(subscription);
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(subscription);
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentSucceeded(invoice);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentFailed(invoice);
          break;
        }
        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      // Mark event as processed after successful handling
      markEventProcessed(event.id);
      res.status(200).json({ received: true });
    } catch (error) {
      console.error(`[Stripe Webhook] Error processing event ${event.type}:`, error);
      res.status(500).json({ 
        success: false, 
        error: 'Webhook processing failed' 
      });
    }
  });

  // Webhook handler functions
  async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    console.log(`[Webhook] Processing checkout.session.completed for session: ${session.id}`);
    
    if (!session.customer || !session.subscription || !session.metadata?.userId) {
      console.error('Missing required data in checkout session:', session);
      return;
    }

    const userId = session.metadata.userId;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    // Update user with Stripe customer info
    await storage.updateUserSubscription(userId, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    });

    // Log the subscription creation event
    const plan = await storage.getSubscriptionPlanByPriceId(session.metadata?.priceId || '');
    if (plan) {
      await storage.createSubscriptionHistory({
        userId,
        toTier: plan.tier,
        eventType: 'subscription_created',
        stripeEventId: session.id,
        metadata: {
          sessionId: session.id,
          customerId,
          subscriptionId,
          amountPaid: session.amount_total,
          currency: session.currency,
        },
      });
    }

    console.log(`[Webhook] Successfully processed checkout completion for user: ${userId}`);
  }

  async function handleSubscriptionChanged(subscription: Stripe.Subscription) {
    console.log(`[Webhook] Processing subscription change: ${subscription.id}`);
    
    const customerId = subscription.customer as string;
    
    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error(`User not found for customer ID: ${customerId}`);
      return;
    }

    // Map Stripe subscription to our tier system
    const priceId = subscription.items.data[0]?.price.id;
    const plan = await storage.getSubscriptionPlanByPriceId(priceId);
    
    if (!plan) {
      console.error(`No plan found for price ID: ${priceId}`);
      return;
    }

    // Update user subscription details
    const status = subscription.status === 'active' ? 'active' as const : 
                   subscription.status === 'trialing' ? 'trialing' as const : 
                   subscription.status === 'canceled' ? 'canceled' as const : 
                   subscription.status === 'past_due' ? 'past_due' as const :
                   subscription.status === 'unpaid' ? 'unpaid' as const :
                   subscription.status === 'incomplete' ? 'incomplete' as const :
                   subscription.status === 'incomplete_expired' ? 'incomplete_expired' as const : null;
    
    await storage.updateUserSubscription(user.id, {
      stripeSubscriptionId: subscription.id,
      subscriptionTier: plan.tier,
      subscriptionStatus: status || undefined,
      subscriptionCurrentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
    });

    // Log the subscription change
    await storage.createSubscriptionHistory({
      userId: user.id,
      toTier: plan.tier,
      eventType: subscription.status === 'active' ? 'subscription_activated' : 'subscription_updated',
      stripeEventId: subscription.id,
      metadata: {
        subscriptionId: subscription.id,
        status: subscription.status,
        tier: plan.tier,
        priceId,
        currentPeriodEnd: (subscription as any).current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });

    console.log(`[Webhook] Updated subscription for user: ${user.id}, status: ${subscription.status}`);
  }

  async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    console.log(`[Webhook] Processing subscription deletion: ${subscription.id}`);
    
    const customerId = subscription.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error(`User not found for customer ID: ${customerId}`);
      return;
    }

    // Update user to inactive status
    await storage.updateUserSubscription(user.id, {
      subscriptionStatus: 'canceled',
      subscriptionTier: undefined,
      subscriptionCancelAtPeriodEnd: false,
    });

    // Log the cancellation
    await storage.createSubscriptionHistory({
      userId: user.id,
      toTier: 'basic', // Default tier after cancellation
      eventType: 'subscription_canceled',
      stripeEventId: subscription.id,
      metadata: {
        subscriptionId: subscription.id,
        canceledAt: subscription.canceled_at,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });

    console.log(`[Webhook] Canceled subscription for user: ${user.id}`);
  }

  async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
    console.log(`[Webhook] Processing successful payment: ${invoice.id}`);
    
    if (!invoice.customer || !(invoice as any).subscription) return;

    const customerId = invoice.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error(`User not found for customer ID: ${customerId}`);
      return;
    }

    const subscriptionId = typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : (invoice as any).subscription?.id;
    if (subscriptionId) {
      // Get current user tier for logging
      const subscriptionStatus = await storage.getUserSubscriptionStatus(user.id);
      await storage.createSubscriptionHistory({
        userId: user.id,
        toTier: subscriptionStatus.tier || 'basic',
        eventType: 'payment_succeeded',
        stripeEventId: invoice.id || '',
        metadata: {
          invoiceId: invoice.id,
          subscriptionId,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          paidAt: invoice.status_transitions?.paid_at || null,
        },
      });
    }

    // Reset monthly AI usage on successful payment (new billing cycle)
    await storage.resetMonthlyAiUsage(user.id);

    console.log(`[Webhook] Recorded payment success for user: ${user.id}`);
  }

  async function handlePaymentFailed(invoice: Stripe.Invoice) {
    console.log(`[Webhook] Processing failed payment: ${invoice.id}`);
    
    if (!invoice.customer) return;

    const customerId = invoice.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error(`User not found for customer ID: ${customerId}`);
      return;
    }

    const subscriptionId = typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : (invoice as any).subscription?.id;
    if (subscriptionId) {
      // Get current user tier for logging
      const subscriptionStatus = await storage.getUserSubscriptionStatus(user.id);
      await storage.createSubscriptionHistory({
        userId: user.id,
        toTier: subscriptionStatus.tier || 'basic',
        eventType: 'payment_failed',
        stripeEventId: invoice.id || '',
        metadata: {
          invoiceId: invoice.id,
          subscriptionId,
          amountDue: invoice.amount_due,
          currency: invoice.currency,
          attemptCount: invoice.attempt_count || 0,
        },
      });
    }

    // Note: Don't immediately downgrade - Stripe will handle retry logic
    console.log(`[Webhook] Recorded payment failure for user: ${user.id}`);
  }

  // Subscription Management Endpoints
  
  // Get subscription plans
  app.get('/api/subscription/plans', async (req, res) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      res.json({ success: true, data: plans });
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({ success: false, error: "Failed to fetch subscription plans" });
    }
  });

  // Get user subscription status
  app.get('/api/subscription/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const status = await storage.getUserSubscriptionStatus(userId);
      
      const response = subscriptionStatusResponseSchema.parse({
        hasActiveSubscription: status.hasActiveSubscription,
        tier: status.tier,
        status: status.status,
        currentPeriodEnd: status.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: status.cancelAtPeriodEnd,
        trialEndsAt: status.trialEndsAt?.toISOString() || null,
      });
      
      res.json({ success: true, data: response });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ success: false, error: "Failed to fetch subscription status" });
    }
  });

  // V1 API routes for frontend compatibility
  
  // Get subscription plans (v1 endpoint)
  app.get('/api/v1/subscription/plans', async (req, res) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      
      // Transform plans to match frontend interface
      const transformedPlans = plans.map(plan => ({
        id: plan.id,
        tier: plan.tier,
        name: plan.name,
        stripePriceId: plan.stripePriceId,
        price: plan.price,
        currency: plan.currency,
        interval: 'month', // Default interval
        features: Array.isArray(plan.features) ? plan.features : [],
        // Map limits object to flattened fields expected by frontend
        aiQueriesLimit: (plan.limits as any)?.aiQueriesLimit || 0,
        projectsLimit: (plan.limits as any)?.projectsLimit || 0,
        forcesLimit: (plan.limits as any)?.forcesLimit || 0,
        usersLimit: (plan.limits as any)?.usersLimit || 1,
        apiAccess: (plan.limits as any)?.apiAccess || false,
        customReports: (plan.limits as any)?.customReports || false,
        priority: plan.tier === 'basic' ? 1 : plan.tier === 'professional' ? 2 : 3
      }));
      
      res.json(transformedPlans);
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({ error: "Failed to fetch subscription plans" });
    }
  });

  // Get current user subscription (v1 endpoint)
  app.get('/api/v1/subscription/current', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.stripeSubscriptionId) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      // Get the user's subscription plan
      const plan = user.subscriptionTier ? await storage.getSubscriptionPlan(user.subscriptionTier) : null;
      
      if (!plan) {
        return res.status(404).json({ error: "Subscription plan not found" });
      }

      const subscription = {
        id: user.stripeSubscriptionId,
        userId: user.id,
        planId: plan.id,
        stripeSubscriptionId: user.stripeSubscriptionId,
        status: user.subscriptionStatus || 'active',
        currentPeriodStart: new Date().toISOString(), // Placeholder
        currentPeriodEnd: user.subscriptionCurrentPeriodEnd?.toISOString() || new Date().toISOString(),
        aiUsageMonth: 0, // Placeholder - will be implemented with AI usage tracking
        plan: {
          id: plan.id,
          tier: plan.tier,
          name: plan.name,
          stripePriceId: plan.stripePriceId,
          price: plan.price,
          currency: plan.currency,
          interval: 'month',
          features: Array.isArray(plan.features) ? plan.features : [],
          aiQueriesLimit: (plan.limits as any)?.aiQueriesLimit || 0,
          projectsLimit: (plan.limits as any)?.projectsLimit || 0,
          forcesLimit: (plan.limits as any)?.forcesLimit || 0,
          usersLimit: (plan.limits as any)?.usersLimit || 1,
          apiAccess: (plan.limits as any)?.apiAccess || false,
          customReports: (plan.limits as any)?.customReports || false,
          priority: plan.tier === 'basic' ? 1 : plan.tier === 'professional' ? 2 : 3
        }
      };
      
      res.json(subscription);
    } catch (error) {
      console.error("Error fetching current subscription:", error);
      res.status(500).json({ error: "Failed to fetch current subscription" });
    }
  });

  // Create checkout session (v1 endpoint)
  app.post('/api/v1/subscription/checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { planId, successUrl, cancelUrl } = req.body;

      if (!planId || !successUrl || !cancelUrl) {
        return res.status(400).json({ error: "Missing required parameters: planId, successUrl, cancelUrl" });
      }

      // Get the subscription plan by ID
      const plan = await storage.getSubscriptionPlanById(planId);
      if (!plan) {
        return res.status(404).json({ error: "Subscription plan not found" });
      }

      // Get or create Stripe customer
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        // Create new Stripe customer
        if (!stripe) {
          return res.status(500).json({ error: "Stripe not configured" });
        }
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: {
            userId: user.id
          }
        });
        customerId = customer.id;
        
        // Update user with Stripe customer ID
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }

      // Create Stripe checkout session
      try {
        if (!stripe) {
          return res.status(500).json({ error: "Stripe not configured" });
        }
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{
            price: plan.stripePriceId,
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            userId: user.id,
            planId: plan.id,
          },
        });

        res.json({ url: session.url });
      } catch (stripeError: any) {
        console.error("Stripe checkout error:", stripeError);
        
        // Handle missing price IDs in development environment
        if (stripeError.code === 'resource_missing' && stripeError.param === 'line_items[0][price]') {
          return res.status(400).json({ 
            error: "Stripe configuration incomplete", 
            message: `The price ID "${plan.stripePriceId}" is not configured in Stripe. In a production environment, this would redirect to Stripe checkout.`,
            details: {
              tier: plan.tier,
              plan: plan.name,
              expectedPrice: `€${(plan.price / 100).toFixed(2)}`,
              stripePriceId: plan.stripePriceId
            }
          });
        }
        
        // Re-throw other Stripe errors
        throw stripeError;
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // URL whitelist for checkout redirects to prevent open redirects
  const allowedDomains = [
    'localhost:5000',
    'replit.app', 
    'replit.dev',
    process.env.REPLIT_DEV_DOMAIN,
  ].filter(Boolean);

  function validateCheckoutUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return allowedDomains.some(domain => domain && urlObj.hostname.endsWith(domain));
    } catch {
      return false;
    }
  }

  // Create Stripe checkout session for subscription
  app.post('/api/subscription/create-checkout-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { tier, successUrl, cancelUrl } = createCheckoutSessionRequestSchema.parse(req.body);
      
      // Validate redirect URLs to prevent open redirect attacks
      if (!validateCheckoutUrl(successUrl || '') || !validateCheckoutUrl(cancelUrl || '')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid redirect URLs provided',
          code: 'INVALID_REDIRECT_URL',
        });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const plan = await storage.getSubscriptionPlan(tier);
      if (!plan) {
        return res.status(404).json({ success: false, error: "Subscription plan not found" });
      }

      // Create or retrieve Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        if (!stripe) throw new Error('Stripe not configured');
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          metadata: {
            userId: user.id,
          },
        });
        customerId = customer.id;
        
        // Update user with Stripe customer ID
        await storage.updateUserSubscription(userId, { stripeCustomerId: customerId });
      }

      // Create Stripe checkout session
      if (!stripe) throw new Error('Stripe not configured');
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl || `${req.protocol}://${req.get('host')}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/pricing`,
        metadata: {
          userId: user.id,
          tier: tier,
          priceId: plan.stripePriceId,
        },
      });

      res.json({ success: true, data: { url: session.url, sessionId: session.id } });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ success: false, error: "Failed to create checkout session" });
    }
  });

  // Cancel subscription
  app.post('/api/subscription/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeSubscriptionId) {
        return res.status(404).json({ success: false, error: "No active subscription found" });
      }

      // Cancel subscription at period end
      if (!stripe) throw new Error('Stripe not configured');
      const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      // Update user subscription status
      await storage.updateUserSubscription(userId, {
        subscriptionCancelAtPeriodEnd: true,
      });

      // Record subscription history
      await storage.createSubscriptionHistory({
        userId: userId,
        fromTier: user.subscriptionTier,
        toTier: user.subscriptionTier!,
        eventType: 'subscription_canceled',
        stripeEventId: null,
        metadata: { canceledAt: new Date().toISOString() },
      });

      res.json({ success: true, message: "Subscription canceled successfully" });
    } catch (error) {
      console.error("Error canceling subscription:", error);
      res.status(500).json({ success: false, error: "Failed to cancel subscription" });
    }
  });

  // Reactivate subscription
  app.post('/api/subscription/reactivate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeSubscriptionId) {
        return res.status(404).json({ success: false, error: "No subscription found" });
      }

      // Reactivate subscription
      if (!stripe) throw new Error('Stripe not configured');
      const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      // Update user subscription status
      await storage.updateUserSubscription(userId, {
        subscriptionCancelAtPeriodEnd: false,
      });

      // Record subscription history
      await storage.createSubscriptionHistory({
        userId: userId,
        fromTier: user.subscriptionTier,
        toTier: user.subscriptionTier!,
        eventType: 'subscription_reactivated',
        stripeEventId: null,
        metadata: { reactivatedAt: new Date().toISOString() },
      });

      res.json({ success: true, message: "Subscription reactivated successfully" });
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      res.status(500).json({ success: false, error: "Failed to reactivate subscription" });
    }
  });

  // Get subscription history
  app.get('/api/subscription/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const history = await storage.getSubscriptionHistory(userId);
      res.json({ success: true, data: history });
    } catch (error) {
      console.error("Error fetching subscription history:", error);
      res.status(500).json({ success: false, error: "Failed to fetch subscription history" });
    }
  });

  // Get user capabilities based on subscription
  app.get('/api/subscription/capabilities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const capabilities = await getUserCapabilities(userId);
      res.json({ success: true, data: capabilities });
    } catch (error) {
      console.error("Error fetching user capabilities:", error);
      res.status(500).json({ success: false, error: "Failed to fetch user capabilities" });
    }
  });

  // User Profile Management Endpoints
  
  // Get user profile
  app.get('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: "User not found" 
        });
      }

      // Return profile data (exclude sensitive fields)
      const profile = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        companyName: user.companyName,
        jobTitle: user.jobTitle,
        industry: user.industry,
        country: user.country,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      res.json({ success: true, data: profile });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch user profile" 
      });
    }
  });

  // Update user profile
  app.put('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate input
      const updateProfileSchema = z.object({
        firstName: z.string().max(50).optional(),
        lastName: z.string().max(50).optional(),
        companyName: z.string().max(100).optional(),
        jobTitle: z.string().max(100).optional(),
        industry: z.string().max(50).optional(),
        country: z.string().max(50).optional(),
        profileImageUrl: z.string().url().optional()
      });

      const updates = updateProfileSchema.parse(req.body);
      
      // Update user profile
      const updatedUser = await storage.updateUser(userId, updates);
      
      // Return updated profile data (exclude sensitive fields)
      const profile = {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        profileImageUrl: updatedUser.profileImageUrl,
        companyName: updatedUser.companyName,
        jobTitle: updatedUser.jobTitle,
        industry: updatedUser.industry,
        country: updatedUser.country,
        emailVerified: updatedUser.emailVerified,
        updatedAt: updatedUser.updatedAt
      };

      console.log('[PROFILE] Profile updated successfully:', userId);
      res.json({ 
        success: true, 
        message: 'Profile updated successfully',
        data: profile 
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid profile data provided',
          details: error.errors
        });
      }

      res.status(500).json({ 
        success: false, 
        error: "Failed to update user profile" 
      });
    }
  });

  // Change password
  app.put('/api/user/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate input
      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string()
          .min(8, 'New password must be at least 8 characters')
          .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
            'New password must contain uppercase, lowercase, number, and special character')
      });

      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      
      // Get user and verify current password
      const user = await storage.getUser(userId);
      if (!user || !user.passwordHash) {
        return res.status(404).json({ 
          success: false, 
          error: "User not found" 
        });
      }

      const isCurrentPasswordValid = await authService.verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      // Hash new password and update
      const newPasswordHash = await authService.hashPassword(newPassword);
      await storage.updateUser(userId, { passwordHash: newPasswordHash });

      console.log('[PROFILE] Password changed successfully:', userId);
      res.json({ 
        success: true, 
        message: 'Password changed successfully' 
      });
    } catch (error) {
      console.error("Error changing password:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid password data provided',
          details: error.errors
        });
      }

      res.status(500).json({ 
        success: false, 
        error: "Failed to change password" 
      });
    }
  });

  // REMOVED: Demo endpoint for security in production

  // DIAGNOSTIC: Environment info - restricted access for security
  app.get('/api/diagnostics/environment', isAuthenticated, async (req, res) => {
    try {
      const defaultProjectId = '86a87a60-5ceb-4717-8217-d125eb0a5d5f';
      
      // Get database connection status
      let dbConnected = false;
      let totalForces = 0;
      let defaultProjectForceCount = 0;
      let projectsCount = 0;
      let error = null;

      try {
        // Import required database functions
        const { db } = await import('./db');
        const { sql } = await import('drizzle-orm');
        const { drivingForces, projects: projectsTable } = await import('@shared/schema');
        
        // Test basic database connectivity
        const allProjects = await storage.getProjects();
        projectsCount = allProjects.length;
        dbConnected = true;

        // Get ACTUAL database record count (like ensureDefaultProject does)
        const [totalForceCount] = await db.select({ count: sql<number>`count(*)` }).from(drivingForces);
        totalForces = totalForceCount?.count || 0;

        // Get force count from default project (project assignment)
        const defaultProjectResult = await storage.getDrivingForces(defaultProjectId, undefined, undefined, {
          limit: 1,
          includeSignals: true
        });
        defaultProjectForceCount = defaultProjectResult.total;
        
      } catch (dbError: any) {
        error = dbError.message;
      }

      // Environment detection
      const environment = process.env.NODE_ENV || 'unknown';
      const isReplit = !!process.env.REPL_ID;
      const replId = process.env.REPL_ID || 'not-set';
      
      // Get current routes that are active
      const activeRoutes = [
        '/api/v1/projects',
        '/api/v1/forces/search',
        '/api/v1/scanning/forces',
        '/api/diagnostics/environment'
      ];

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        environment: {
          nodeEnv: environment,
          isReplit,
          replId,
        },
        database: {
          connected: dbConnected,
          totalForces,
          defaultProjectForceCount,
          projectsCount,
          defaultProjectId,
          error
        },
        routes: {
          activeRoutes,
          version: 'v1'
        },
        authentication: {
          demoBypassEnabled: false,
          note: 'Real authentication required'
        }
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Projects (PROTECTED)
  app.get("/api/v1/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const projects = await storage.getProjectsByUser(userId);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.post("/api/v1/projects", isAuthenticated, checkResourceLimits('projects'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const project = insertProjectSchema.parse(req.body);
      // Ensure the project is created with the authenticated user's ID
      const projectWithUser = { ...project, userId };
      const created = await storage.createProject(projectWithUser);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.message === "DUPLICATE_NAME") {
        return res.status(409).json({ 
          error: "Project name already exists", 
          message: "A project with this name already exists. Please choose a different name." 
        });
      }
      console.error('Project creation error:', error);
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  app.get("/api/v1/projects/:id", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      // Project already available from verifyProjectOwnership middleware
    const project = req.project;
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.delete("/api/v1/projects/:id", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const deleted = await storage.deleteProject(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      if (error.message === "Cannot delete default project") {
        return res.status(403).json({ error: "Cannot delete default project" });
      }
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  app.post("/api/v1/projects/:id/duplicate", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { name, selectedForceIds } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Project name is required" });
      }
      
      // Validate selectedForceIds if provided
      if (selectedForceIds !== undefined) {
        if (!Array.isArray(selectedForceIds)) {
          return res.status(400).json({ error: "selectedForceIds must be an array" });
        }
        
        if (selectedForceIds.length === 0) {
          return res.status(400).json({ error: "selectedForceIds cannot be empty. Omit the field to duplicate all forces." });
        }
        
        // Validate that all selectedForceIds are strings
        if (!selectedForceIds.every(id => typeof id === 'string')) {
          return res.status(400).json({ error: "All selectedForceIds must be strings" });
        }
      }
      
      const duplicatedProject = await storage.duplicateProject(req.params.id, name, selectedForceIds);
      res.json(duplicatedProject);
    } catch (error: any) {
      if (error.message === "Project not found") {
        return res.status(404).json({ error: "Project not found" });
      }
      if (error.message === "DUPLICATE_NAME") {
        return res.status(409).json({ 
          error: "Project name already exists", 
          message: "A project with this name already exists. Please choose a different name." 
        });
      }
      if (error.message === "FULL_COPY_FROM_DEFAULT_FORBIDDEN") {
        return res.status(400).json({ 
          error: "Cannot duplicate entire default project",
          message: "Full duplication from the default project is not allowed. Please select specific forces to duplicate."
        });
      }
      if (error.message.includes("Some selected forces not found")) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Project duplication error:', error);
      res.status(500).json({ error: "Failed to duplicate project" });
    }
  });

  // Driving Forces
  app.get("/api/v1/scanning/forces", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { project_id, lens, steep, search, type, limit = '5000', offset = '0', include_embeddings = 'false', includeSignals = 'false' } = req.query;
      
      // Check subscription-based data access restrictions
      const userId = req.user.id;
      const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
      let forceTypeRestrictions = null;
      
      // Apply subscription-based restrictions
      if (!subscriptionStatus.hasActiveSubscription || !subscriptionStatus.tier) {
        return res.status(403).json({
          success: false,
          error: 'Active subscription required to access driving forces',
          code: 'SUBSCRIPTION_REQUIRED',
          upgradeUrl: '/pricing',
        });
      }
      
      if (subscriptionStatus.tier === 'basic') {
        // Basic tier: 2,886 curated forces (exclude signals)
        console.log('[SUBSCRIPTION] Basic tier access - curated forces only');
        forceTypeRestrictions = ['M', 'T', 'WS', 'WC']; // Exclude 'S' (Signals) - use abbreviated codes
      } else {
        // Professional/Enterprise: All forces including signals
        console.log(`[SUBSCRIPTION] ${subscriptionStatus.tier} tier access - all forces including signals`);
        forceTypeRestrictions = null;
      }
      
      const options = {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        includeEmbeddings: include_embeddings === 'true',
        includeSignals: forceTypeRestrictions === null, // Include signals only for Professional/Enterprise
        forceTypeRestrictions: forceTypeRestrictions // Add restrictions for Basic tier
      };
      
      const result = await storage.getDrivingForces(
        project_id as string,
        lens as string,
        { steep, search, type },
        options
      );
      
      res.json({
        forces: result.forces,
        total: result.total,
        limit: options.limit,
        offset: options.offset,
        hasMore: result.total > options.offset + options.limit
      });
    } catch (error) {
      console.error('Error fetching driving forces:', error);
      res.status(500).json({ error: "Failed to fetch driving forces" });
    }
  });

  // Comprehensive Search Endpoint
  app.get("/api/v1/forces/search", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      // Convert query parameters to proper types for validation
      const queryParams = {
        q: req.query.q as string,
        projectId: req.query.projectId as string,
        types: req.query.types ? (Array.isArray(req.query.types) ? req.query.types as string[] : [req.query.types as string]) : undefined,
        steep: req.query.steep ? (Array.isArray(req.query.steep) ? req.query.steep as string[] : [req.query.steep as string]).filter(s => s !== 'all') : undefined,
        sentiments: req.query.sentiments ? (Array.isArray(req.query.sentiments) ? req.query.sentiments as string[] : [req.query.sentiments as string]) : undefined,
        impactMin: req.query.impactMin ? parseFloat(req.query.impactMin as string) : undefined,
        impactMax: req.query.impactMax ? parseFloat(req.query.impactMax as string) : undefined,
        horizons: req.query.horizons ? (Array.isArray(req.query.horizons) ? req.query.horizons as string[] : [req.query.horizons as string]) : undefined,
        tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags as string[] : [req.query.tags as string]) : undefined,
        source: req.query.source as string,
        scope: req.query.scope as string,
        createdAfter: req.query.createdAfter as string,
        createdBefore: req.query.createdBefore as string,
        sort: req.query.sort as string || 'relevance',
        sortOrder: req.query.sortOrder as string || 'desc',
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
        includeFacets: req.query.includeFacets !== 'false', // Default true
        includeEmbeddings: req.query.includeEmbeddings === 'true', // Default false
      };

      // Validate the search query
      const validatedQuery = searchQuerySchema.parse(queryParams);
      
      // Execute the search
      const searchResults = await storage.queryForces(validatedQuery);
      
      res.json(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes("validation") || error.name === "ZodError") {
          res.status(400).json({ error: `Invalid search parameters: ${error.message}` });
        } else {
          res.status(500).json({ error: `Search failed: ${error.message}` });
        }
      } else {
        res.status(500).json({ error: "An unexpected error occurred during search" });
      }
    }
  });

  // Batch Forces Endpoint
  app.get("/api/v1/forces/batch", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { ids, project_id, include_embeddings = 'false', includeSignals = 'false' } = req.query;
      
      // Validate required parameters
      if (!ids) {
        return res.status(400).json({ error: "Missing required parameter: ids" });
      }
      
      // Parse comma-separated IDs
      let forceIds: string[];
      try {
        forceIds = (ids as string).split(',').map(id => id.trim()).filter(id => id.length > 0);
      } catch (error) {
        return res.status(400).json({ error: "Invalid ids format. Expected comma-separated list of IDs." });
      }
      
      // Validate ID count (max 100 for moderate batches as per requirements)
      if (forceIds.length === 0) {
        return res.status(400).json({ error: "At least one ID is required" });
      }
      
      if (forceIds.length > 100) {
        return res.status(400).json({ error: "Too many IDs requested. Maximum 100 IDs allowed per batch." });
      }
      
      // Validate that all IDs are non-empty strings
      if (forceIds.some(id => typeof id !== 'string' || id.length === 0)) {
        return res.status(400).json({ error: "All IDs must be non-empty strings" });
      }
      
      // Configure options
      const options = {
        includeEmbeddings: include_embeddings === 'true',
        includeSignals: includeSignals === 'true'
      };
      
      // Fetch forces by IDs
      const result = await storage.getDrivingForcesByIds(
        forceIds,
        project_id as string,
        options
      );
      
      // Handle case where some forces were not found
      if (result.notFound.length > 0) {
        // If project validation is enabled and forces are missing, it could be due to project mismatch or non-existent IDs
        if (project_id) {
          return res.status(404).json({
            error: "Some forces not found or do not belong to the specified project",
            forces: result.forces,
            notFound: result.notFound,
            message: `${result.notFound.length} of ${forceIds.length} requested forces were not found`
          });
        } else {
          return res.status(404).json({
            error: "Some forces not found",
            forces: result.forces,
            notFound: result.notFound,
            message: `${result.notFound.length} of ${forceIds.length} requested forces were not found`
          });
        }
      }
      
      // Return successful result
      res.json({
        forces: result.forces,
        total: result.forces.length,
        requested: forceIds.length
      });
      
    } catch (error) {
      console.error('Error fetching forces by batch:', error);
      res.status(500).json({ error: "Failed to fetch forces" });
    }
  });

  // Saved Searches
  app.get("/api/v1/saved-searches", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      
      const searches = await storage.getSavedSearches(projectId as string);
      res.json(searches);
    } catch (error) {
      console.error('Error fetching saved searches:', error);
      res.status(500).json({ error: "Failed to fetch saved searches" });
    }
  });

  app.post("/api/v1/saved-searches", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const searchData = insertSavedSearchSchema.parse(req.body);
      const created = await storage.createSavedSearch(searchData);
      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating saved search:', error);
      if (error instanceof Error && error.message.includes("validation")) {
        res.status(400).json({ error: `Invalid saved search data: ${error.message}` });
      } else {
        res.status(500).json({ error: "Failed to create saved search" });
      }
    }
  });

  app.get("/api/v1/saved-searches/:id", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const search = await storage.getSavedSearch(req.params.id);
      if (!search) {
        return res.status(404).json({ error: "Saved search not found" });
      }
      res.json(search);
    } catch (error) {
      console.error('Error fetching saved search:', error);
      res.status(500).json({ error: "Failed to fetch saved search" });
    }
  });

  app.put("/api/v1/saved-searches/:id", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const updates = insertSavedSearchSchema.partial().parse(req.body);
      const updated = await storage.updateSavedSearch(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error updating saved search:', error);
      if (error instanceof Error && error.message.includes("validation")) {
        res.status(400).json({ error: `Invalid update data: ${error.message}` });
      } else {
        res.status(500).json({ error: "Failed to update saved search" });
      }
    }
  });

  app.delete("/api/v1/saved-searches/:id", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const deleted = await storage.deleteSavedSearch(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Saved search not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting saved search:', error);
      res.status(500).json({ error: "Failed to delete saved search" });
    }
  });

  // Clusters
  app.get("/api/v1/clusters", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { project_id, method } = req.query;
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }
      
      // Default to using the 37 meaningful clusters from orion
      const targetMethod = (method as string) || 'orion';
      const clusters = await storage.getClusters(project_id as string, targetMethod);
      res.json(clusters);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch clusters" });
    }
  });

  app.post("/api/v1/scanning/import", isAuthenticated, (app.locals.upload as any).single('file'), verifyProjectOwnership, async (req: any, res) => {
    try {
      const { projectId } = req.body;
      const file = req.file;
      
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }
      
      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }

      // Parse the uploaded file
      const parsedForces = await fileParserService.parseFile(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      if (parsedForces.length === 0) {
        return res.status(400).json({ error: "No valid data found in the uploaded file" });
      }

      // Add projectId to each force and validate
      const forcesData = parsedForces.map((force) => ({
        ...force,
        projectId,
      }));
      
      const validatedForces = forcesData.map((force: any) => 
        insertDrivingForceSchema.parse(force)
      );
      
      const created = await storage.createDrivingForces(validatedForces);
      
      res.status(201).json({ 
        count: created.length, 
        forces: created,
        message: `Successfully imported ${created.length} driving forces`
      });
    } catch (error) {
      console.error("File import error:", error);
      
      if (error instanceof Error) {
        if (error.message.includes("validation") || error.message.includes("Row")) {
          res.status(400).json({ error: error.message });
        } else {
          res.status(400).json({ error: `File processing failed: ${error.message}` });
        }
      } else {
        res.status(500).json({ error: "Failed to process file upload" });
      }
    }
  });

  // Bulk edit endpoints for Enhanced Scanning Assistant
  app.post("/api/v1/scanning/forces/bulk/preview", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'scanningAssistant' }), async (req: any, res) => {
    try {
      const bulkEditRequest = bulkEditRequestSchema.parse(req.body);
      
      // Get forces that match the filters
      const matchingForces = await storage.getDrivingForcesBulkEditPreview(
        bulkEditRequest.projectId,
        bulkEditRequest.filters
      );
      
      if (matchingForces.length === 0) {
        return res.status(200).json({
          affectedForces: [],
          totalCount: 0,
          summary: "No forces match the specified criteria"
        });
      }
      
      // Create preview showing what will change
      const affectedForces = matchingForces.map((force: any) => {
        const currentValues: Record<string, any> = {};
        const newValues: Record<string, any> = {};
        
        Object.entries(bulkEditRequest.updates).forEach(([field, value]) => {
          if (value !== undefined) {
            const currentValue = force[field as keyof typeof force];
            // Handle undefined values by setting them as null for JSON serialization
            currentValues[field] = currentValue !== undefined ? currentValue : null;
            newValues[field] = value;
          }
        });
        
        return {
          id: force.id,
          title: force.title,
          currentValues,
          newValues
        };
      });
      
      const summary = `Will update ${affectedForces.length} force${affectedForces.length === 1 ? '' : 's'}`;
      
      res.status(200).json({
        affectedForces,
        totalCount: affectedForces.length,
        summary
      });
    } catch (error) {
      console.error("Bulk edit preview error:", error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to generate preview" });
      }
    }
  });

  app.patch("/api/v1/scanning/forces/bulk/execute", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'scanningAssistant' }), async (req: any, res) => {
    try {
      const bulkEditRequest = bulkEditRequestSchema.parse(req.body);
      
      // Execute the bulk update
      const updatedForces = await storage.updateDrivingForcesBulk(
        bulkEditRequest.projectId,
        bulkEditRequest.filters,
        bulkEditRequest.updates
      );
      
      res.status(200).json({
        updatedCount: updatedForces.length,
        updatedForces,
        message: `Successfully updated ${updatedForces.length} driving force${updatedForces.length === 1 ? '' : 's'}`
      });
    } catch (error) {
      console.error("Bulk edit execution error:", error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to execute bulk update" });
      }
    }
  });

  // Command parsing endpoint for Enhanced Scanning Assistant  
  app.post("/api/v1/scanning/forces/parse-command", isAuthenticated, requireSubscriptionFeature({ feature: 'scanningAssistant' }), async (req: any, res) => {
    try {
      const { projectId, message, selectedForces } = parseCommandRequestSchema.parse(req.body);

      // Parse the natural language command
      const command = commandParserService.parseEditCommand(message, projectId, selectedForces);
      
      if (!command) {
        return res.status(200).json({
          success: false,
          error: "Could not parse command",
          message: "I couldn't understand that edit command. Try being more specific with patterns like 'change impact of selected forces to 8' or 'mark first 5 forces as megatrends'."
        });
      }

      // Convert to bulk edit request
      const bulkRequest = commandParserService.createBulkEditRequest(command, projectId);
      
      res.status(200).json({
        success: true,
        command,
        bulkRequest,
        confidence: command.confidence
      });
      
    } catch (error) {
      console.error('Error parsing command:', error);
      if (error instanceof Error) {
        res.status(400).json({ success: false, error: error.message });
      } else {
        res.status(500).json({ success: false, error: "Failed to parse command" });
      }
    }
  });

  app.post("/api/v1/scanning/preprocess", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      // Check if reprocessing is allowed (Fixed Loader integration)
      if (!isReprocessAllowed()) {
        const reason = getReprocessBlockingReason();
        return res.status(403).json({
          error: "Reprocessing blocked",
          message: reason,
          hint: "Set ALLOW_REPROCESS=true to enable data reprocessing"
        });
      }

      const { projectId, params } = req.body;
      
      const job = await storage.createJob({
        type: "preprocess",
        status: "pending",
        metaJson: { projectId, params },
      });

      // Start preprocessing in background
      preprocessingService.processProject(job.id, projectId, params);
      
      res.status(201).json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to start preprocessing" });
    }
  });

  // Analytics radar endpoint with Advanced Search filter support and radar-specific column mapping
  app.get("/api/v1/analytics/radar", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'advancedClustering' }), requireIntegrityOk, async (req: any, res) => {
    try {
      // Parse and convert query parameters properly
      const rawQuery = req.query;
      
      const parsedQuery = {
        ...rawQuery,
        // Convert string query params to expected types
        pageSize: rawQuery.pageSize ? parseInt(rawQuery.pageSize as string) : undefined,
        page: rawQuery.page ? parseInt(rawQuery.page as string) : undefined,
        impactMin: rawQuery.impactMin ? parseFloat(rawQuery.impactMin as string) : undefined,
        impactMax: rawQuery.impactMax ? parseFloat(rawQuery.impactMax as string) : undefined,
        // Map project_id parameter to projectId (expected by searchQuerySchema)
        projectId: rawQuery.project_id ? String(rawQuery.project_id) : undefined,
        // Map search parameter to q (expected by searchQuerySchema) - preserve existing q if provided
        q: rawQuery.search ? String(rawQuery.search) : (rawQuery.q ? String(rawQuery.q) : undefined),
        // Handle array parameters
        types: rawQuery.types ? (typeof rawQuery.types === 'string' ? rawQuery.types.split(',') : rawQuery.types) : undefined,
        dimensions: rawQuery.dimensions ? (typeof rawQuery.dimensions === 'string' ? rawQuery.dimensions.split(',') : rawQuery.dimensions) : undefined,
        steep: rawQuery.steep ? (typeof rawQuery.steep === 'string' ? rawQuery.steep.split(',') : rawQuery.steep) : undefined,
        sentiments: rawQuery.sentiments ? (typeof rawQuery.sentiments === 'string' ? rawQuery.sentiments.split(',') : rawQuery.sentiments) : undefined,
        horizons: rawQuery.horizons ? (typeof rawQuery.horizons === 'string' ? rawQuery.horizons.split(',') : rawQuery.horizons) : undefined,
        tags: rawQuery.tags ? (typeof rawQuery.tags === 'string' ? rawQuery.tags.split(',') : rawQuery.tags) : undefined,
        // Handle selectedForceIds parameter for radar visualization
        selectedForceIds: rawQuery.selectedForceIds ? (typeof rawQuery.selectedForceIds === 'string' ? rawQuery.selectedForceIds.split(',') : rawQuery.selectedForceIds) : undefined,
      };
      
      const query = searchQuerySchema.parse(parsedQuery);
      
      // IMPORTANT: Radar visualization only uses curated forces - exclude 'S' (Signal) forces
      // Only use: Megatrend (M), Trend (T), Weak Signal (WS), Wildcard (WC)
      const allowedRadarTypes: ('M' | 'T' | 'WS' | 'WC')[] = ['M', 'T', 'WS', 'WC'];
      
      // For initial load vs search results, check for ANY active search filters
      // Don't treat the default radar types (M,T,WS,WC) as an active filter
      const isDefaultRadarTypes = query.types && 
        query.types.length === 4 && 
        allowedRadarTypes.every(type => query.types?.includes(type));
      
      const hasActiveFilters = query.q || 
        (query.steep && query.steep.length > 0) ||
        (query.sentiments && query.sentiments.length > 0) ||
        (query.tags && query.tags.length > 0) ||
        (query.impactMin && query.impactMin > 1) ||
        (query.impactMax && query.impactMax < 10) ||
        (query.dimensions && query.dimensions.length > 0) ||
        (query.types && query.types.length > 0 && !isDefaultRadarTypes);
      
      const isInitialLoad = !hasActiveFilters;
      
      let radarPoints = [];
      
      // If selectedForceIds are provided, filter by those specific forces
      if (query.selectedForceIds && query.selectedForceIds.length > 0) {
        console.log(`[Radar] Filtering by ${query.selectedForceIds.length} selected forces`);
        
        // Query only the selected forces
        const radarQuery = {
          ...query,
          forceIds: query.selectedForceIds, // Use forceIds parameter for specific force filtering
          types: allowedRadarTypes, // Still ensure only curated types
          pageSize: 5000,
          includeEmbeddings: false,
          includeFacets: false,
        };
        
        const searchResults = await storage.queryForces(radarQuery);
        
        // Apply same filtering as other paths - ensure forces have radar visualization data
        radarPoints = searchResults.forces
          .filter((force: any) => force.magnitude && force.distance && force.colorHex && force.dimension);
        
      } else if (isInitialLoad) {
        // For initial load: get all project-specific forces (respecting project's content)
        const radarQuery = {
          ...query,
          types: allowedRadarTypes, // Explicitly use only M, T, WS, WC
          pageSize: 5000, // Get all project forces 
          includeEmbeddings: false,
          includeFacets: false,
        };
        
        const searchResults = await storage.queryForces(radarQuery);
        
        // Get all forces with radar data from the current project
        radarPoints = searchResults.forces
          .filter((force: any) => force.magnitude && force.distance && force.colorHex && force.dimension);
        
      } else {
        // For search results: get curated forces only (explicitly exclude Signals)
        const requestedTypes = query.types || allowedRadarTypes;
        const filteredTypes = requestedTypes.filter(t => allowedRadarTypes.includes(t as any));
        
        const radarQuery = {
          ...query,
          types: filteredTypes.length > 0 ? filteredTypes : allowedRadarTypes,
          pageSize: query.pageSize || 1000,
          includeEmbeddings: false,
          includeFacets: false,
        };
        
        const searchResults = await storage.queryForces(radarQuery);
        // Only include curated forces that have radar visualization data (no Signals)
        radarPoints = searchResults.forces.filter((force: any) => 
          force.magnitude && force.distance && force.colorHex && allowedRadarTypes.includes(force.type)
        );
      }
      
      // Transform data using ORION database column names directly
      const transformedPoints = radarPoints.map((force: any) => ({
        // Use ORION database column names directly (no CSV mapping)
        id: force.id,
        dimension: force.dimension, // Direct ORION column
        type: mapTypeToOriginalParquetValue(force.type).slice(0, -1), // Convert to singular form for client icons
        driving_force: force.title, // ORION title column  
        description: force.text, // ORION text column
        magnitude: force.magnitude, // Direct ORION radar column
        distance: force.distance, // Direct ORION radar column
        color_hex: force.colorHex, // Direct ORION radar column
        
        // Additional ORION columns
        tags: force.tags || [],
        source: force.source,
        level_of_impact: force.impact,
        feasibility: force.feasibility || calculateDefaultFeasibility(force.ttm),
        urgency: force.urgency || calculateDefaultUrgency(force.ttm, force.type),
        time_to_market: force.ttm,
        sentiment: force.sentiment,
        created: force.createdAt,
        cluster_id: force.clusterId,
      }));

      // Return radar data using ORION database structure
      const radarData = {
        success: true,
        total: transformedPoints.length,
        points: transformedPoints,
        dimensions: Array.from(new Set(transformedPoints.map(p => p.dimension))).filter(Boolean),
        types: ['Megatrend', 'Trend', 'Weak Signal', 'Wildcard'],
        timestamp: new Date().toISOString(),
        isInitialLoad: isInitialLoad,
      };

      res.json(radarData);
    } catch (error) {
      console.error('Radar data generation error:', error);
      res.status(500).json({ error: "Failed to generate radar data" });
    }
  });

  // Radar export endpoint
  app.get("/api/v1/analytics/radar/export", verifyProjectOwnership, async (req, res) => {
    try {
      const { format = 'png' } = req.query;
      
      // For now, return a simple success response
      // In a full implementation, this would generate an exportable radar image
      res.json({ 
        success: true, 
        message: "Radar export functionality is being implemented",
        format: format,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Radar export error:', error);
      res.status(500).json({ error: "Failed to export radar" });
    }
  });

  app.get("/api/v1/analytics/network", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'advancedClustering' }), requireIntegrityOk, async (req: any, res) => {
    try {
      const { project_id, curated_only = 'true', layout_3d = 'true' } = req.query;
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      // Parse boolean parameters with defaults
      const curatedOnly = curated_only === 'true';
      const layout3D = layout_3d === 'true';

      const networkData = await visualizationService.generateNetworkVisualization(
        project_id as string, 
        curatedOnly, 
        layout3D
      );
      res.json(networkData);
    } catch (error) {
      console.error('Network visualization error:', error);
      res.status(500).json({ error: "Failed to generate network data" });
    }
  });

  // Force-level network visualization (old ORION approach)
  app.get("/api/v1/analytics/force-network/:projectId", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'advancedClustering' }), requireIntegrityOk, async (req: any, res) => {
    try {
      const project_id = req.params.projectId;
      const { curated_only = 'false', layout_3d = 'true' } = req.query;
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      // Parse boolean parameters with defaults
      const curatedOnly = curated_only === 'true';
      const layout3D = layout_3d === 'true';

      const forceNetworkData = await visualizationService.generateForceNetworkVisualization(
        project_id as string, 
        curatedOnly, 
        layout3D,
        'orion' // Explicitly use orion cluster method for 37 clusters
      );
      res.json(forceNetworkData);
    } catch (error) {
      console.error('Force network visualization error:', error);
      res.status(500).json({ error: "Failed to generate force network data" });
    }
  });

  app.get("/api/v1/analytics/heatmap", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'advancedClustering' }), requireIntegrityOk, async (req: any, res) => {
    try {
      const { project_id } = req.query;
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      const heatmapData = await visualizationService.generateClusterHeatmap(project_id as string);
      res.json(heatmapData);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate heatmap data" });
    }
  });

  app.get("/api/v1/analytics/treemap", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'advancedClustering' }), requireIntegrityOk, async (req: any, res) => {
    try {
      const { project_id } = req.query;
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      const treemapData = await visualizationService.generateClusterTreemap(project_id as string);
      res.json(treemapData);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate treemap data" });
    }
  });

  app.get("/api/v1/analytics/timeline", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'advancedClustering' }), requireIntegrityOk, async (req: any, res) => {
    try {
      const { project_id } = req.query;
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      const timelineData = await visualizationService.generateQualityTimeline(project_id as string);
      res.json(timelineData);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate timeline data" });
    }
  });

  app.get("/api/v1/analytics/dashboard", isAuthenticated, verifyProjectOwnership, requireSubscriptionFeature({ feature: 'advancedClustering' }), requireIntegrityOk, async (req: any, res) => {
    try {
      const { project_id } = req.query;
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      const dashboardData = await visualizationService.generateDashboardData(project_id as string);
      res.json(dashboardData);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate dashboard data" });
    }
  });

  // Jobs
  app.get("/api/v1/jobs", isAuthenticated, async (req: any, res) => {
    try {
      const { status } = req.query;
      const jobs = await storage.getJobs(status as string);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.get("/api/v1/jobs/stats", isAuthenticated, async (req: any, res) => {
    try {
      const stats = await jobsService.getJobStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job stats" });
    }
  });

  app.get("/api/v1/jobs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.put("/api/v1/jobs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const jobId = req.params.id;
      const updates = req.body;
      
      // Get the existing job first
      const existingJob = await storage.getJob(jobId);
      if (!existingJob) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Update the job
      const updatedJob = await storage.updateJob(jobId, updates);
      res.json(updatedJob);
    } catch (error) {
      console.error("Job update error:", error);
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  app.delete("/api/v1/jobs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const deleted = await storage.deleteJob(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // Reports
  app.post("/api/v1/reports", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const reportData = insertReportSchema.parse(req.body);
      const report = await storage.createReport(reportData);
      
      // Start report generation in background
      jobsService.generateReport(report.id, reportData.projectId, reportData.format);
      
      res.status(201).json(report);
    } catch (error) {
      console.error("Report creation error:", error);
      res.status(400).json({ error: "Invalid report data" });
    }
  });

  app.get("/api/v1/reports", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { project_id } = req.query;
      const reports = await storage.getReports(project_id as string);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.get("/api/v1/reports/:reportId/download", isAuthenticated, async (req: any, res) => {
    try {
      const { reportId } = req.params;
      const report = await storage.getReport(reportId);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      if (report.status !== "completed") {
        return res.status(400).json({ error: "Report is not ready for download" });
      }
      
      // Verify user owns the project for this report  
      const project = await storage.getProject(report.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Check if user owns the project
      if (project.userId && req.user?.id !== project.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get forces based on selected force IDs or all forces if none selected
      let forces;
      if (report.selectedForceIds && report.selectedForceIds.length > 0) {
        const result = await storage.getDrivingForcesByIds(report.selectedForceIds, report.projectId);
        forces = result.forces;
      } else {
        const result = await storage.getDrivingForces(report.projectId);
        forces = result.forces;
      }
      
      // Generate report content
      const reportContent = generateReportContent(project, forces, report.format);
      
      // Set appropriate headers for file download
      if (report.format === 'pdf') {
        // Return HTML that can be printed as PDF by browser
        const filename = `ORION_Report_PDF_${new Date().toISOString().slice(0, 10)}.html`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(reportContent);
      } else {
        // Return plain text for DOCX (user can save as .txt or .docx)
        const filename = `ORION_Report_DOCX_${new Date().toISOString().slice(0, 10)}.txt`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(reportContent);
      }
      
    } catch (error) {
      console.error("Report download error:", error);
      res.status(500).json({ error: "Failed to download report" });
    }
  });

  // Cluster Export Endpoints
  app.post("/api/v1/clusters/export", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { project_id, format, include_forces, include_quality_metrics, include_visualization_data, cluster_ids } = req.body;
      
      if (!project_id || !format) {
        return res.status(400).json({ error: "project_id and format are required" });
      }

      const options: ClusterExportOptions = {
        format: format as any,
        includeForces: include_forces || false,
        includeQualityMetrics: include_quality_metrics || true,
        includeVisualizationData: include_visualization_data || false,
        clusterIds: cluster_ids
      };

      const exportResult = await exportService.exportClusters(project_id, options);
      
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Type', exportResult.contentType);
      res.send(exportResult.data);
    } catch (error) {
      console.error("Cluster export error:", error);
      res.status(500).json({ error: "Failed to export clusters" });
    }
  });

  app.get("/api/v1/clusters/export/comparison", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { project_id, format = 'json' } = req.query;
      
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      const exportResult = await exportService.exportAlgorithmComparison(
        project_id as string, 
        format as 'csv' | 'json'
      );
      
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Type', exportResult.contentType);
      res.send(exportResult.data);
    } catch (error) {
      console.error("Algorithm comparison export error:", error);
      res.status(500).json({ error: "Failed to export algorithm comparison" });
    }
  });

  app.get("/api/v1/clusters/export/timeline", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { project_id, format = 'json' } = req.query;
      
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      const exportResult = await exportService.exportQualityTimeline(
        project_id as string, 
        format as 'csv' | 'json'
      );
      
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Type', exportResult.contentType);
      res.send(exportResult.data);
    } catch (error) {
      console.error("Quality timeline export error:", error);
      res.status(500).json({ error: "Failed to export quality timeline" });
    }
  });

  // Clustering Reports
  app.get("/api/v1/clustering/reports", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { project_id } = req.query;
      
      if (!project_id) {
        return res.status(400).json({ error: "project_id is required" });
      }

      const reports = await storage.getClusteringReports(project_id as string);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch clustering reports" });
    }
  });

  // AI Chat with Server-Sent Events (Legacy - GET method)
  app.get("/api/v1/chat/stream", isAuthenticated, async (req: any, res) => {
    try {
      const { project_id, mode, query, assistant_type = 'copilot', thread_id } = req.query;
      
      // Check ORION Copilot access BEFORE consuming AI usage
      if (assistant_type === 'copilot') {
        const userId = req.user.id;
        const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
        
        // Regular subscription checks for all users
        if (!subscriptionStatus.hasActiveSubscription || !subscriptionStatus.tier) {
          return res.status(403).json({
            success: false,
            error: 'ORION Copilot requires an active subscription',
            code: 'SUBSCRIPTION_REQUIRED',
            upgradeUrl: '/pricing',
          });
        }
        
        // Basic tier users cannot access ORION Copilot
        if (subscriptionStatus.tier === 'basic') {
          return res.status(403).json({
            success: false,
            error: 'ORION Copilot requires Professional or Enterprise subscription',
            code: 'FEATURE_NOT_AVAILABLE',
            currentTier: 'basic',
            requiredTier: 'professional',
            upgradeUrl: '/pricing',
          });
        }
      }
      
      // Check AI usage limits AFTER authorization
      const userId = req.user.id;
      const aiUsageResult = await storage.incrementAiUsage(userId);
      
      if (!aiUsageResult.success) {
        return res.status(403).json({
          success: false,
          error: `You've reached your monthly AI query limit of ${aiUsageResult.limit}`,
          code: 'AI_USAGE_LIMIT_EXCEEDED',
          currentUsage: aiUsageResult.limit,
          limit: aiUsageResult.limit,
          remaining: 0,
          upgradeUrl: '/pricing',
        });
      }
      
      if (!project_id || !query) {
        return res.status(400).json({ error: "project_id and query are required" });
      }

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Get project context
      const result = await storage.getDrivingForces(project_id as string, undefined, undefined, { limit: 100 });
      const forces = result.forces;
      // Use the 37 meaningful clusters for AI context
      const clusters = await storage.getClusters(project_id as string, 'orion');
      
      const context = {
        forcesCount: result.total,
        clustersCount: clusters.length,
        recentForces: forces.slice(0, 10),
        clusters: clusters.slice(0, 5),
      };

      // Stream OpenAI Assistant response
      await openaiService.streamAssistantResponse(
        query as string,
        context,
        assistant_type as 'copilot' | 'scanning',
        thread_id as string || null,
        (chunk: string) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        },
        (threadId: string) => {
          res.write(`data: ${JSON.stringify({ type: 'done', threadId })}\n\n`);
          res.end();
        },
        (error: string) => {
          res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
          res.end();
        }
      );

    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to process chat request' })}\n\n`);
      res.end();
    }
  });

  // AI Chat with Assistant API (POST method for better support)
  app.post("/api/v1/chat/stream", isAuthenticated, async (req: any, res) => {
    try {
      const { assistant_type = 'copilot' } = req.body;
      
      // Check ORION Copilot access BEFORE consuming AI usage
      if (assistant_type === 'copilot') {
        const userId = req.user.id;
        const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
        
        // Regular subscription checks for all users
        if (!subscriptionStatus.hasActiveSubscription || !subscriptionStatus.tier) {
          return res.status(403).json({
            success: false,
            error: 'ORION Copilot requires an active subscription',
            code: 'SUBSCRIPTION_REQUIRED',
            upgradeUrl: '/pricing',
          });
        }
        
        // Basic tier users cannot access ORION Copilot
        if (subscriptionStatus.tier === 'basic') {
          return res.status(403).json({
            success: false,
            error: 'ORION Copilot requires Professional or Enterprise subscription',
            code: 'FEATURE_NOT_AVAILABLE',
            currentTier: 'basic',
            requiredTier: 'professional',
            upgradeUrl: '/pricing',
          });
        }
      }
      
      // Check AI usage limits AFTER authorization
      const userId = req.user.id;
      const aiUsageResult = await storage.incrementAiUsage(userId);
      
      if (!aiUsageResult.success) {
        return res.status(403).json({
          success: false,
          error: `You've reached your monthly AI query limit of ${aiUsageResult.limit}`,
          code: 'AI_USAGE_LIMIT_EXCEEDED',
          currentUsage: aiUsageResult.limit,
          limit: aiUsageResult.limit,
          remaining: 0,
          upgradeUrl: '/pricing',
        });
      }

      // Validate request body
      const validatedData = chatStreamRequestSchema.parse(req.body);
      const { project_id, query, thread_id, mode, images, context: requestContext } = validatedData;

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // SECURITY: Build context server-side based on integration mode
      let context = {};
      const integrationMode = requestContext?.integrationMode || 'standalone';
      
      console.log(`[Chat Stream] Processing request with integration mode: ${integrationMode}, project_id: ${project_id}`);
      
      // SECURITY: Validate selectedForceIds limits to prevent DoS
      if (requestContext?.selectedForceIds && Array.isArray(requestContext.selectedForceIds)) {
        if (requestContext.selectedForceIds.length > 50) {
          console.warn(`[Chat Stream] Capping selectedForceIds from ${requestContext.selectedForceIds.length} to 50 for security`);
          requestContext.selectedForceIds = requestContext.selectedForceIds.slice(0, 50);
        }
      }
      
      if (assistant_type === 'scanning' || (assistant_type === 'copilot' && integrationMode === 'project' && project_id)) {
        // Fetch base project data server-side
        const result = await storage.getDrivingForces(project_id as string, undefined, undefined, { limit: 100 });
        const forces = result.forces;
        const clusters = await storage.getClusters(project_id as string, 'orion');
        
        context = {
          forcesCount: result.total,
          clustersCount: clusters.length,
          recentForces: forces.slice(0, 10),
          clusters: clusters.slice(0, 5),
        };

        // SECURITY: For both scanning and copilot project mode, fetch selected forces server-side using only IDs
        if ((assistant_type === 'scanning' || (assistant_type === 'copilot' && integrationMode === 'project')) && requestContext?.selectedForceIds) {
          const selectedForceIds = requestContext.selectedForceIds;
          console.log(`[Chat Stream] Fetching ${selectedForceIds.length} selected forces server-side for security`);
          
          try {
            // Fetch selected forces by IDs from database
            const result = await storage.getDrivingForcesByIds(selectedForceIds, project_id as string);
            const selectedForces = result.forces;
            console.log(`[Chat Stream] Successfully fetched ${selectedForces.length} forces server-side`);
            
            if (result.notFound.length > 0) {
              console.warn(`[Chat Stream] ${result.notFound.length} forces not found:`, result.notFound);
            }
            
            context = {
              ...context,
              selectedForcesCount: selectedForces.length,
              selectedForces: selectedForces.map((force: any) => ({
                id: force.id,
                title: force.title,
                type: force.type,
                dimension: force.dimension,
                scope: force.scope,
                impact: force.impact,
                summary: force.summary,
              })),
              viewMode: requestContext.viewMode || 'curated',
            };
          } catch (error) {
            console.error('[Chat Stream] Error fetching selected forces:', error);
            // Continue with base context if force fetching fails
          }
        }
      } else if (assistant_type === 'copilot' && integrationMode === 'standalone') {
        // Standalone mode - no project context needed
        console.log('[Chat Stream] Using standalone mode - no project context');
        context = {
          mode: 'standalone',
          message: 'Using comprehensive ORION.AI database'
        };
      }

      // Stream OpenAI Assistant response with image support
      await openaiService.streamAssistantResponse(
        query,
        context,
        assistant_type,
        thread_id || null,
        (chunk: string) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        },
        (threadId: string) => {
          res.write(`data: ${JSON.stringify({ type: 'done', threadId })}\n\n`);
          res.end();
        },
        (error: string) => {
          res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
          res.end();
        },
        images // Pass images to OpenAI service
      );

    } catch (error) {
      console.error('Chat stream error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to process chat request' })}\n\n`);
      res.end();
    }
  });

  // Template download
  app.get("/api/v1/scanning/template/:format", (req, res) => {
    try {
      const format = req.params.format as 'csv' | 'xlsx' | 'json';
      
      if (!['csv', 'xlsx', 'json'].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Use csv, xlsx, or json" });
      }
      
      const template = fileParserService.generateTemplate(format);
      
      const filename = `driving-forces-template.${format}`;
      const mimeTypes = {
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        json: 'application/json'
      };
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', mimeTypes[format]);
      res.send(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate template" });
    }
  });

  // Admin endpoints for data import
  app.post("/api/admin/import-old-clusters", requireAdminAuth, async (req, res) => {
    try {
      // Check if reprocessing is allowed (Fixed Loader integration)
      if (!isReprocessAllowed()) {
        const reason = getReprocessBlockingReason();
        return res.status(403).json({
          success: false,
          error: "Reprocessing blocked",
          message: reason,
          hint: "Set ALLOW_REPROCESS=true to enable data reprocessing"
        });
      }

      const { projectId } = req.body;
      
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const result = await importService.importOldClusters(projectId);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          data: {
            clustersCreated: result.clustersCreated,
            forcesMapped: result.forcesMapped
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error) {
      console.error('Error in import-old-clusters endpoint:', error);
      res.status(500).json({ 
        success: false,
        error: "Internal server error during import"
      });
    }
  });

  app.get("/api/admin/import-status/:projectId", requireAdminAuth, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const status = await importService.getImportStatus(projectId);
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error in import-status endpoint:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to get import status"
      });
    }
  });

  // FixedClusters integrity validation endpoint
  app.get("/api/admin/integrity", requireAdminAuth, async (req, res) => {
    try {
      console.log("Admin integrity validation requested");
      
      // Call Python bridge script to get integrity status
      const { spawn } = require("child_process");
      const { join } = require("path");
      const { nanoid } = require("nanoid");
      const { writeFileSync, readFileSync, unlinkSync, existsSync } = require("fs");
      
      const sessionId = nanoid();
      const outputFile = join(process.cwd(), `temp_integrity_${sessionId}.json`);
      
      const pythonScript = join(process.cwd(), "backend/orion/orion_fixed_bridge.py");
      const pythonArgs = [
        pythonScript,
        "--output", outputFile,
        "--mode", "integrity"
      ];
      
      const pythonProcess = spawn("python3", pythonArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          FEATURES_FILE: process.env.FEATURES_FILE || 'attached_assets/precomputed_features_1758013839680.pkl',
          STRICT_FEATURES: process.env.STRICT_FEATURES || 'true'
        }
      });
      
      let stdout = "";
      let stderr = "";
      
      pythonProcess.stdout.on("data", (data: any) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on("data", (data: any) => {
        stderr += data.toString();
      });
      
      pythonProcess.on("close", (exitCode: number) => {
        try {
          if (exitCode !== 0) {
            console.error(`Python integrity script failed with exit code ${exitCode}:`, stderr);
            return res.status(500).json({
              success: false,
              error: "Integrity validation script failed",
              details: stderr
            });
          }
          
          if (!existsSync(outputFile)) {
            return res.status(500).json({
              success: false,
              error: "Integrity validation output file not found"
            });
          }
          
          const results = JSON.parse(readFileSync(outputFile, "utf-8"));
          
          // Clean up temporary file
          try {
            unlinkSync(outputFile);
          } catch (cleanupError) {
            console.warn("Warning: Could not clean up temporary file:", cleanupError);
          }
          
          // Return integrity status
          res.json({
            success: true,
            data: results,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.error("Error processing integrity validation results:", error);
          res.status(500).json({
            success: false,
            error: "Failed to process integrity validation results",
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });
      
    } catch (error) {
      console.error('Error in integrity validation endpoint:', error);
      res.status(500).json({ 
        success: false,
        error: "Internal server error during integrity validation",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Populate forces for existing orion_import clusters 
  app.post("/api/admin/populate-cluster-forces", requireAdminAuth, async (req, res) => {
    try {
      // Check if reprocessing is allowed (Fixed Loader integration)
      if (!isReprocessAllowed()) {
        const reason = getReprocessBlockingReason();
        return res.status(403).json({
          success: false,
          error: "Reprocessing blocked",
          message: reason,
          hint: "Set ALLOW_REPROCESS=true to enable data reprocessing"
        });
      }
      const { projectId } = req.body;
      
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const result = await importService.populateExistingClusterForces(projectId);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          data: {
            clustersUpdated: result.clustersUpdated,
            forcesMapped: result.forcesMapped
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error) {
      console.error('Error in populate-cluster-forces endpoint:', error);
      res.status(500).json({ 
        success: false,
        error: "Internal server error during force population"
      });
    }
  });

  // Comprehensive ORION cluster population - populate all 36 remaining clusters
  app.post("/api/admin/populate-all-orion-clusters", requireAdminAuth, async (req, res) => {
    try {
      // Check if reprocessing is allowed (Fixed Loader integration)
      if (!isReprocessAllowed()) {
        const reason = getReprocessBlockingReason();
        return res.status(403).json({
          success: false,
          error: "Reprocessing blocked",
          message: reason,
          hint: "Set ALLOW_REPROCESS=true to enable data reprocessing"
        });
      }

      const { projectId } = req.body;
      
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const result = await importService.populateAllOrionClusters(projectId);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          data: {
            clustersPopulated: result.clustersPopulated,
            totalForcesAssigned: result.totalForcesAssigned,
            results: result.results
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error) {
      console.error('Error in populate-all-orion-clusters endpoint:', error);
      res.status(500).json({ 
        success: false,
        error: "Internal server error during comprehensive cluster population"
      });
    }
  });

  // Visualization endpoints for legacy figure reuse
  
  // GET /api/visuals/radar - Generate legacy trend radar figure
  app.get("/api/visuals/radar", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { 
        search, 
        types, 
        steep, 
        clusters, 
        show_connections = 'false', 
        show_node_titles = 'false' 
      } = req.query;

      // Prepare filters
      const filters: any = {};
      if (search) filters.search = search;
      if (types) filters.types = Array.isArray(types) ? types : String(types).split(',').map(t => t.trim());
      if (steep) filters.steep = Array.isArray(steep) ? steep : String(steep).split(',').map(s => s.trim());
      if (clusters) filters.clusters = Array.isArray(clusters) ? clusters : String(clusters).split(',').map(c => c.trim());

      // Prepare parameters for Python script
      const params = {
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        show_connections: { show: show_connections === 'true' },
        show_node_titles: { titles: show_node_titles === 'true' }
      };

      const request = {
        command: 'radar',
        params
      };

      // Execute Python script
      const pythonScript = join(__dirname, '../backend/orion/visual_endpoints.py');
      const pythonProcess = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process failed with code ${code}`);
          console.error('stderr:', stderr);
          return res.status(500).json({
            success: false,
            error: 'Failed to generate radar visualization',
            details: stderr || 'Unknown Python execution error'
          });
        }

        try {
          const result = JSON.parse(stdout);
          if (result.success) {
            res.json({
              success: true,
              figure: result.data,
              timestamp: result.timestamp,
              command: 'radar'
            });
          } else {
            res.status(500).json({
              success: false,
              error: result.error || 'Unknown error from Python script',
              details: result.traceback
            });
          }
        } catch (parseError) {
          console.error('Error parsing Python output:', parseError);
          console.error('stdout:', stdout);
          res.status(500).json({
            success: false,
            error: 'Failed to parse visualization result',
            details: parseError instanceof Error ? parseError.message : 'Parse error'
          });
        }
      });

      // Send request to Python script
      pythonProcess.stdin.write(JSON.stringify(request));
      pythonProcess.stdin.end();

    } catch (error) {
      console.error('Error in radar visualization endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during radar visualization',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/visuals/3d - Generate legacy 3D scatter figure
  app.get("/api/visuals/3d", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { 
        search, 
        types, 
        steep, 
        clusters, 
        camera_x, 
        camera_y, 
        camera_z 
      } = req.query;

      // Prepare filters
      const filters: any = {};
      if (search) filters.search = search;
      if (types) filters.types = Array.isArray(types) ? types : String(types).split(',').map(t => t.trim());
      if (steep) filters.steep = Array.isArray(steep) ? steep : String(steep).split(',').map(s => s.trim());
      if (clusters) filters.clusters = Array.isArray(clusters) ? clusters : String(clusters).split(',').map(c => c.trim());

      // Prepare camera settings
      const camera_settings: any = {};
      if (camera_x) camera_settings.x = parseFloat(camera_x as string);
      if (camera_y) camera_settings.y = parseFloat(camera_y as string);
      if (camera_z) camera_settings.z = parseFloat(camera_z as string);

      // Prepare parameters for Python script
      const params = {
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        camera_settings: Object.keys(camera_settings).length > 0 ? camera_settings : undefined
      };

      const request = {
        command: '3d',
        params
      };

      // Execute Python script
      const pythonScript = join(__dirname, '../backend/orion/visual_endpoints.py');
      const pythonProcess = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process failed with code ${code}`);
          console.error('stderr:', stderr);
          return res.status(500).json({
            success: false,
            error: 'Failed to generate 3D visualization',
            details: stderr || 'Unknown Python execution error'
          });
        }

        try {
          const result = JSON.parse(stdout);
          if (result.success) {
            res.json({
              success: true,
              figure: result.data,
              timestamp: result.timestamp,
              command: '3d'
            });
          } else {
            res.status(500).json({
              success: false,
              error: result.error || 'Unknown error from Python script',
              details: result.traceback
            });
          }
        } catch (parseError) {
          console.error('Error parsing Python output:', parseError);
          console.error('stdout:', stdout);
          res.status(500).json({
            success: false,
            error: 'Failed to parse visualization result',
            details: parseError instanceof Error ? parseError.message : 'Parse error'
          });
        }
      });

      // Send request to Python script
      pythonProcess.stdin.write(JSON.stringify(request));
      pythonProcess.stdin.end();

    } catch (error) {
      console.error('Error in 3D visualization endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during 3D visualization',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/visuals/baseline/radar - Baseline radar for parity checking
  app.get("/api/visuals/baseline/radar", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { 
        search, 
        types, 
        steep, 
        clusters, 
        show_connections = 'false', 
        show_node_titles = 'false' 
      } = req.query;

      // Prepare filters
      const filters: any = {};
      if (search) filters.search = search;
      if (types) filters.types = Array.isArray(types) ? types : String(types).split(',').map(t => t.trim());
      if (steep) filters.steep = Array.isArray(steep) ? steep : String(steep).split(',').map(s => s.trim());
      if (clusters) filters.clusters = Array.isArray(clusters) ? clusters : String(clusters).split(',').map(c => c.trim());

      // Prepare parameters for Python script
      const params = {
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        show_connections: { show: show_connections === 'true' },
        show_node_titles: { titles: show_node_titles === 'true' }
      };

      const request = {
        command: 'baseline_radar',
        params
      };

      // Execute Python script
      const pythonScript = join(__dirname, '../backend/orion/visual_endpoints.py');
      const pythonProcess = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process failed with code ${code}`);
          console.error('stderr:', stderr);
          return res.status(500).json({
            success: false,
            error: 'Failed to generate baseline radar visualization',
            details: stderr || 'Unknown Python execution error'
          });
        }

        try {
          const result = JSON.parse(stdout);
          if (result.success) {
            res.json({
              success: true,
              figure: result.data,
              timestamp: result.timestamp,
              command: 'baseline_radar'
            });
          } else {
            res.status(500).json({
              success: false,
              error: result.error || 'Unknown error from Python script',
              details: result.traceback
            });
          }
        } catch (parseError) {
          console.error('Error parsing Python output:', parseError);
          console.error('stdout:', stdout);
          res.status(500).json({
            success: false,
            error: 'Failed to parse visualization result',
            details: parseError instanceof Error ? parseError.message : 'Parse error'
          });
        }
      });

      // Send request to Python script
      pythonProcess.stdin.write(JSON.stringify(request));
      pythonProcess.stdin.end();

    } catch (error) {
      console.error('Error in baseline radar visualization endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during baseline radar visualization',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/visuals/baseline/3d - Baseline 3D for parity checking
  app.get("/api/visuals/baseline/3d", isAuthenticated, verifyProjectOwnership, async (req: any, res) => {
    try {
      const { 
        search, 
        types, 
        steep, 
        clusters, 
        camera_x, 
        camera_y, 
        camera_z 
      } = req.query;

      // Prepare filters
      const filters: any = {};
      if (search) filters.search = search;
      if (types) filters.types = Array.isArray(types) ? types : String(types).split(',').map(t => t.trim());
      if (steep) filters.steep = Array.isArray(steep) ? steep : String(steep).split(',').map(s => s.trim());
      if (clusters) filters.clusters = Array.isArray(clusters) ? clusters : String(clusters).split(',').map(c => c.trim());

      // Prepare camera settings
      const camera_settings: any = {};
      if (camera_x) camera_settings.x = parseFloat(camera_x as string);
      if (camera_y) camera_settings.y = parseFloat(camera_y as string);
      if (camera_z) camera_settings.z = parseFloat(camera_z as string);

      // Prepare parameters for Python script
      const params = {
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        camera_settings: Object.keys(camera_settings).length > 0 ? camera_settings : undefined
      };

      const request = {
        command: 'baseline_3d',
        params
      };

      // Execute Python script
      const pythonScript = join(__dirname, '../backend/orion/visual_endpoints.py');
      const pythonProcess = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process failed with code ${code}`);
          console.error('stderr:', stderr);
          return res.status(500).json({
            success: false,
            error: 'Failed to generate baseline 3D visualization',
            details: stderr || 'Unknown Python execution error'
          });
        }

        try {
          const result = JSON.parse(stdout);
          if (result.success) {
            res.json({
              success: true,
              figure: result.data,
              timestamp: result.timestamp,
              command: 'baseline_3d'
            });
          } else {
            res.status(500).json({
              success: false,
              error: result.error || 'Unknown error from Python script',
              details: result.traceback
            });
          }
        } catch (parseError) {
          console.error('Error parsing Python output:', parseError);
          console.error('stdout:', stdout);
          res.status(500).json({
            success: false,
            error: 'Failed to parse visualization result',
            details: parseError instanceof Error ? parseError.message : 'Parse error'
          });
        }
      });

      // Send request to Python script
      pythonProcess.stdin.write(JSON.stringify(request));
      pythonProcess.stdin.end();

    } catch (error) {
      console.error('Error in baseline 3D visualization endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during baseline 3D visualization',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Integrity status endpoint - Fixed Loader integration
  app.get("/api/status/integrity", async (req, res) => {
    try {
      const integrityCheck = await performIntegrityCheck();
      
      res.json({
        status: integrityCheck.status,
        summary: integrityCheck.summary,
        fixedLoaderEnabled: isFixedLoaderEnabled(),
        reprocessAllowed: isReprocessAllowed(),
        reprocessBlockingReason: getReprocessBlockingReason(),
        manifest: integrityCheck.manifest,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Integrity check endpoint error:', error);
      res.status(500).json({
        status: 'critical',
        summary: 'Integrity check failed with system error',
        fixedLoaderEnabled: isFixedLoaderEnabled(),
        reprocessAllowed: false,
        reprocessBlockingReason: 'System error during integrity check',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Visual Parity status endpoint - SHA256 comparison between regular and baseline endpoints
  app.get("/api/status/visuals-parity", async (req, res) => {
    try {
      console.log('🔍 Starting visual parity check...');
      console.log('Query params:', req.query);
      
      const { include_filters = 'true' } = req.query;
      
      // Execute Python parity checker script
      const pythonScript = join(__dirname, '../backend/orion/parity_checker.py');
      console.log('Python script path:', pythonScript);
      
      const pythonArgs = [
        pythonScript,
        '--comprehensive',
        '--include-filters', include_filters as string
      ];
      console.log('Python args:', pythonArgs);
      
      const pythonProcess = spawn('python3', pythonArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(), // Run from root directory so data/ paths work
        env: {
          ...process.env,
          PYTHONPATH: join(__dirname, '../backend/orion'),
          PYTHONUNBUFFERED: '1' // Ensure output is flushed immediately
        }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const parityResult = JSON.parse(stdout);
            
            res.json({
              status: parityResult.overall_parity_ok ? 'healthy' : 'critical',
              summary: parityResult.summary,
              strictMode: parityResult.strict_mode,
              totalChecks: Object.keys(parityResult.checks).length,
              passedChecks: Object.values(parityResult.checks).filter((check: any) => check.parity_ok).length,
              failedChecks: Object.values(parityResult.checks).filter((check: any) => !check.parity_ok).length,
              checks: parityResult.checks,
              errors: parityResult.errors || [],
              timestamp: new Date().toISOString()
            });
          } catch (parseError) {
            console.error('Failed to parse parity check result:', parseError);
            res.status(500).json({
              status: 'critical',
              summary: 'Parity check failed - invalid response format',
              strictMode: true,
              error: 'Failed to parse parity check result',
              details: parseError instanceof Error ? parseError.message : 'Parse error',
              timestamp: new Date().toISOString()
            });
          }
        } else {
          console.error('Parity check script failed:', stderr);
          res.status(500).json({
            status: 'critical',
            summary: 'Parity check failed with system error',
            strictMode: true,
            error: 'Parity check script execution failed',
            details: stderr.trim() || 'Unknown error',
            exitCode: code,
            timestamp: new Date().toISOString()
          });
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Failed to start parity check script:', error);
        res.status(500).json({
          status: 'critical',
          summary: 'Failed to start parity check process',
          strictMode: true,
          error: 'Process execution error',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      });

    } catch (error) {
      console.error('Visual parity check endpoint error:', error);
      res.status(500).json({
        status: 'critical',
        summary: 'Parity check failed with system error',
        strictMode: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ADMIN: Seed production database with all driving forces
  // WARNING: This is a one-time operation for production setup
  app.post("/api/admin/seed-database", async (req, res) => {
    try {
      console.log('[ADMIN] Database seed requested');
      
      // Check if database already has forces
      const [existingCount] = await db.select({ count: sql<number>`count(*)` }).from(drivingForces);
      const existingForces = existingCount?.count || 0;
      
      if (existingForces > 1000) {
        return res.status(400).json({
          success: false,
          error: `Database already contains ${existingForces} forces. This endpoint is for initial setup only.`,
          existingForces
        });
      }
      
      // Load data from unified CSV file
      console.log('[ADMIN] Loading unified ORION dataset from CSV...');
      const datasetPath = join(process.cwd(), 'unified_orion_dataset.csv');
      
      if (!existsSync(datasetPath)) {
        return res.status(500).json({
          success: false,
          error: 'Unified dataset file not found. This endpoint requires the data files to be deployed.'
        });
      }
      
      // Use csv-parser for proper CSV handling
      const { createReadStream } = await import('fs');
      const csvParser = await import('csv-parser');
      const csv = csvParser.default || csvParser;
      const data: any[] = [];
      
      await new Promise((resolve, reject) => {
        createReadStream(datasetPath)
          .pipe(csv())
          .on('data', (row: any) => data.push(row))
          .on('end', () => {
            console.log(`[ADMIN] Loaded ${data.length} rows from unified dataset`);
            resolve(true);
          })
          .on('error', reject);
      });
      
      // Create default project
      const defaultProject = await storage.ensureDefaultProject();
      console.log(`[ADMIN] Using default project: ${defaultProject.id}`);
      
      // Transform and insert forces in batches
      const batchSize = 500;
      let insertedCount = 0;
      
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        const forcesToInsert = batch.map((row: any) => ({
          projectId: defaultProject.id,
          title: String(row.Title || '').replace(/^"|"$/g, ''),
          type: String(row['Driving Force'] || 'Signals').replace(/^"|"$/g, ''),
          steep: String(row.dimension || 'Unknown').replace(/^"|"$/g, ''),
          source: String(row.Source || '').replace(/^"|"$/g, ''),
          text: String(row.Description || '').replace(/^"|"$/g, ''),
          tags: row.Tags ? [String(row.Tags).replace(/^"|"$/g, '')] : [],
          impact: row['Level of Impact'] ? parseFloat(row['Level of Impact']) : null,
          feasibility: row.Feasibility ? parseFloat(row.Feasibility) : null,
          urgency: row.Urgency ? parseFloat(row.Urgency) : null,
          ttm: row['Time to Market'] || null,
          magnitude: row.magnitude ? parseFloat(row.magnitude) : null,
          distance: row.distance ? parseFloat(row.distance) : null,
          colorHex: row.color_hex || null,
          dimension: row.dimension || null
        }));
        
        await storage.createDrivingForces(forcesToInsert);
        insertedCount += forcesToInsert.length;
        
        console.log(`[ADMIN] Inserted batch ${Math.floor(i / batchSize) + 1}: ${insertedCount}/${data.length} forces`);
      }
      
      console.log(`[ADMIN] Database seed completed: ${insertedCount} forces inserted`);
      
      // Create subscription plans
      console.log('[ADMIN] Creating subscription plans...');
      const plans = [
        {
          tier: 'basic' as const,
          name: 'Basic Plan',
          description: 'Perfect for individual strategists starting their foresight journey',
          price: 100, // €1 in cents
          currency: 'EUR',
          stripePriceId: process.env.STRIPE_BASIC_PRICE_ID || 'price_basic_placeholder',
          features: [
            '2,866 curated driving forces (Megatrends, Trends, Weak Signals, Wildcards)',
            'Scanning Assistant AI (50 queries/month)',
            'Basic analytics and visualization',
            '3 projects maximum',
            'Standard support'
          ],
          limits: {
            aiQueriesLimit: 50,
            projectsLimit: 3,
            forcesLimit: 2866,
            usersLimit: 1,
            apiAccess: false,
            customReports: false
          },
          isActive: true
        },
        {
          tier: 'professional' as const,
          name: 'Professional Plan',
          description: 'For teams and consultants who need full access and advanced features',
          price: 200, // €2 in cents
          currency: 'EUR',
          stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_professional_placeholder',
          features: [
            'All 29,749 driving forces including Signals',
            'Scanning Assistant + ORION Copilot AI (200 queries/month)',
            'Advanced analytics and custom reports',
            'Unlimited projects',
            'Team collaboration (up to 5 users)',
            'Priority support'
          ],
          limits: {
            aiQueriesLimit: 200,
            projectsLimit: -1, // unlimited
            forcesLimit: 29749,
            usersLimit: 5,
            apiAccess: true,
            customReports: true
          },
          isActive: true
        },
        {
          tier: 'enterprise' as const,
          name: 'Enterprise Plan',
          description: 'For organizations requiring unlimited access and premium support',
          price: 300, // €3 in cents
          currency: 'EUR',
          stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise_placeholder',
          features: [
            'All 29,749 driving forces including Signals',
            'Unlimited AI queries for both assistants',
            'Full analytics suite with custom exports',
            'Unlimited projects and users',
            'API access for integrations',
            'Dedicated account manager',
            'Custom training and onboarding'
          ],
          limits: {
            aiQueriesLimit: -1, // unlimited
            projectsLimit: -1, // unlimited
            forcesLimit: 29749,
            usersLimit: -1, // unlimited
            apiAccess: true,
            customReports: true
          },
          isActive: true
        }
      ];
      
      for (const plan of plans) {
        await db.insert(subscriptionPlans).values(plan).onConflictDoNothing();
      }
      
      console.log(`[ADMIN] Created ${plans.length} subscription plans`);
      
      res.json({
        success: true,
        message: `Successfully seeded database with ${insertedCount} driving forces and ${plans.length} subscription plans`,
        insertedCount,
        projectId: defaultProject.id,
        plansCreated: plans.length
      });
      
    } catch (error) {
      console.error('[ADMIN] Database seed failed:', error);
      res.status(500).json({
        success: false,
        error: 'Database seed failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Catch-all for unmatched API routes - return 404 instead of serving frontend HTML
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
