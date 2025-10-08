import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { users } from '@shared/schema';
import { db } from '../db';
import { eq, and, gt } from 'drizzle-orm';
import { emailService } from './emailService.js';

// Security configuration
const JWT_SECRET_TEMP = process.env.JWT_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-secret-key-orion-platform-2025-very-long-and-secure' : undefined);
const JWT_EXPIRES_IN = '7d'; // JWT token expires in 7 days

// Validate JWT secret at startup
if (!JWT_SECRET_TEMP) {
  console.error('FATAL: JWT_SECRET environment variable is required for security');
  console.error('For development, set JWT_SECRET or allow the default development key');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && JWT_SECRET_TEMP.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters in production');
  process.exit(1);
}

// Warn if using development default
if (process.env.NODE_ENV === 'development' && !process.env.JWT_SECRET) {
  console.warn('[SECURITY WARNING] Using default development JWT secret. Set JWT_SECRET env var for production.');
}

// TypeScript-safe JWT secret after validation
const JWT_SECRET: string = JWT_SECRET_TEMP;
const SALT_ROUNDS = 12; // bcrypt salt rounds for password hashing
const MAX_LOGIN_ATTEMPTS = 5; // Maximum login attempts before lockout
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes lockout
const EMAIL_TOKEN_EXPIRES = 24 * 60 * 60 * 1000; // 24 hours for email verification
const PASSWORD_RESET_EXPIRES = 60 * 60 * 1000; // 1 hour for password reset

export interface JWTPayload {
  userId: string;
  email: string;
  emailVerified: boolean;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  success: boolean;
  user?: any;
  token?: string;
  error?: string;
  requiresVerification?: boolean;
  isLocked?: boolean;
}

