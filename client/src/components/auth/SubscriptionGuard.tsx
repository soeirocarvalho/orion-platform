import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { TIER_PERMISSIONS, PAGE_ACCESS, type PageAccess, type FeatureAccess } from '@shared/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Lock, Zap, Building2 } from 'lucide-react';
import { Link } from 'wouter';

interface SubscriptionGuardProps {
  children: ReactNode;
  requiredPage?: PageAccess;
  requiredFeature?: FeatureAccess;
  fallbackComponent?: ReactNode;
  showUpgradePrompt?: boolean;
}

interface UpgradePromptProps {
  requiredPage?: PageAccess;
  requiredFeature?: FeatureAccess;
  userTier?: string;
}

function UpgradePrompt({ requiredPage, requiredFeature, userTier }: UpgradePromptProps) {
  const getRequiredTier = () => {
    if (requiredPage === PAGE_ACCESS.REPORTS || requiredPage === PAGE_ACCESS.COPILOT) {
      return 'professional';
    }
    if (requiredFeature && ['api_access', 'team_sharing'].includes(requiredFeature)) {
      return 'enterprise';
    }
    return 'professional';
  };

  const getUpgradeText = () => {
    const requiredTier = getRequiredTier();
    if (requiredPage === PAGE_ACCESS.REPORTS) {
      return {
        title: 'Strategic Reports',
        description: 'Generate comprehensive strategic intelligence reports with AI-powered insights.',
        tier: requiredTier
      };
    }
    if (requiredPage === PAGE_ACCESS.COPILOT) {
      return {
        title: 'ORION Copilot',
        description: 'Access your personal AI assistant for strategic planning and innovation guidance.',
        tier: requiredTier
      };
    }
    return {
      title: 'Premium Feature',
      description: 'This feature requires a higher subscription tier to access.',
      tier: requiredTier
    };
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'professional':
        return <Crown className="w-8 h-8 text-purple-500" />;
      case 'enterprise':
        return <Building2 className="w-8 h-8 text-orange-500" />;
      default:
        return <Zap className="w-8 h-8 text-blue-500" />;
    }
  };

  const getTierName = (tier: string) => {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  };

  const upgradeInfo = getUpgradeText();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Lock className="w-16 h-16 text-muted-foreground" />
              <div className="absolute -bottom-2 -right-2">
                {getTierIcon(upgradeInfo.tier)}
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl">{upgradeInfo.title}</CardTitle>
          <CardDescription className="text-base">
            {upgradeInfo.description}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="text-center space-y-4">
          <div className="flex justify-center">
            <Badge variant="outline" className="text-sm">
              Requires {getTierName(upgradeInfo.tier)} Plan
            </Badge>
          </div>
          
          {userTier && (
            <p className="text-sm text-muted-foreground">
              Your current plan: <span className="font-medium capitalize">{userTier}</span>
            </p>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button asChild className="flex-1">
              <Link href="/pricing" data-testid="button-upgrade">
                Upgrade Now
              </Link>
            </Button>
            <Button variant="outline" asChild className="flex-1">
              <Link href="/scanning" data-testid="button-back-scanning">
                Back to Scanning
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SubscriptionGuard({ 
  children, 
  requiredPage, 
  requiredFeature, 
  fallbackComponent,
  showUpgradePrompt = true 
}: SubscriptionGuardProps) {
  const { user } = useAuth();

  // Allow access if no specific requirements
  if (!requiredPage && !requiredFeature) {
    return <>{children}</>;
  }

  // If no user, redirect to login (handled by existing auth system)
  if (!user) {
    return <>{children}</>;
  }

  const userTier = (user as any)?.subscriptionTier || 'basic';
  const userPermissions = TIER_PERMISSIONS[userTier as keyof typeof TIER_PERMISSIONS];

  // Check page access
  if (requiredPage && !userPermissions.pages.includes(requiredPage)) {
    if (fallbackComponent) {
      return <>{fallbackComponent}</>;
    }
    
    if (showUpgradePrompt) {
      return <UpgradePrompt requiredPage={requiredPage} userTier={userTier} />;
    }
    
    return null;
  }

  // Check feature access
  if (requiredFeature && !userPermissions.features.includes(requiredFeature)) {
    if (fallbackComponent) {
      return <>{fallbackComponent}</>;
    }
    
    if (showUpgradePrompt) {
      return <UpgradePrompt requiredFeature={requiredFeature} userTier={userTier} />;
    }
    
    return null;
  }

  // User has access
  return <>{children}</>;
}

// Hook to check permissions in components
export function useSubscriptionAccess() {
  const { user } = useAuth();
  
  const userTier = (user as any)?.subscriptionTier || 'basic';
  const userPermissions = TIER_PERMISSIONS[userTier as keyof typeof TIER_PERMISSIONS];

  const hasPageAccess = (page: PageAccess) => {
    return userPermissions.pages.includes(page);
  };

  const hasFeatureAccess = (feature: FeatureAccess) => {
    return userPermissions.features.includes(feature);
  };

  const canAccessReports = () => hasPageAccess(PAGE_ACCESS.REPORTS);
  const canAccessCopilot = () => hasPageAccess(PAGE_ACCESS.COPILOT);
  const canUseAPI = () => hasFeatureAccess('api_access');
  const canUseTeamSharing = () => hasFeatureAccess('team_sharing');

  return {
    userTier,
    hasPageAccess,
    hasFeatureAccess,
    canAccessReports,
    canAccessCopilot,
    canUseAPI,
    canUseTeamSharing,
    allowedPages: userPermissions.pages,
    allowedFeatures: userPermissions.features
  };
}