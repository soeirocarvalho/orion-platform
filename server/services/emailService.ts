/**
 * Email Service for ORION Authentication System
 * Handles sending verification emails, password reset emails, and other transactional emails
 * 
 * Development Mode: Logs emails to console for testing
 * Production Mode: Can be configured to use email providers (Outlook, SendGrid, etc.)
 */

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  from?: string;
}

class EmailService {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private fromEmail = process.env.FROM_EMAIL || 'noreply@orion-platform.com';
  private baseUrl = process.env.BASE_URL || 'http://localhost:5000';

  /**
   * Send email verification message
   */
  async sendEmailVerification(email: string, firstName: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${this.baseUrl}/verify-email?token=${verificationToken}`;
    
    const template = this.getEmailVerificationTemplate(firstName, verificationUrl);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, firstName: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.baseUrl}/reset-password?token=${resetToken}`;
    
    const template = this.getPasswordResetTemplate(firstName, resetUrl);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody
    });
  }

  /**
   * Send welcome email after successful registration
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const template = this.getWelcomeTemplate(firstName);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody
    });
  }

  /**
   * Core email sending method
   */
  private async sendEmail(options: EmailOptions): Promise<void> {
    if (this.isDevelopment) {
      // In development, log emails instead of sending them
      console.log('\n=== EMAIL NOTIFICATION ===');
      console.log(`To: ${options.to}`);
      console.log(`From: ${options.from || this.fromEmail}`);
      console.log(`Subject: ${options.subject}`);
      console.log('--- Text Body ---');
      console.log(options.textBody);
      console.log('--- HTML Body ---');
      console.log(options.htmlBody);
      console.log('========================\n');
      return;
    }

    // Production email sending would go here
    // This can be extended to use Outlook integration, SendGrid, etc.
    try {
      // TODO: Implement actual email sending using email provider
      console.log(`[EMAIL] Sending email to ${options.to}: ${options.subject}`);
      
      // Placeholder for real email service integration
      // await emailProvider.send(options);
      
    } catch (error) {
      console.error('[EMAIL] Failed to send email:', error);
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Email verification template
   */
  private getEmailVerificationTemplate(firstName: string, verificationUrl: string): EmailTemplate {
    return {
      subject: 'Verify Your ORION Account',
      htmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
            .button { 
              display: inline-block; 
              background: #2563eb; 
              color: white; 
              padding: 12px 24px; 
              text-decoration: none; 
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer { margin-top: 30px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ORION</div>
              <p>Strategic Intelligence Platform</p>
            </div>
            
            <h2>Welcome to ORION, ${firstName}!</h2>
            
            <p>Thank you for creating your ORION account. To get started, please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${verificationUrl}</p>
            
            <p>This verification link will expire in 24 hours for security reasons.</p>
            
            <p>Once verified, you'll have full access to ORION's strategic intelligence features including:</p>
            <ul>
              <li>Three-lens scanning (Megatrends, Trends, Weak Signals)</li>
              <li>AI-powered strategic analysis</li>
              <li>Custom project management</li>
              <li>Advanced reporting capabilities</li>
            </ul>
            
            <div class="footer">
              <p>Best regards,<br>The ORION Team</p>
              <p>If you didn't create this account, please ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      textBody: `
Welcome to ORION, ${firstName}!

Thank you for creating your ORION account. To get started, please verify your email address by visiting:

${verificationUrl}

This verification link will expire in 24 hours for security reasons.

Once verified, you'll have full access to ORION's strategic intelligence features including:
- Three-lens scanning (Megatrends, Trends, Weak Signals)
- AI-powered strategic analysis  
- Custom project management
- Advanced reporting capabilities

Best regards,
The ORION Team

If you didn't create this account, please ignore this email.
      `
    };
  }

  /**
   * Password reset template
   */
  private getPasswordResetTemplate(firstName: string, resetUrl: string): EmailTemplate {
    return {
      subject: 'Reset Your ORION Password',
      htmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
            .button { 
              display: inline-block; 
              background: #dc2626; 
              color: white; 
              padding: 12px 24px; 
              text-decoration: none; 
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer { margin-top: 30px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ORION</div>
              <p>Strategic Intelligence Platform</p>
            </div>
            
            <h2>Password Reset Request</h2>
            
            <p>Hi ${firstName},</p>
            
            <p>We received a request to reset the password for your ORION account. Click the button below to create a new password:</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
            
            <p>This password reset link will expire in 1 hour for security reasons.</p>
            
            <p><strong>If you didn't request this password reset, please ignore this email.</strong> Your password will remain unchanged.</p>
            
            <div class="footer">
              <p>Best regards,<br>The ORION Team</p>
              <p>For security questions, contact our support team.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      textBody: `
Password Reset Request

Hi ${firstName},

We received a request to reset the password for your ORION account. Visit this link to create a new password:

${resetUrl}

This password reset link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The ORION Team
      `
    };
  }

  /**
   * Welcome email template
   */
  private getWelcomeTemplate(firstName: string): EmailTemplate {
    return {
      subject: 'Welcome to ORION - Your Strategic Intelligence Journey Begins',
      htmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
            .button { 
              display: inline-block; 
              background: #059669; 
              color: white; 
              padding: 12px 24px; 
              text-decoration: none; 
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer { margin-top: 30px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ORION</div>
              <p>Strategic Intelligence Platform</p>
            </div>
            
            <h2>Welcome to ORION, ${firstName}!</h2>
            
            <p>Your email has been verified and your account is now active. You're ready to explore strategic intelligence with ORION's powerful analytics.</p>
            
            <div style="text-align: center;">
              <a href="${this.baseUrl}/dashboard" class="button">Access Your Dashboard</a>
            </div>
            
            <h3>Getting Started</h3>
            <p>Here's what you can do with ORION:</p>
            <ul>
              <li><strong>Strategic Scanning:</strong> Analyze driving forces across multiple dimensions</li>
              <li><strong>Project Management:</strong> Organize your research and insights</li>
              <li><strong>AI Copilot:</strong> Get strategic guidance powered by GPT</li>
              <li><strong>Advanced Analytics:</strong> Generate reports and visualizations</li>
            </ul>
            
            <p>Your current plan includes access to ${process.env.NODE_ENV === 'development' ? '2,868' : 'thousands of'} curated driving forces to fuel your strategic analysis.</p>
            
            <div class="footer">
              <p>Ready to start your strategic intelligence journey?</p>
              <p>Best regards,<br>The ORION Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
      textBody: `
Welcome to ORION, ${firstName}!

Your email has been verified and your account is now active. You're ready to explore strategic intelligence with ORION's powerful analytics.

Getting Started:
- Strategic Scanning: Analyze driving forces across multiple dimensions
- Project Management: Organize your research and insights  
- AI Copilot: Get strategic guidance powered by GPT
- Advanced Analytics: Generate reports and visualizations

Visit your dashboard: ${this.baseUrl}/dashboard

Ready to start your strategic intelligence journey?

Best regards,
The ORION Team
      `
    };
  }
}

export const emailService = new EmailService();