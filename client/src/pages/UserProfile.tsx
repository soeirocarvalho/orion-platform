import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  User, 
  Lock, 
  Building2, 
  Mail, 
  MapPin, 
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Loader2
} from "lucide-react";

// Validation schemas
const profileUpdateSchema = z.object({
  firstName: z.string().max(50, "First name must be less than 50 characters").optional(),
  lastName: z.string().max(50, "Last name must be less than 50 characters").optional(),
  companyName: z.string().max(100, "Company name must be less than 100 characters").optional(),
  jobTitle: z.string().max(100, "Job title must be less than 100 characters").optional(),
  industry: z.string().max(50, "Industry must be less than 50 characters").optional(),
  country: z.string().max(50, "Country must be less than 50 characters").optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      "Password must contain uppercase, lowercase, number, and special character"),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileUpdateForm = z.infer<typeof profileUpdateSchema>;
type PasswordChangeForm = z.infer<typeof passwordChangeSchema>;

interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  companyName?: string;
  jobTitle?: string;
  industry?: string;
  country?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function UserProfile() {
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const { toast } = useToast();

  // Get user profile
  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ['/api/user/profile'],
  });

  // Profile update form
  const profileForm = useForm<ProfileUpdateForm>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      companyName: profile?.companyName || '',
      jobTitle: profile?.jobTitle || '',
      industry: profile?.industry || '',
      country: profile?.country || '',
    },
  });

  // Password change form
  const passwordForm = useForm<PasswordChangeForm>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (data: ProfileUpdateForm) => {
      return apiRequest('PUT', '/api/user/profile', data);
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile information has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.response?.data?.error || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePassword = useMutation({
    mutationFn: async (data: Omit<PasswordChangeForm, 'confirmPassword'>) => {
      return apiRequest('PUT', '/api/user/change-password', data);
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been successfully updated.",
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Password Change Failed",
        description: error.response?.data?.error || "Failed to change password. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update default values when profile loads
  useEffect(() => {
    if (profile && !profileForm.formState.isDirty) {
      profileForm.reset({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        companyName: profile.companyName || '',
        jobTitle: profile.jobTitle || '',
        industry: profile.industry || '',
        country: profile.country || '',
      });
    }
  }, [profile]);

  const onProfileSubmit = (data: ProfileUpdateForm) => {
    updateProfile.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordChangeForm) => {
    const { confirmPassword, ...passwordData } = data;
    changePassword.mutate(passwordData);
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your account information and security settings
          </p>
        </div>

        {/* Profile Overview Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <User className="h-8 w-8 text-white" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">
                  {profile?.firstName || profile?.lastName 
                    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                    : 'Welcome'
                  }
                </h2>
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{profile?.email}</span>
                  {profile?.emailVerified ? (
                    <Badge variant="secondary" className="text-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Unverified
                    </Badge>
                  )}
                </div>
                {profile?.companyName && (
                  <div className="flex items-center space-x-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{profile.companyName}</span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'profile' | 'security')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="w-4 h-4 mr-2" />
              Profile Information
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              <Lock className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information and company details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                  {/* Personal Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Personal Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          {...profileForm.register('firstName')}
                          placeholder="Enter your first name"
                          data-testid="input-first-name"
                        />
                        {profileForm.formState.errors.firstName && (
                          <p className="text-sm text-red-600">
                            {profileForm.formState.errors.firstName.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          {...profileForm.register('lastName')}
                          placeholder="Enter your last name"
                          data-testid="input-last-name"
                        />
                        {profileForm.formState.errors.lastName && (
                          <p className="text-sm text-red-600">
                            {profileForm.formState.errors.lastName.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Professional Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Professional Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          {...profileForm.register('companyName')}
                          placeholder="Enter your company name"
                          data-testid="input-company-name"
                        />
                        {profileForm.formState.errors.companyName && (
                          <p className="text-sm text-red-600">
                            {profileForm.formState.errors.companyName.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="jobTitle">Job Title</Label>
                        <Input
                          id="jobTitle"
                          {...profileForm.register('jobTitle')}
                          placeholder="Enter your job title"
                          data-testid="input-job-title"
                        />
                        {profileForm.formState.errors.jobTitle && (
                          <p className="text-sm text-red-600">
                            {profileForm.formState.errors.jobTitle.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="industry">Industry</Label>
                        <Input
                          id="industry"
                          {...profileForm.register('industry')}
                          placeholder="Enter your industry"
                          data-testid="input-industry"
                        />
                        {profileForm.formState.errors.industry && (
                          <p className="text-sm text-red-600">
                            {profileForm.formState.errors.industry.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          {...profileForm.register('country')}
                          placeholder="Enter your country"
                          data-testid="input-country"
                        />
                        {profileForm.formState.errors.country && (
                          <p className="text-sm text-red-600">
                            {profileForm.formState.errors.country.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateProfile.isPending || !profileForm.formState.isDirty}
                      data-testid="button-save-profile"
                    >
                      {updateProfile.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      {...passwordForm.register('currentPassword')}
                      placeholder="Enter your current password"
                      data-testid="input-current-password"
                    />
                    {passwordForm.formState.errors.currentPassword && (
                      <p className="text-sm text-red-600">
                        {passwordForm.formState.errors.currentPassword.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      {...passwordForm.register('newPassword')}
                      placeholder="Enter your new password"
                      data-testid="input-new-password"
                    />
                    {passwordForm.formState.errors.newPassword && (
                      <p className="text-sm text-red-600">
                        {passwordForm.formState.errors.newPassword.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      {...passwordForm.register('confirmPassword')}
                      placeholder="Confirm your new password"
                      data-testid="input-confirm-password"
                    />
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="text-sm text-red-600">
                        {passwordForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your password must be at least 8 characters long and contain uppercase letters,
                      lowercase letters, numbers, and special characters.
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={changePassword.isPending}
                      data-testid="button-change-password"
                    >
                      {changePassword.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Changing Password...
                        </>
                      ) : (
                        'Change Password'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Email Verification Status */}
            <Card>
              <CardHeader>
                <CardTitle>Email Verification</CardTitle>
                <CardDescription>
                  Your email verification status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  {profile?.emailVerified ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="text-sm">Your email address is verified</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                      <span className="text-sm">Your email address is not verified</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}