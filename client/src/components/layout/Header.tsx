import { Button } from "@/components/ui/button";
import { RefreshCw, Plus } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onImport?: () => void;
  onRefresh?: () => void;
}

export function Header({ title, subtitle, onImport, onRefresh }: HeaderProps) {
  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="page-header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="page-title">{title}</h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground" data-testid="page-subtitle">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {onImport && (
            <Button 
              onClick={onImport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="button-import"
            >
              <Plus className="w-4 h-4 mr-2" />
              Import Data
            </Button>
          )}
          
          {onRefresh && (
            <Button 
              variant="secondary"
              onClick={onRefresh}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
