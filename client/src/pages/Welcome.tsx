import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import orionLogo from "/orion_logo.png";

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      setLocation("/projects");
    } else {
      // Redirect to custom login page
      setLocation("/login");
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center font-['SF_Pro_Display','Helvetica_Neue',Arial,sans-serif] text-white">
      <div className="flex flex-col items-center text-center max-w-4xl px-6">
        {/* ORION Logo */}
        <div className="mb-2">
          <img
            src={orionLogo}
            alt="ORION Logo"
            className="w-36 h-36 object-contain rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
          />
        </div>

        {/* Main Title */}
        <h1 className="text-[62px] font-bold tracking-[0.7px] text-white mb-2 leading-tight">
          ORION
        </h1>

        {/* Subtitle */}
        <h2 className="text-[28px] font-light text-white/70 mb-8 max-w-[800px]">
          AI-powered Strategic Foresight & Innovation
        </h2>

        {/* Get Started Button */}
        <Button
          onClick={handleGetStarted}
          disabled={isLoading}
          className="bg-transparent border border-white/10 hover:bg-white/5 text-white font-semibold text-base px-8 py-3 rounded-[18px] transition-all duration-200 min-w-[200px]"
          data-testid="button-get-started"
        >
          {isLoading ? "Loading..." : isAuthenticated ? "Enter ORION" : "Sign In to Start"}
        </Button>
      </div>
    </div>
  );
}