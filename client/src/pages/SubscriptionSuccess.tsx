import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  aiQueriesLimit: number;
}

interface UserSubscription {
  id: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: SubscriptionPlan;
}

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Extract session_id from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('session_id');
    setSessionId(id);
    
    // Clear the URL parameters after extracting what we need
    if (id) {
      window.history.replaceState({}, '', '/subscription/success');
    }
  }, []);

  // Get current subscription (will be refetched after successful payment)
  const { data: subscription, isLoading } = useQuery<UserSubscription>({
    queryKey: ["/api/v1/subscription/current"],
    enabled: !!sessionId, // Only fetch if we have a session ID
    refetchInterval: 2000, // Poll for updates
    refetchIntervalInBackground: true,
  });

  // Force refresh subscription cache
  useEffect(() => {
    if (sessionId) {
      // Invalidate subscription queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/v1/subscription"] });
    }
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Access</CardTitle>
            <CardDescription>
              This page can only be accessed after completing a subscription checkout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/pricing")} className="w-full">
              View Pricing Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !subscription) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Processing Your Subscription</h2>
          <p className="text-muted-foreground">
            Please wait while we set up your account...
          </p>
        </div>
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

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl" data-testid="subscription-success">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-6">
          <CheckCircle className="w-16 h-16 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Welcome to ORION {subscription.plan.name}!</h1>
        <p className="text-lg text-muted-foreground">
          Your subscription has been successfully activated.
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Subscription Details
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              subscription.status === 'active' 
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
            }`}>
              {subscription.status}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="font-medium">Plan</span>
            <span>{subscription.plan.name}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="font-medium">Price</span>
            <span>{formatPrice(subscription.plan.price, subscription.plan.currency)}/month</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="font-medium">AI Queries</span>
            <span>{subscription.plan.aiQueriesLimit} per month</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="font-medium">Current Period</span>
            <span>
              {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">What's Next?</h2>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <p className="font-medium">Start Using ORION AI</p>
              <p className="text-sm text-muted-foreground">
                Access our AI-powered strategic intelligence assistants for trend analysis and scenario planning.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <p className="font-medium">Explore Your Dashboard</p>
              <p className="text-sm text-muted-foreground">
                Create projects, scan for driving forces, and generate comprehensive strategic reports.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <p className="font-medium">Manage Your Subscription</p>
              <p className="text-sm text-muted-foreground">
                View billing history, update payment methods, and upgrade/downgrade your plan anytime.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button 
          onClick={() => setLocation("/projects")} 
          className="flex-1"
          data-testid="btn-get-started"
        >
          Get Started
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setLocation("/subscription/manage")}
          className="flex-1"
          data-testid="btn-manage-subscription"
        >
          Manage Subscription
        </Button>
      </div>
    </div>
  );
}