import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle, Lock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import orionLogo from "/orion_logo.png";

// Password validation schema (same as registration)
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const setPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SetPasswordForm = z.infer<typeof setPasswordSchema>;

interface SetPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default function SetNewPassword() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Extract token from URL path using wouter's route matching
  const [match, params] = useRoute('/reset-password/:token');
  const token = params?.token || '';

  const form = useForm<SetPasswordForm>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (data: SetPasswordForm): Promise<SetPasswordResponse> => {
      const response = await apiRequest("POST", "/api/auth/reset-password", {
        token,
        newPassword: data.password,
      });
      return await response.json();
    },
    // Remove redirect - let the component show success state instead
  });

  const onSubmit = (data: SetPasswordForm) => {
    setPasswordMutation.mutate(data);
  };

  const setPasswordError = setPasswordMutation.error || 
    (!setPasswordMutation.data?.success && setPasswordMutation.data?.error);

  const isSuccess = setPasswordMutation.data?.success;

  // If no token, show error
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <img src={orionLogo} alt="ORION" className="h-16 w-auto" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">ORION</h1>
              <p className="text-blue-300 text-sm">Strategic Intelligence Platform</p>
            </div>
          </div>

          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-xl text-white flex items-center justify-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                Invalid Reset Link
              </CardTitle>
              <CardDescription className="text-slate-300">
                This password reset link is invalid or has expired
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
                <Link href="/reset-password">Request New Reset Link</Link>
              </Button>
              <div className="text-center">
                <Link href="/login" className="text-blue-400 hover:text-blue-300 text-sm">
                  Back to Sign In
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
          {isSuccess ? (
            <>
              <CardHeader className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-500/20 p-3">
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                </div>
                <CardTitle className="text-xl text-white">
                  Password Reset Complete!
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Your password has been successfully updated
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <Button
                  asChild
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  data-testid="button-continue-login"
                >
                  <Link href="/login">
                    Continue to Sign In
                  </Link>
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center space-y-1">
                <CardTitle className="text-xl text-white flex items-center justify-center gap-2">
                  <Lock className="h-5 w-5 text-blue-400" />
                  Set New Password
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Enter your new secure password below
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-200">New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter new password"
                                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500 pr-10"
                                data-testid="input-new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                data-testid="button-toggle-password"
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-200">Confirm New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm new password"
                                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500 pr-10"
                                data-testid="input-confirm-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                data-testid="button-toggle-confirm-password"
                              >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />

                    {/* Password requirements */}
                    <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
                      <p className="text-slate-300 text-sm font-medium">Password requirements:</p>
                      <ul className="text-slate-400 text-xs space-y-1">
                        <li>• At least 8 characters long</li>
                        <li>• One uppercase letter (A-Z)</li>
                        <li>• One lowercase letter (a-z)</li>
                        <li>• One number (0-9)</li>
                        <li>• One special character (!@#$%^&*)</li>
                      </ul>
                    </div>

                    {setPasswordError && (
                      <Alert className="border-red-500/50 bg-red-500/10">
                        <AlertCircle className="h-4 w-4 text-red-400" />
                        <AlertDescription className="text-red-300">
                          {setPasswordError.toString()}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      disabled={setPasswordMutation.isPending}
                      data-testid="button-set-password"
                    >
                      {setPasswordMutation.isPending ? "Updating Password..." : "Update Password"}
                    </Button>
                  </form>
                </Form>

                <div className="text-center">
                  <Link 
                    href="/login" 
                    className="text-blue-400 hover:text-blue-300 text-sm inline-flex items-center gap-1 transition-colors"
                    data-testid="link-back-to-login"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Sign In
                  </Link>
                </div>
              </CardContent>
            </>
          )}
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