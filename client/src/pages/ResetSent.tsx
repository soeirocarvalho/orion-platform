import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mail, CheckCircle, Clock } from "lucide-react";
import orionLogo from "/orion_logo.png";

export default function ResetSent() {
  const [location] = useLocation();
  
  // Extract email from URL parameters
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const email = urlParams.get('email') || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header with ORION Logo */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src={orionLogo} 
              alt="ORION" 
              className="h-16 w-auto"
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">ORION</h1>
            <p className="text-blue-300 text-sm">Strategic Intelligence Platform</p>
          </div>
        </div>

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-500/20 p-3">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </div>
            <CardTitle className="text-xl text-white">
              Reset Link Sent!
            </CardTitle>
            <CardDescription className="text-slate-300">
              We've sent a password reset link to your email address
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Email confirmation */}
            {email && (
              <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-slate-300">
                  <Mail className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium">Email sent to:</span>
                </div>
                <p className="text-white font-mono text-sm break-all" data-testid="text-reset-email">
                  {email}
                </p>
              </div>
            )}

            {/* Instructions */}
            <div className="space-y-4 text-slate-300 text-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-blue-500/20 p-1 mt-0.5">
                  <span className="block w-2 h-2 bg-blue-400 rounded-full"></span>
                </div>
                <div>
                  <p className="font-medium text-white">Check your email</p>
                  <p>Click the link in the email to reset your password</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-blue-500/20 p-1 mt-0.5">
                  <span className="block w-2 h-2 bg-blue-400 rounded-full"></span>
                </div>
                <div>
                  <p className="font-medium text-white">Check your spam folder</p>
                  <p>Sometimes our emails end up there</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-medium text-white">Link expires in 1 hour</p>
                  <p>For security reasons, the reset link will expire in 60 minutes</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                asChild
                className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                data-testid="button-back-to-login"
              >
                <Link href="/login">
                  Continue to Sign In
                </Link>
              </Button>

              <div className="text-center">
                <Link 
                  href="/reset-password" 
                  className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                  data-testid="link-try-again"
                >
                  Didn't receive the email? Try again
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back to Welcome */}
        <div className="text-center">
          <Link 
            href="/" 
            className="text-slate-400 hover:text-white text-sm inline-flex items-center gap-1 transition-colors"
            data-testid="link-back-welcome"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Welcome
          </Link>
        </div>
      </div>
    </div>
  );
}