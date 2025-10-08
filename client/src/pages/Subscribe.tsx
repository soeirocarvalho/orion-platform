import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface SubscribePageProps {
  planId: string;
  planTier: string;
  planName: string;
  planPrice: number;
  planFeatures: string[];
}

const CheckoutForm = ({ planId, planTier, planName, planPrice, planFeatures }: SubscribePageProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    try {
      // Redirect to Stripe Checkout instead of using Payment Element
      // This is simpler and more reliable for subscription payments
      const response = await apiRequest('POST', '/api/subscription/create-checkout-session', {
        planId,
        successUrl: `${window.location.origin}/subscription/success`,
        cancelUrl: `${window.location.origin}/pricing`
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
      
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast({
        title: "Payment Setup Failed",
        description: error.message || "Unable to start subscription process. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost" 
          onClick={() => setLocation('/pricing')}
          className="mb-6"
          data-testid="button-back-pricing"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Pricing
        </Button>

        <Card className="border border-border/50">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-2">
              <Badge variant="secondary" className="px-3 py-1 text-xs">
                {planTier.toUpperCase()}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold" data-testid="text-plan-name">
              Subscribe to {planName}
            </CardTitle>
            <p className="text-3xl font-bold text-primary mt-2" data-testid="text-plan-price">
              ${(planPrice / 100).toFixed(0)}<span className="text-lg text-muted-foreground">/month</span>
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Plan Features */}
            <div>
              <h3 className="font-semibold mb-3">What's included:</h3>
              <ul className="space-y-2">
                {planFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Checkout Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="p-4 border border-border/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  You'll be redirected to Stripe's secure checkout to complete your subscription.
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={!stripe || isLoading}
                data-testid="button-subscribe"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Subscribe to ${planName}`
                )}
              </Button>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              Your subscription will automatically renew monthly. You can cancel anytime from your account settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default function Subscribe() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [, setLocationPath] = useLocation();
  
  // Parse plan information from URL query parameters
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const planId = searchParams.get('planId');
  const planTier = searchParams.get('tier') || 'professional';
  const planName = searchParams.get('name') || 'Professional Plan';
  const planPrice = parseInt(searchParams.get('price') || '2900'); // Default to $29 in cents
  const planFeatures = searchParams.get('features')?.split(',') || [
    'Full access to Reports and Analytics',
    'ORION Copilot AI Assistant',
    'Advanced scanning capabilities',
    'Priority customer support'
  ];

  useEffect(() => {
    if (!user) {
      setLocationPath('/');
      return;
    }
    
    if (!planId) {
      setLocationPath('/pricing');
      return;
    }
  }, [user, planId, setLocationPath]);

  if (!user || !planId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm 
        planId={planId}
        planTier={planTier}
        planName={planName}
        planPrice={planPrice}
        planFeatures={planFeatures}
      />
    </Elements>
  );
}