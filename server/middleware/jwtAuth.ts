/**
 * Custom JWT Authentication Middleware for ORION Platform
 * Replaces Replit Auth with Bearer token-based authentication
 */

import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.js';
import { storage } from '../storage.js';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    claims: {
      sub: string;
      email: string;
      emailVerified: boolean;
    };
  };
}

/**
 * JWT Authentication Middleware
 * Validates Bearer token and attaches user information to request
 */
export async function jwtAuthentication(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ 
        success: false,
        error: 'Authorization token required',
        message: 'Unauthorized' 
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = authService.verifyToken(token);
    
    if (!decoded) {
      res.status(401).json({ 
        success: false,
        error: 'Invalid or expired token',
        message: 'Unauthorized' 
      });
      return;
    }

    // Get full user data from database
    const user = await storage.getUser(decoded.userId);
    
    if (!user) {
      res.status(401).json({ 
        success: false,
        error: 'User not found',
        message: 'Unauthorized' 
      });
      return;
    }

    // Attach user information to request (compatible with existing Replit Auth format)
    // Note: Email verification is handled by separate requireEmailVerification middleware
    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email!,
      emailVerified: user.emailVerified,
      claims: {
        sub: user.id, // Maintain compatibility with existing code
        email: user.email!,
        emailVerified: user.emailVerified
      }
    };

    next();
    
  } catch (error) {
    console.error('[JWT AUTH] Authentication error:', error);
    
    res.status(401).json({ 
      success: false,
      error: 'Authentication failed',
      message: 'Unauthorized' 
    });
  }
}

/**
 * Optional JWT Authentication Middleware
 * Allows both authenticated and unauthenticated requests
 * Attaches user info if token is present and valid
 */
export async function optionalJwtAuthentication(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    
    if (decoded) {
      const user = await storage.getUser(decoded.userId);
      
      if (user) {
        // Attach user information if token is valid (regardless of email verification status)
        (req as AuthenticatedRequest).user = {
          id: user.id,
          email: user.email!,
          emailVerified: user.emailVerified,
          claims: {
            sub: user.id,
            email: user.email!,
            emailVerified: user.emailVerified
          }
        };
      }
    }

    next();
    
  } catch (error) {
    // If token is malformed, continue without authentication
    console.warn('[JWT AUTH] Optional authentication failed:', error);
    next();
  }
}

/**
 * Compatibility alias for existing route handlers
 * Maintains the same function name as Replit Auth
 */
export const isAuthenticated = jwtAuthentication;

/**
 * Email verification guard
 * Additional middleware to ensure email is verified
 */
export function requireEmailVerification(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  const user = (req as AuthenticatedRequest).user;
  
  if (!user?.emailVerified) {
    res.status(403).json({ 
      success: false,
      error: 'Email verification required',
      message: 'Please verify your email address to access this feature',
      requiresVerification: true
    });
    return;
  }

  next();
}

/**
 * Admin role guard
 * Checks if user has admin privileges (future extension)
 */
export async function requireAdmin(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    const user = (req as AuthenticatedRequest).user;
    
    if (!user) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required',
        message: 'Unauthorized' 
      });
      return;
    }

    // Get full user data to check admin status
    const fullUser = await storage.getUser(user.id);
    
    // Note: Admin role checking would be implemented here
    // For now, this is a placeholder for future admin functionality
    
    next();
    
  } catch (error) {
    console.error('[JWT AUTH] Admin check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Authorization check failed' 
    });
  }
}