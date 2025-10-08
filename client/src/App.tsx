import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { SubscriptionGuard } from "@/components/auth/SubscriptionGuard";
import { PAGE_ACCESS } from "@shared/schema";
import Welcome from "@/pages/Welcome";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import RequestPasswordReset from "@/pages/RequestPasswordReset";
import ResetSent from "@/pages/ResetSent";
import SetNewPassword from "@/pages/SetNewPassword";
import Projects from "@/pages/Projects";
import Scanning from "@/pages/Scanning";
import Analytics from "@/pages/Analytics";
import Reports from "@/pages/Reports";
import Chat from "@/pages/Chat";
import Pricing from "@/pages/Pricing";
import Subscribe from "@/pages/Subscribe";
import SubscriptionSuccess from "@/pages/SubscriptionSuccess";
import SubscriptionDashboard from "@/pages/SubscriptionDashboard";
import UserProfile from "@/pages/UserProfile";
import NotFound from "@/pages/not-found";
import { Sidebar } from "@/components/layout/Sidebar";

function Router() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const isWelcomePage = location === "/";
  const isAuthPage = location === "/login" || location === "/register" || location === "/reset-password" || location === "/reset-sent" || location.startsWith("/reset-password/");

  // Show auth pages without authentication check, but redirect if already authenticated
  if (isAuthPage) {
    // Redirect authenticated users away from auth pages
    if (isAuthenticated && !isLoading) {
      setLocation("/projects");
      return null;
    }
    
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/reset-password" component={RequestPasswordReset} />
        <Route path="/reset-sent" component={ResetSent} />
        <Route path="/reset-password/:token" component={SetNewPassword} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Show welcome page for unauthenticated users or loading state
  if (isLoading || !isAuthenticated) {
    return <Welcome />;
  }

  if (isWelcomePage) {
    // Redirect authenticated users to projects page from root
    setLocation("/projects");
    return null;
  }

  // Main app routes - with sidebar for authenticated users
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/projects" component={Projects} />
          <Route path="/scanning" component={Scanning} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/reports">
            <SubscriptionGuard requiredPage={PAGE_ACCESS.REPORTS}>
              <Reports />
            </SubscriptionGuard>
          </Route>
          <Route path="/chat">
            <SubscriptionGuard requiredPage={PAGE_ACCESS.COPILOT}>
              <Chat />
            </SubscriptionGuard>
          </Route>
          <Route path="/pricing" component={Pricing} />
          <Route path="/subscribe" component={Subscribe} />
          <Route path="/subscription/success" component={SubscriptionSuccess} />
          <Route path="/subscription/manage" component={SubscriptionDashboard} />
          <Route path="/profile" component={UserProfile} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;