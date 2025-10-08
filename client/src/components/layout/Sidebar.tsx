import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { 
  Home, 
  FolderOpen, 
  Search, 
  BarChart3, 
  FileText, 
  MessageSquare,
  Activity,
  CreditCard,
  User,
  Settings,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const [location] = useLocation();
  
  const { data: jobStats } = useQuery({
    queryKey: ["/api/v1/jobs", "stats"],
    refetchInterval: 2000,
  });

  const runningJobs = (jobStats as any)?.running || 0;

  const navItems = [
    { href: "/", label: "Welcome", icon: Home },
    { href: "/projects", label: "Projects", icon: FolderOpen },
    { href: "/scanning", label: "Scanning", icon: Search },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/reports", label: "Reports", icon: FileText },
    { href: "/chat", label: "ORION Copilot", icon: MessageSquare },
    { href: "/pricing", label: "Pricing", icon: CreditCard },
    { href: "/subscription/manage", label: "Subscription", icon: Settings },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Logo & Brand */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 flex items-center justify-center">
            <img 
              src="/orion_logo.png" 
              alt="ORION Logo" 
              className="w-16 h-16 object-contain rounded-lg"
              data-testid="orion-logo"
            />
          </div>
          <div className="flex items-baseline space-x-2">
            <h1 className="text-3xl font-bold">ORION</h1>
            <span className="text-sm text-muted-foreground font-normal">beta</span>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "nav-item flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium",
                isActive ? "active" : ""
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      
      {/* Background Jobs section hidden per user request */}
      {/* <div className="p-4 border-t border-border">
        <div className="bg-muted rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Background Jobs</span>
            <span className="text-xs text-muted-foreground" data-testid="jobs-count">
              {runningJobs} running
            </span>
          </div>
          
          {runningJobs > 0 && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-primary rounded-full job-progress"></div>
                <span className="text-xs">Processing data...</span>
              </div>
            </div>
          )}
          
          {runningJobs === 0 && (
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">All jobs completed</span>
            </div>
          )}
        </div>
      </div> */}
      
      {/* Logout Button */}
      <div className="p-4 border-t border-border">
        <Button 
          variant="outline" 
          className="w-full justify-start" 
          onClick={() => {
            localStorage.removeItem("auth_token");
            window.location.href = "/login";
          }}
          data-testid="button-logout"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
