import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  Loader2, 
  CreditCard, 
  Calendar, 
  TrendingUp, 
  Settings, 
  AlertTriangle,
  Crown,
  Zap,
  Building2
} from "lucide-react";

interface SubscriptionPlan {
  id: string;
  name: string;
  stripePriceId: string;
  price: number;
  currency: string;
  features: string[];
  aiQueriesLimit: number;
  projectsLimit: number;
  forcesLimit: number;
  usersLimit: number;
  apiAccess: boolean;
  customReports: boolean;
}

interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  aiUsageMonth: number;
  plan: SubscriptionPlan;
}

interface SubscriptionHistory {
  id: string;
  subscriptionId: string;
  event: string;
  fromTier: string | null;
  toTier: string;
  timestamp: string;
  metadata: Record<string, any>;
}

export default function SubscriptionDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'billing' | 'usage'>('overview');
  const { user } = useAuth();
  const { toast } = useToast();

  // Get current subscription
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<UserSubscription>({
    queryKey: ["/api/v1/subscription/current"],
    enabled: !!user,
  });

  // Get all available plans
  const { data: plans } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/v1/subscription/plans"],
  });

  // Get subscription history
  const { data: history } = useQuery<SubscriptionHistory[]>({
    queryKey: ["/api/v1/subscription/history"],
    enabled: !!user,
  });

  // Cancel subscription mutation
  const cancelSubscription = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/v1/subscription/cancel`, 'POST', {});
    },
    onSuccess: () => {
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription has been cancelled and will end at the current period.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/subscription"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reactivate subscription mutation
  const reactivateSubscription = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/v1/subscription/reactivate`, 'POST', {});
    },
    onSuccess: () => {
      toast({
        title: "Subscription Reactivated",
        description: "Your subscription has been reactivated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/subscription"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reactivate subscription. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (subscriptionLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin mr-2" />
        <span>Loading subscription details...</span>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>No Active Subscription</CardTitle>
            <CardDescription>
              You don't have an active subscription. Choose a plan to get started with ORION.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = '/pricing'}>
              View Pricing Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatPrice = (price: number, currency: string) => {
    const symbol = currency === 'eur' ? '€' : '$';
    return `${symbol}${price}`;
  };

  const getPlanIcon = (planName: string) => {
    switch (planName.toLowerCase()) {
      case 'basic':
        return <Zap className="w-6 h-6 text-blue-500" />;
      case 'professional':
        return <Crown className="w-6 h-6 text-purple-500" />;
      case 'enterprise':
        return <Building2 className="w-6 h-6 text-orange-500" />;
      default:
        return <Zap className="w-6 h-6 text-gray-500" />;
    }
  };

  const aiUsagePercentage = Math.min(
    (subscription.aiUsageMonth / subscription.plan.aiQueriesLimit) * 100,
    100
  );

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'canceled':
        return 'secondary';
      case 'past_due':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl" data-testid="subscription-dashboard">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Subscription Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your ORION subscription, view usage, and billing information.
        </p>
      </div>

      {/* Status Alert */}
      {subscription.status === 'canceled' && (
        <Alert className="mb-6" data-testid="cancellation-alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Your subscription is cancelled and will end on {formatDate(subscription.currentPeriodEnd)}.
            You can reactivate it anytime before this date.
          </AlertDescription>
        </Alert>
      )}

      {subscription.status === 'past_due' && (
        <Alert variant="destructive" className="mb-6" data-testid="past-due-alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Your subscription payment is past due. Please update your payment method to continue service.
          </AlertDescription>
        </Alert>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 bg-muted p-1 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'billing', label: 'Billing', icon: CreditCard },
          { id: 'usage', label: 'Usage', icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-background shadow-sm'
                  : 'hover:bg-background/50'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* Current Plan Card */}
              <Card data-testid="current-plan-card">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-3">
                    {getPlanIcon(subscription.plan.name)}
                    <span>{subscription.plan.name} Plan</span>
                    <Badge variant={getStatusBadgeVariant(subscription.status)}>
                      {subscription.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {formatPrice(subscription.plan.price, subscription.plan.currency)}/month • 
                    Next billing: {formatDate(subscription.currentPeriodEnd)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">Plan Features</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        <li>{subscription.plan.aiQueriesLimit} AI queries/month</li>
                        <li>{subscription.plan.projectsLimit === -1 ? 'Unlimited' : subscription.plan.projectsLimit} projects</li>
                        <li>{subscription.plan.forcesLimit === -1 ? 'Unlimited' : `${subscription.plan.forcesLimit / 1000}K`} driving forces</li>
                        <li>{subscription.plan.usersLimit} users</li>
                        {subscription.plan.customReports && <li>Custom reports</li>}
                        {subscription.plan.apiAccess && <li>API access</li>}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Subscription Details</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Started:</span>
                          <span>{formatDate(subscription.currentPeriodStart)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Renews:</span>
                          <span>{formatDate(subscription.currentPeriodEnd)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Available Plans for Upgrade */}
              {plans && (
                <Card>
                  <CardHeader>
                    <CardTitle>Available Plans</CardTitle>
                    <CardDescription>
                      Upgrade or downgrade your plan anytime. Changes take effect immediately.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-3 gap-4">
                      {plans.map((plan) => {
                          const isCurrent = plan.id === subscription.planId;
                          return (
                            <div 
                              key={plan.id}
                              className={`p-4 border rounded-lg ${isCurrent ? 'border-primary bg-primary/5' : 'border-border'}`}
                            >
                              <div className="flex items-center space-x-2 mb-2">
                                {getPlanIcon(plan.name)}
                                <h4 className="font-medium">{plan.name}</h4>
                                {isCurrent && <Badge variant="outline">Current</Badge>}
                              </div>
                              <p className="text-2xl font-bold mb-1">
                                {formatPrice(plan.price, plan.currency)}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                              </p>
                              <p className="text-sm text-muted-foreground mb-3">
                                {plan.aiQueriesLimit} AI queries/month
                              </p>
                              <Button 
                                size="sm" 
                                variant={isCurrent ? "outline" : "default"}
                                className="w-full"
                                disabled={isCurrent}
                              >
                                {isCurrent ? "Current Plan" : "Change Plan"}
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {activeTab === 'billing' && (
            <>
              {/* Billing Information */}
              <Card data-testid="billing-info-card">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CreditCard className="w-5 h-5" />
                    <span>Billing Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Next Payment</p>
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(subscription.plan.price, subscription.plan.currency)} on {formatDate(subscription.currentPeriodEnd)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      <Settings className="w-4 h-4 mr-2" />
                      Manage Payment
                    </Button>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Subscription History</h4>
                    {history && history.length > 0 ? (
                      <div className="space-y-2">
                        {history.slice(0, 5).map((item) => (
                          <div key={item.id} className="flex justify-between items-center py-2 text-sm">
                            <div>
                              <p className="font-medium">{item.event}</p>
                              {item.fromTier && item.toTier && (
                                <p className="text-muted-foreground">
                                  {item.fromTier} → {item.toTier}
                                </p>
                              )}
                            </div>
                            <span className="text-muted-foreground">
                              {formatDate(item.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No billing history available.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === 'usage' && (
            <>
              {/* Usage Statistics */}
              <Card data-testid="usage-stats-card">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5" />
                    <span>Usage Statistics</span>
                  </CardTitle>
                  <CardDescription>
                    Your current usage for this billing period
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">AI Queries</span>
                      <span className="text-sm text-muted-foreground">
                        {subscription.aiUsageMonth} / {subscription.plan.aiQueriesLimit}
                      </span>
                    </div>
                    <Progress value={aiUsagePercentage} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {aiUsagePercentage.toFixed(1)}% used • Resets on {formatDate(subscription.currentPeriodEnd)}
                    </p>
                  </div>

                  {aiUsagePercentage > 80 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        You've used {aiUsagePercentage.toFixed(1)}% of your AI queries this month. 
                        Consider upgrading your plan to avoid interruptions.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card data-testid="quick-actions-card">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {subscription.status === 'canceled' ? (
                <Button 
                  onClick={() => reactivateSubscription.mutate()} 
                  disabled={reactivateSubscription.isPending}
                  className="w-full"
                  data-testid="btn-reactivate"
                >
                  {reactivateSubscription.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Reactivate Subscription
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => cancelSubscription.mutate()} 
                  disabled={cancelSubscription.isPending}
                  className="w-full"
                  data-testid="btn-cancel"
                >
                  {cancelSubscription.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Cancel Subscription
                </Button>
              )}
              
              <Button variant="outline" className="w-full" data-testid="btn-view-pricing">
                View All Plans
              </Button>
              
              <Button variant="outline" className="w-full" data-testid="btn-contact-support">
                Contact Support
              </Button>
            </CardContent>
          </Card>

          {/* Plan Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plan Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{subscription.plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={getStatusBadgeVariant(subscription.status)} className="text-xs">
                    {subscription.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">
                    {formatPrice(subscription.plan.price, subscription.plan.currency)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next Bill</span>
                  <span className="font-medium">{formatDate(subscription.currentPeriodEnd)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}