export class AuthService {
  
  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT token for a user
   */
  generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'orion-platform',
      audience: 'orion-users'
    });
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'orion-platform',
        audience: 'orion-users',
        clockTolerance: 30 // Allow 30 seconds clock skew
      });
      
      // Type-safe conversion to our JWTPayload interface
      if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
        return decoded as JWTPayload;
      }
      
      return null;
    } catch (error) {
      console.error('JWT verification failed:', error);
      return null;
    }
  }

  /**
   * Generate a secure random token for email verification or password reset
   */
  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for secure database storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Check if a user account is locked due to too many failed attempts
   */
  async isAccountLocked(email: string): Promise<boolean> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return false;

    // Check if user is currently locked
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      return true;
    }

    // If lock expired, reset login attempts
    if (user.lockedUntil && new Date() >= user.lockedUntil) {
      await db.update(users)
        .set({ 
          loginAttempts: 0, 
          lockedUntil: null,
          updatedAt: new Date()
        })
        .where(eq(users.email, email));
    }

    return false;
  }

  /**
   * Record a failed login attempt
   */
  async recordFailedLogin(email: string): Promise<void> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return;

    const newAttempts = (user.loginAttempts || 0) + 1;
    const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

    await db.update(users)
      .set({
        loginAttempts: newAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_TIME) : null,
        updatedAt: new Date()
      })
      .where(eq(users.email, email));
  }

  /**
   * Reset login attempts on successful login
   */
  async resetLoginAttempts(email: string): Promise<void> {
    await db.update(users)
      .set({ 
        loginAttempts: 0, 
        lockedUntil: null,
        lastLoginAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.email, email));
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(email: string, password: string): Promise<AuthResult> {
    try {
      // Check if account is locked
      if (await this.isAccountLocked(email)) {
        return {
          success: false,
          error: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
          isLocked: true
        };
      }

      // Get user from database
      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user || !user.passwordHash) {
        // Record failed attempt even for non-existent users to prevent user enumeration
        await this.recordFailedLogin(email);
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      
      if (!isValidPassword) {
        await this.recordFailedLogin(email);
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Check if email is verified
      if (!user.emailVerified) {
        return {
          success: false,
          error: 'Please verify your email address before logging in.',
          requiresVerification: true
        };
      }

      // Reset login attempts and generate token
      await this.resetLoginAttempts(email);
      
      const token = this.generateToken({
        userId: user.id,
        email: user.email!,
        emailVerified: user.emailVerified
      });

      // Remove sensitive fields from user object
      const { passwordHash, passwordResetToken, emailVerificationToken, ...safeUser } = user;

      return {
        success: true,
        user: safeUser,
        token
      };

    } catch (error) {
      console.error('Authentication error:', error);
      return {
        success: false,
        error: 'Authentication failed. Please try again.'
      };
    }
  }

  /**
   * Send email verification to user
   */
  async sendEmailVerification(email: string, firstName: string, verificationToken: string): Promise<void> {
    try {
      await emailService.sendEmailVerification(email, firstName, verificationToken);
      console.log('[AUTH] Email verification sent to:', email);
    } catch (error) {
      console.error('[AUTH] Failed to send verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Create email verification token
   */
  async createEmailVerificationToken(email: string): Promise<string | null> {
    try {
      const token = this.generateSecureToken();
      const hashedToken = this.hashToken(token);
      const expiresAt = new Date(Date.now() + EMAIL_TOKEN_EXPIRES);

      const result = await db.update(users)
        .set({
          emailVerificationToken: hashedToken, // Store hashed token
          emailVerificationExpiresAt: expiresAt,
          updatedAt: new Date()
        })
        .where(eq(users.email, email))
        .returning();

      return result.length > 0 ? token : null; // Return original token for email
    } catch (error) {
      console.error('Error creating email verification token:', error);
      return null;
    }
  }

  /**
   * Verify email verification token
   */
  async verifyEmailToken(token: string): Promise<AuthResult> {
    try {
      const hashedToken = this.hashToken(token);
      
      const [user] = await db.select()
        .from(users)
        .where(and(
          eq(users.emailVerificationToken, hashedToken), // Compare with hashed token
          gt(users.emailVerificationExpiresAt, new Date())
        ))
        .limit(1);

      if (!user) {
        return {
          success: false,
          error: 'Invalid or expired verification token'
        };
      }

      // Mark email as verified and clear token (single-use)
      await db.update(users)
        .set({
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, user.id));

      // Send welcome email after successful verification
      try {
        await emailService.sendWelcomeEmail(user.email!, user.firstName || 'User');
        console.log('[AUTH] Welcome email sent to:', user.email);
      } catch (emailError) {
        console.error('[AUTH] Failed to send welcome email:', emailError);
        // Continue anyway - email verification was successful
      }

      return {
        success: true,
        user: { ...user, emailVerified: true }
      };

    } catch (error) {
      console.error('Email verification error:', error);
      return {
        success: false,
        error: 'Email verification failed. Please try again.'
      };
    }
  }

  /**
   * Create password reset token
   */
  async createPasswordResetToken(email: string): Promise<string | null> {
    try {
      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user) {
        // Return null but don't reveal if user exists
        return null;
      }

      const token = this.generateSecureToken();
      const hashedToken = this.hashToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES);

      await db.update(users)
        .set({
          passwordResetToken: hashedToken, // Store hashed token
          passwordResetExpiresAt: expiresAt,
          updatedAt: new Date()
        })
        .where(eq(users.id, user.id));

      // Send password reset email
      try {
        await emailService.sendPasswordReset(user.email!, user.firstName || 'User', token); // Send original token
        console.log('[AUTH] Password reset email sent to:', user.email);
      } catch (emailError) {
        console.error('[AUTH] Failed to send password reset email:', emailError);
        // Continue anyway - token was created successfully
      }

      return token; // Return original token for response
    } catch (error) {
      console.error('Error creating password reset token:', error);
      return null;
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    try {
      const hashedToken = this.hashToken(token);
      
      const [user] = await db.select()
        .from(users)
        .where(and(
          eq(users.passwordResetToken, hashedToken), // Compare with hashed token
          gt(users.passwordResetExpiresAt, new Date())
        ))
        .limit(1);

      if (!user) {
        return {
          success: false,
          error: 'Invalid or expired reset token'
        };
      }

      // Hash new password and clear reset token (single-use)
      const hashedPassword = await this.hashPassword(newPassword);
      
      await db.update(users)
        .set({
          passwordHash: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          loginAttempts: 0, // Reset failed attempts
          lockedUntil: null, // Remove any lockout
          updatedAt: new Date()
        })
        .where(eq(users.id, user.id));

      return {
        success: true,
        user: { ...user, passwordHash: undefined }
      };

    } catch (error) {
      console.error('Password reset error:', error);
      return {
        success: false,
        error: 'Password reset failed. Please try again.'
      };
    }
  }
}

// Export singleton instance
export const authService = new AuthService();