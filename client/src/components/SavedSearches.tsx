import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Search, MoreVertical, Trash2, Edit2, Clock, Star } from 'lucide-react';
import { useSavedSearches, type SavedSearch } from '@/hooks/use-saved-searches';
import type { SearchQuery } from '@shared/schema';

interface SavedSearchesProps {
  projectId: string;
  currentQuery: SearchQuery;
  onLoadSearch: (search: SavedSearch) => void;
  compact?: boolean;
}

export const SavedSearches: React.FC<SavedSearchesProps> = ({
  projectId,
  currentQuery,
  onLoadSearch,
  compact = false
}) => {
  const { savedSearches, saveSearch, updateSearch, deleteSearch, findSimilarSearch } = useSavedSearches(projectId);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);

  // Check if current query has unsaved changes
  const similarSearch = findSimilarSearch(currentQuery);
  const hasUnsavedChanges = !similarSearch && (
    currentQuery.q ||
    currentQuery.steep?.length ||
    currentQuery.types?.length ||
    currentQuery.sentiments?.length ||
    currentQuery.impactMin !== 1 ||
    currentQuery.impactMax !== 10 ||
    currentQuery.tags?.length
  );

  const handleSaveSearch = () => {
    if (!searchName.trim()) return;

    try {
      if (editingSearch) {
        updateSearch(editingSearch.id, { 
          name: searchName.trim(),
          query: currentQuery 
        });
        setEditingSearch(null);
      } else {
        saveSearch(searchName.trim(), currentQuery);
      }
      
      setSearchName('');
      setSaveDialogOpen(false);
    } catch (error) {
      console.error('Failed to save search:', error);
    }
  };

  const handleEditSearch = (search: SavedSearch) => {
    setEditingSearch(search);
    setSearchName(search.name);
    setSaveDialogOpen(true);
  };

  const handleDeleteSearch = (search: SavedSearch) => {
    if (confirm(`Delete saved search "${search.name}"?`)) {
      deleteSearch(search.id);
    }
  };

  const formatSearchSummary = (query: SearchQuery) => {
    const parts: string[] = [];
    
    if (query.q) parts.push(`"${query.q}"`);
    if (query.steep?.length) parts.push(`${query.steep.length} categories`);
    if (query.types?.length) parts.push(`${query.types.length} types`);
    if (query.tags?.length) parts.push(`${query.tags.length} tags`);
    if (query.impactMin !== 1 || query.impactMax !== 10) {
      parts.push(`impact ${query.impactMin}-${query.impactMax}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'No filters';
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        {hasUnsavedChanges && (
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-save-search">
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Search</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="search-name">Search Name</Label>
                  <Input
                    id="search-name"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    placeholder="Enter search name..."
                    data-testid="input-search-name"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  <strong>Filters:</strong> {formatSearchSummary(currentQuery)}
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveSearch}
                    disabled={!searchName.trim()}
                    data-testid="button-confirm-save"
                  >
                    Save Search
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {savedSearches.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-load-search">
                <Search className="h-4 w-4 mr-1" />
                Saved ({savedSearches.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="p-2 text-sm font-medium">Saved Searches</div>
              <DropdownMenuSeparator />
              <ScrollArea className="max-h-64">
                {savedSearches.map((search) => (
                  <DropdownMenuItem
                    key={search.id}
                    className="flex items-center justify-between p-3 cursor-pointer"
                    onClick={() => onLoadSearch(search)}
                    data-testid={`saved-search-${search.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{search.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatSearchSummary(search.query)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(search.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleEditSearch(search);
                        }}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSearch(search);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </DropdownMenuItem>
                ))}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Saved Searches
          </div>
          {hasUnsavedChanges && (
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-save-current-search">
                  <Save className="h-4 w-4 mr-1" />
                  Save Current
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingSearch ? 'Update Search' : 'Save Search'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="search-name-full">Search Name</Label>
                    <Input
                      id="search-name-full"
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      placeholder="Enter search name..."
                      data-testid="input-full-search-name"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <strong>Current Filters:</strong>
                    <div className="mt-1 p-2 bg-muted rounded text-xs">
                      {formatSearchSummary(currentQuery)}
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => {
                      setSaveDialogOpen(false);
                      setEditingSearch(null);
                      setSearchName('');
                    }}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSaveSearch}
                      disabled={!searchName.trim()}
                      data-testid="button-confirm-full-save"
                    >
                      {editingSearch ? 'Update' : 'Save'} Search
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {savedSearches.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No saved searches</p>
            <p className="text-sm">Apply filters and save your search to reuse it later</p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedSearches.map((search) => (
              <Card 
                key={search.id} 
                className="cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => onLoadSearch(search)}
                data-testid={`full-saved-search-${search.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-sm truncate">{search.name}</h4>
                        {similarSearch?.id === search.id && (
                          <Badge variant="outline" className="text-xs">
                            <Star className="h-3 w-3 mr-1" />
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {formatSearchSummary(search.query)}
                      </p>
                      <div className="flex items-center text-xs text-muted-foreground mt-2">
                        <Clock className="h-3 w-3 mr-1" />
                        Updated {new Date(search.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleEditSearch(search);
                        }}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSearch(search);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};