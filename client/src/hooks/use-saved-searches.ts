import { useState, useEffect, useCallback } from 'react';
import type { SearchQuery } from '@shared/schema';

export interface SavedSearch {
  id: string;
  name: string;
  query: SearchQuery;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'orion-saved-searches';

export function useSavedSearches(projectId: string) {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allSearches: SavedSearch[] = JSON.parse(stored);
        const projectSearches = allSearches.filter(search => search.projectId === projectId);
        setSavedSearches(projectSearches);
      }
    } catch (error) {
      console.error('Failed to load saved searches:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Save searches to localStorage
  const persistSearches = useCallback((searches: SavedSearch[]) => {
    try {
      // Get all searches from localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      const allSearches: SavedSearch[] = stored ? JSON.parse(stored) : [];
      
      // Remove existing searches for this project
      const otherSearches = allSearches.filter(search => search.projectId !== projectId);
      
      // Combine with new searches for this project
      const updatedSearches = [...otherSearches, ...searches];
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSearches));
      setSavedSearches(searches);
    } catch (error) {
      console.error('Failed to save searches:', error);
      throw error;
    }
  }, [projectId]);

  // Save a new search
  const saveSearch = useCallback((name: string, query: SearchQuery) => {
    const newSearch: SavedSearch = {
      id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      query: { ...query },
      projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedSearches = [...savedSearches, newSearch];
    persistSearches(updatedSearches);
    return newSearch;
  }, [savedSearches, projectId, persistSearches]);

  // Update an existing search
  const updateSearch = useCallback((id: string, updates: { name?: string; query?: SearchQuery }) => {
    const updatedSearches = savedSearches.map(search => {
      if (search.id === id) {
        return {
          ...search,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      }
      return search;
    });
    
    persistSearches(updatedSearches);
    return updatedSearches.find(s => s.id === id);
  }, [savedSearches, persistSearches]);

  // Delete a search
  const deleteSearch = useCallback((id: string) => {
    const updatedSearches = savedSearches.filter(search => search.id !== id);
    persistSearches(updatedSearches);
  }, [savedSearches, persistSearches]);

  // Check if a search exists with the same query
  const findSimilarSearch = useCallback((query: SearchQuery) => {
    return savedSearches.find(search => {
      // Compare key search properties
      return (
        search.query.q === query.q &&
        JSON.stringify(search.query.steep?.sort()) === JSON.stringify(query.steep?.sort()) &&
        JSON.stringify(search.query.types?.sort()) === JSON.stringify(query.types?.sort()) &&
        JSON.stringify(search.query.sentiments?.sort()) === JSON.stringify(query.sentiments?.sort()) &&
        search.query.impactMin === query.impactMin &&
        search.query.impactMax === query.impactMax &&
        JSON.stringify(search.query.tags?.sort()) === JSON.stringify(query.tags?.sort())
      );
    });
  }, [savedSearches]);

  return {
    savedSearches,
    isLoading,
    saveSearch,
    updateSearch,
    deleteSearch,
    findSimilarSearch,
  };
}