import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Eye, EyeOff, ArrowLeft, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import orionLogo from "/orion_logo.png";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    emailVerified: boolean;
  };
  error?: string;
  message?: string;
  requiresVerification?: boolean;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm): Promise<LoginResponse> => {
      // Make direct fetch call to handle 401 responses properly
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      return await response.json();
    },
    onSuccess: async (response) => {
      if (response.success && response.token) {
        // Store JWT token in localStorage
        localStorage.setItem("auth_token", response.token);
        
        // Check if user has active subscription
        try {
          const subRes = await fetch('/api/v1/subscription/current', {
            headers: {
              'Authorization': `Bearer ${response.token}`
            }
          });
          const subData = await subRes.json();
          
          // If user has active subscription, go to projects
          // Otherwise, redirect to pricing to subscribe
          if (subData?.subscription?.status === 'active') {
            setLocation("/projects");
          } else {
            setLocation("/pricing");
          }
        } catch (error) {
          // On error, redirect to pricing (safe default for new users)
          console.error('Failed to check subscription:', error);
          setLocation("/pricing");
        }
      }
    },
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  const loginError = loginMutation.error || 
    (!loginMutation.data?.success && loginMutation.data?.error);

  const requiresVerification = loginMutation.data?.requiresVerification;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-['SF_Pro_Display','Helvetica_Neue',Arial,sans-serif] text-white">
      <div className="w-full max-w-md px-6 py-8">
        {/* Back to Welcome */}
        <div className="mb-6">
          <Link 
            href="/" 
            className="inline-flex items-center text-white/70 hover:text-white transition-colors"
            data-testid="link-back-welcome"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Welcome
          </Link>
        </div>

        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            {/* ORION Logo */}
            <div className="flex justify-center mb-4">
              <img
                src={orionLogo}
                alt="ORION Logo"
                className="w-16 h-16 object-contain rounded-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
              />
            </div>
            
            <CardTitle className="text-2xl font-bold text-white">
              Sign in to ORION
            </CardTitle>
            <CardDescription className="text-white/70">
              Access your strategic intelligence platform
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Email Verification Alert */}
            {requiresVerification && (
              <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please verify your email address before signing in. Check your inbox for a verification link.
                </AlertDescription>
              </Alert>
            )}

            {/* Login Error */}
            {loginError && !requiresVerification && (
              <Alert className="bg-red-500/10 border-red-500/20 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {typeof loginError === 'string' ? loginError : 'Login failed. Please check your credentials.'}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Email Field */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="Enter your email"
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {/* Password Field */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 pr-10"
                            data-testid="input-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {/* Forgot Password Link */}
                <div className="text-right">
                  <Link 
                    href="/reset-password" 
                    className="text-sm text-white/70 hover:text-white transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot your password?
                  </Link>
                </div>

                {/* Login Button */}
                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold"
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </Form>

            {/* Register Link */}
            <div className="text-center pt-4 border-t border-white/10">
              <p className="text-white/70 text-sm">
                Don't have an account?{" "}
                <Link 
                  href="/register" 
                  className="text-white hover:text-white/80 font-semibold transition-colors"
                  data-testid="link-register"
                >
                  Create an account
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}