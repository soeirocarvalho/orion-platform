#!/usr/bin/env tsx

import { storage } from "../server/storage";
import type { InsertSubscriptionPlan } from "../shared/schema";

const subscriptionPlans: InsertSubscriptionPlan[] = [
  {
    tier: "basic",
    name: "Basic",
    description: "Strategic scanning with AI Assistant for individual users getting started with ORION",
    price: 999, // €9.99 in cents
    currency: "EUR", 
    stripePriceId: "price_basic_eur_monthly", // This will need to be replaced with actual Stripe price ID
    features: [
      "Strategic scanning and trend analysis",
      "AI Assistant for driving forces analysis",
      "Basic three-lens scanning (Megatrends, Trends, Weak Signals & Wildcards)",
      "Standard search and filtering",
      "Export capabilities (PDF, Excel)",
      "Email support"
    ],
    limits: {
      projects: 1,
      drivingForces: 1000,
      aiQueriesPerMonth: 50,
      users: 1,
      apiAccess: false,
      customReports: false,
      priority_support: false
    }
  },
  {
    tier: "professional",
    name: "Professional",
    description: "Full scanning capabilities and complete ORION Copilot for strategic professionals",
    price: 4900, // €49.00 in cents
    currency: "EUR",
    stripePriceId: "price_professional_eur_monthly", // This will need to be replaced with actual Stripe price ID
    features: [
      "All Basic features",
      "Full ORION Copilot - AI assistant for strategic planning and innovation guidance",
      "Complete strategic foresight toolkit with scenario planning",
      "AI-powered clustering - automatically groups related trends and forces",
      "Image analysis - upload documents, charts, and images for AI insights",
      "Smart search - finds similar trends using AI understanding",
      "Create custom future scenarios and wildcard events",
      "Priority email support"
    ],
    limits: {
      projects: 5,
      drivingForces: 10000,
      aiQueriesPerMonth: 500,
      users: 1,
      apiAccess: false,
      customReports: true,
      priority_support: true
    }
  },
  {
    tier: "enterprise",
    name: "Enterprise", 
    description: "Advanced features for teams with unlimited projects, API access, and dedicated support",
    price: 19900, // €199.00 in cents
    currency: "EUR",
    stripePriceId: "price_enterprise_eur_monthly", // This will need to be replaced with actual Stripe price ID
    features: [
      "All Professional features",
      "API access - integrate ORION data with your existing tools",
      "Custom branded reports with your organization's branding",
      "Advanced analytics dashboards with trend visualizations",
      "Team collaboration - share insights and build scenarios together",
      "White-label options - customize ORION with your brand",
      "Dedicated customer success manager for strategic guidance",
      "Priority phone and email support",
      "Custom training sessions and team onboarding"
    ],
    limits: {
      projects: -1, // Unlimited
      drivingForces: 100000,
      aiQueriesPerMonth: 5000,
      users: 4,
      apiAccess: true,
      customReports: true,
      priority_support: true
    }
  }
];

async function seedSubscriptionPlans() {
  console.log("🌱 Seeding subscription plans...");
  
  try {
    // Check if plans already exist
    const existingPlans = await storage.getSubscriptionPlans();
    
    if (existingPlans.length > 0) {
      console.log(`📋 Found ${existingPlans.length} existing subscription plans. Skipping seeding.`);
      return;
    }

    // Create each subscription plan
    for (const planData of subscriptionPlans) {
      const plan = await storage.createSubscriptionPlan(planData);
      console.log(`✅ Created ${plan.name} (${plan.tier}) - ${plan.currency} ${plan.price/100}`);
    }
    
    console.log("🎉 Successfully seeded all subscription plans!");
    
    // Display summary
    const allPlans = await storage.getSubscriptionPlans();
    console.log("\n📊 Subscription Plans Summary:");
    for (const plan of allPlans) {
      const price = plan.currency === "EUR" ? `€${plan.price/100}` : `$${plan.price/100}`;
      console.log(`  • ${plan.name} (${plan.tier}): ${price}/month`);
      console.log(`    Features: ${plan.features.length} features, ${plan.limits.projects === -1 ? 'Unlimited' : plan.limits.projects} projects`);
    }
    
  } catch (error) {
    console.error("❌ Error seeding subscription plans:", error);
    throw error;
  }
}

// Run the seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSubscriptionPlans()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedSubscriptionPlans };