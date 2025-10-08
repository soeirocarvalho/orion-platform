import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, AlertCircle, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import orionLogo from "/orion_logo.png";

const resetRequestSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ResetRequestForm = z.infer<typeof resetRequestSchema>;

interface ResetRequestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default function RequestPasswordReset() {
  const [, setLocation] = useLocation();

  const form = useForm<ResetRequestForm>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: {
      email: "",
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetRequestForm): Promise<ResetRequestResponse> => {
      const response = await apiRequest("POST", "/api/auth/request-password-reset", data);
      return await response.json();
    },
    onSuccess: (response) => {
      if (response.success) {
        // Redirect to check email page with email parameter
        setLocation(`/reset-sent?email=${encodeURIComponent(form.getValues("email"))}`);
      }
    },
  });

  const onSubmit = (data: ResetRequestForm) => {
    resetMutation.mutate(data);
  };

  const resetError = resetMutation.error || 
    (!resetMutation.data?.success && resetMutation.data?.error);

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
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-xl text-white flex items-center justify-center gap-2">
              <Mail className="h-5 w-5 text-blue-400" />
              Reset Your Password
            </CardTitle>
            <CardDescription className="text-slate-300">
              Enter your email address and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">Email Address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="your.email@company.com"
                          className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                          data-testid="input-reset-email"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {resetError && (
                  <Alert className="border-red-500/50 bg-red-500/10">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-red-300">
                      {resetError.toString()}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  disabled={resetMutation.isPending}
                  data-testid="button-send-reset"
                >
                  {resetMutation.isPending ? "Sending Reset Link..." : "Send Reset Link"}
                </Button>
              </form>
            </Form>

            <div className="space-y-4">
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

              <div className="text-center text-sm text-slate-400">
                Don't have an account?{" "}
                <Link 
                  href="/register" 
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                  data-testid="link-register"
                >
                  Create account
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