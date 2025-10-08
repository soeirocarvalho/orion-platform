import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Check, Crown, Zap, Building2 } from "lucide-react";

interface SubscriptionPlan {
  id: string;
  tier: string;
  name: string;
  stripePriceId: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  aiQueriesLimit: number;
  projectsLimit: number;
  forcesLimit: number;
  usersLimit: number;
  apiAccess: boolean;
  customReports: boolean;
  priority: number;
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

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Get subscription plans
  const { data: plans, isLoading: plansLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/v1/subscription/plans"],
  });

  // Get current user's subscription
  const { data: subscription } = useQuery<UserSubscription>({
    queryKey: ["/api/v1/subscription/current"],
    enabled: !!user,
  });

  // Create checkout session mutation
  const createCheckout = useMutation({
    mutationFn: async ({ planId, successUrl, cancelUrl }: { 
      planId: string; 
      successUrl: string; 
      cancelUrl: string; 
    }) => {
      const res = await apiRequest('POST', `/api/v1/subscription/checkout`, { planId, successUrl, cancelUrl });
      const data = await res.json();
      return data;
    },
    onSuccess: (data: { url: string }) => {
      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
      console.error("Checkout error:", error);
    },
  });

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to subscribe to a plan.",
        variant: "destructive",
      });
      return;
    }

    const successUrl = `${window.location.origin}/subscription/success`;
    const cancelUrl = `${window.location.origin}/pricing`;

    createCheckout.mutate({ planId, successUrl, cancelUrl });
  };

  const getPlanIcon = (tier: string) => {
    switch (tier) {
      case 'basic':
        return <Zap className="w-8 h-8 text-blue-500" />;
      case 'professional':
        return <Crown className="w-8 h-8 text-purple-500" />;
      case 'enterprise':
        return <Building2 className="w-8 h-8 text-orange-500" />;
      default:
        return <Zap className="w-8 h-8 text-gray-500" />;
    }
  };

  const isCurrentPlan = (planId: string) => {
    return subscription?.planId === planId && subscription?.status === 'active';
  };

  if (plansLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading pricing plans...</span>
      </div>
    );
  }

  const sortedPlans = plans?.sort((a, b) => a.priority - b.priority) || [];

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl" data-testid="pricing-page">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Choose Your Strategic Intelligence Plan
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
          Unlock the power of ORION's strategic foresight capabilities with AI-powered scanning, 
          trend analysis, and scenario planning for your organization's future.
        </p>

        {/* Annual/Monthly Toggle */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          <span className={isAnnual ? "text-muted-foreground" : "font-medium"}>
            Monthly
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative"
            data-testid="billing-toggle"
          >
            <div className={`w-12 h-6 rounded-full transition-colors ${
              isAnnual ? 'bg-primary' : 'bg-muted'
            }`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                isAnnual ? 'translate-x-6' : 'translate-x-0.5'
              } mt-0.5`} />
            </div>
          </Button>
          <span className={isAnnual ? "font-medium" : "text-muted-foreground"}>
            Annual
            <Badge variant="secondary" className="ml-2">Save 20%</Badge>
          </span>
        </div>
      </div>

      {/* Current Subscription Status */}
      {subscription && (
        <div className="mb-8 p-4 bg-muted rounded-lg" data-testid="current-subscription">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Current Plan: {subscription.plan.name}</h3>
              <p className="text-sm text-muted-foreground">
                Status: {subscription.status} • 
                AI Queries: {subscription.aiUsageMonth}/{subscription.plan.aiQueriesLimit} this month
              </p>
            </div>
            <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
              {subscription.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-12">
        {sortedPlans.map((plan) => {
          const isPopular = plan.tier === 'professional';
          const currentPlan = isCurrentPlan(plan.id);
          const annualPrice = isAnnual ? Math.round(plan.price * 12 * 0.8) : null;
          const monthlyPrice = isAnnual && annualPrice ? Math.round(annualPrice / 12) : plan.price;

          return (
            <Card 
              key={plan.id} 
              className={`relative ${isPopular ? 'border-primary shadow-lg scale-105' : ''} ${
                currentPlan ? 'border-green-500' : ''
              }`}
              data-testid={`plan-card-${plan.tier}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                </div>
              )}
              
              {currentPlan && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="outline" className="border-green-500 text-green-600">
                    Current Plan
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  {getPlanIcon(plan.tier)}
                </div>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription className="text-sm">
                  {plan.tier === 'basic' && (
                    <>
                      Perfect for individual strategists starting their foresight journey with curated driving forces
                      <br />
                      <span className="text-xs text-muted-foreground italic">
                        Includes: 2.8K curated forces + Scanning Assistant • AI Queries: Scanning Assistant only (50/month) • Perfect for: Independent consultants, startup founders, or small nonprofits
                      </span>
                    </>
                  )}
                  {plan.tier === 'professional' && (
                    <>
                      Ideal for growing organizations needing comprehensive strategic intelligence with full AI capabilities
                      <br />
                      <span className="text-xs text-muted-foreground italic">
                        Includes: All forces (29.7K) + ORION Copilot + Scanning Assistant • AI Queries: Both assistants (500/month) • Perfect for: Innovation managers, R&D teams, strategy consultants
                      </span>
                    </>
                  )}
                  {plan.tier === 'enterprise' && (
                    <>
                      Built for large organizations requiring advanced features and multi-user collaboration
                      <br />
                      <span className="text-xs text-muted-foreground italic">
                        Includes: Full dataset + all AI assistants + team features • AI Queries: All assistants (5000/month) • Perfect for: Fortune 500 companies, government agencies, research institutions
                      </span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="text-center pb-4">
                <div className="mb-6">
                  <div className="flex items-baseline justify-center">
                    <span className="text-4xl font-bold">
                      {plan.currency === 'EUR' ? '€' : '$'}{(monthlyPrice / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  {isAnnual && annualPrice && (
                    <div className="text-sm text-muted-foreground mt-1">
                      Billed annually ({plan.currency === 'EUR' ? '€' : '$'}{(annualPrice / 100).toFixed(2)}/year)
                      <Badge variant="outline" className="ml-2">20% off</Badge>
                    </div>
                  )}
                </div>

                {/* Key Limits */}
                <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AI Queries:</span>
                      <span className="font-medium">{plan.aiQueriesLimit}/month</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Projects:</span>
                      <span className="font-medium">{plan.projectsLimit === -1 ? 'Unlimited' : plan.projectsLimit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Forces:</span>
                      <span className="font-medium">{plan.forcesLimit === -1 ? 'Unlimited' : `${plan.forcesLimit / 1000}K`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Users:</span>
                      <span className="font-medium">{plan.usersLimit}</span>
                    </div>
                  </div>
                </div>

                {/* Features List */}
                <ul className="space-y-2 text-left">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-4">
                <Button
                  className={`w-full ${isPopular ? 'bg-primary hover:bg-primary/90' : ''}`}
                  variant={isPopular ? "default" : "outline"}
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={createCheckout.isPending || currentPlan}
                  data-testid={`subscribe-btn-${plan.tier}`}
                >
                  {createCheckout.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {currentPlan 
                    ? "Current Plan" 
                    : createCheckout.isPending 
                      ? "Processing..." 
                      : `Get ${plan.name}`
                  }
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-2">What's the difference between curated and non-curated forces?</h3>
            <p className="text-muted-foreground mb-4">
              Curated forces (2.8K) are professionally analyzed Megatrends, Trends, Weak Signals, and Wildcards. 
              Non-curated forces (27K) are additional signals and emerging patterns for comprehensive analysis.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">What are AI queries?</h3>
            <p className="text-muted-foreground mb-4">
              AI queries are interactions with ORION AI assistants. Basic plan includes Scanning Assistant only. 
              Professional and Enterprise include both Scanning Assistant and ORION Copilot. Each message counts as one query.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Can I upgrade or downgrade anytime?</h3>
            <p className="text-muted-foreground mb-4">
              Yes, you can change your plan at any time. Upgrades take effect immediately, 
              while downgrades take effect at the end of your current billing period.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Is there a free trial?</h3>
            <p className="text-muted-foreground mb-4">
              New users get complimentary access to explore ORION's features. 
              Contact us for extended trial periods for Enterprise plans.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}