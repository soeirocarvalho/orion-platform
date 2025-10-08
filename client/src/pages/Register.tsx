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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import orionLogo from "/orion_logo.png";

// Password validation schema
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  company: z.string().min(1, "Company is required"),
  position: z.string().min(1, "Position is required"),
  industry: z.string().min(1, "Please select an industry"),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

interface RegisterResponse {
  success: boolean;
  message?: string;
  error?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

const industries = [
  "Technology",
  "Healthcare",
  "Finance",
  "Education",
  "Manufacturing",
  "Retail",
  "Energy",
  "Transportation",
  "Real Estate",
  "Consulting",
  "Government",
  "Non-profit",
  "Media & Entertainment",
  "Agriculture",
  "Other",
];

export default function Register() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      position: "",
      industry: "",
      password: "",
      confirmPassword: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm): Promise<RegisterResponse> => {
      try {
        const response = await apiRequest("POST", "/api/auth/register", {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          company: data.company,
          position: data.position,
          industry: data.industry,
          password: data.password,
        });
        const result = await response.json();
        console.log('Registration response:', result); // Debug log
        
        // If backend returned an error, throw it so we can display it
        if (!result.success && result.error) {
          throw new Error(result.error);
        }
        
        return result;
      } catch (error) {
        console.error('Registration error:', error);
        // Re-throw with a proper message
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('Registration failed. Please check your connection and try again.');
      }
    },
    onSuccess: (response) => {
      console.log('Registration onSuccess called with:', response); // Debug log
      if (response.success) {
        setRegistrationComplete(true);
      }
    },
    onError: (error) => {
      console.error('Registration mutation error:', error);
    },
  });

  const onSubmit = (data: RegisterForm) => {
    registerMutation.mutate(data);
  };

  const registrationError = registerMutation.error instanceof Error 
    ? registerMutation.error.message 
    : registerMutation.error
    ? String(registerMutation.error)
    : (!registerMutation.data?.success && registerMutation.data?.error);

  // Show success screen after registration
  if (registrationComplete && registerMutation.data?.success) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-['SF_Pro_Display','Helvetica_Neue',Arial,sans-serif] text-white">
        <div className="w-full max-w-md px-6 py-8">
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
              
              <div className="flex justify-center mb-4">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
              
              <CardTitle className="text-2xl font-bold text-white">
                Registration Complete!
              </CardTitle>
              <CardDescription className="text-white/70">
                Thank you for joining ORION. We've sent a verification email to your inbox.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-400">
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  <strong>Check your email:</strong> Click the verification link we sent to {registerMutation.data?.user?.email} to activate your account.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button
                  onClick={() => setLocation("/login")}
                  className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold"
                  data-testid="button-go-to-login"
                >
                  Go to Sign In
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => setLocation("/")}
                  className="w-full border-white/20 text-white hover:bg-white/5"
                  data-testid="button-back-welcome"
                >
                  Back to Welcome
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-['SF_Pro_Display','Helvetica_Neue',Arial,sans-serif] text-white py-8">
      <div className="w-full max-w-lg px-6">
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
              Join ORION
            </CardTitle>
            <CardDescription className="text-white/70">
              Create your strategic intelligence account
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Registration Error */}
            {registrationError && (
              <Alert className="bg-red-500/10 border-red-500/20 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {typeof registrationError === 'string' ? registrationError : 'Registration failed. Please try again.'}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">First Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="John"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
                            data-testid="input-firstname"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Last Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Doe"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
                            data-testid="input-lastname"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>

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
                          placeholder="john.doe@company.com"
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {/* Company Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Company</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Acme Corp"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
                            data-testid="input-company"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Position</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Strategy Director"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
                            data-testid="input-position"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Industry Select */}
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Industry</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white/10 border-white/20 text-white data-[placeholder]:text-white/50 focus:border-white/40" data-testid="select-industry">
                            <SelectValue placeholder="Select your industry" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-black border-white/20">
                          {industries.map((industry) => (
                            <SelectItem key={industry} value={industry} className="text-white hover:bg-white/10">
                              {industry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {/* Password Fields */}
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
                            placeholder="Create a secure password"
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

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm your password"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 pr-10"
                            data-testid="input-confirm-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                            data-testid="button-toggle-confirm-password"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {/* Password Requirements */}
                <div className="text-xs text-white/60 space-y-1">
                  <p>Password must contain:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>At least 8 characters</li>
                    <li>One uppercase letter</li>
                    <li>One lowercase letter</li>
                    <li>One number</li>
                    <li>One special character</li>
                  </ul>
                </div>

                {/* Register Button */}
                <Button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold"
                  data-testid="button-register"
                >
                  {registerMutation.isPending ? "Creating Account..." : "Create Account"}
                </Button>
              </form>
            </Form>

            {/* Login Link */}
            <div className="text-center pt-4 border-t border-white/10">
              <p className="text-white/70 text-sm">
                Already have an account?{" "}
                <Link 
                  href="/login" 
                  className="text-white hover:text-white/80 font-semibold transition-colors"
                  data-testid="link-login"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}