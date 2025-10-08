import { create } from "zustand";
import { persist } from "zustand/middleware";

// Global application state
interface AppState {
  // Current project selection
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // UI state
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Theme
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  // Forces view mode
  viewMode: "curated" | "all";
  setViewMode: (mode: "curated" | "all") => void;

  // Job notifications
  jobNotifications: JobNotification[];
  addJobNotification: (notification: JobNotification) => void;
  removeJobNotification: (id: string) => void;
  clearJobNotifications: () => void;

  // Filter states for different views
  scanningFilters: ScanningFilters;
  setScanningFilters: (filters: Partial<ScanningFilters>) => void;
  resetScanningFilters: () => void;

  // Chat history
  chatHistory: ChatSession[];
  addChatSession: (session: ChatSession) => void;
  updateChatSession: (id: string, session: Partial<ChatSession>) => void;
  clearChatHistory: () => void;

  // ORION Copilot integration mode
  isOrionCopilotProjectModeActive: boolean;
  setOrionCopilotProjectMode: (active: boolean) => void;
  orionCopilotThreadId: string | null;
  setOrionCopilotThreadId: (threadId: string | null) => void;

  // Force selection state - stored as array for persistence, exposed as Set for efficient lookups
  selectedForces: string[];
  toggleForceSelection: (forceId: string) => void;
  selectForces: (forceIds: string[], mode: 'add' | 'remove' | 'replace') => void;
  clearSelection: () => void;
  isForceSelected: (forceId: string) => boolean;
}

interface JobNotification {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
  timestamp: Date;
  actionUrl?: string;
}

// Enhanced scanning filters that support advanced search capabilities
interface ScanningFilters {
  // Search text with operators
  search: string;
  
  // Force types (enhanced from lens)
  types: string[]; // ["M", "T", "WS", "WC", "S"]
  
  // Dimensions for filtering
  dimensions: string[];
  
  // STEEP categories (enhanced to array)
  steep: string[]; // ["Social", "Technological", "Economic", "Environmental", "Political"]
  
  // Sentiments (enhanced to array)
  sentiments: string[]; // ["Positive", "Negative", "Neutral"]
  
  // Tags for filtering
  tags: string[];
  
  // Impact range
  impactRange: [number, number];
  
  // Sort options
  sort: string; // "relevance", "impact", "created_at", etc.
  
  // Legacy fields for backward compatibility
  lens: "megatrends" | "trends" | "weak_signals" | "all";
  timeHorizon: string;
  sentimentFilter: string; // Legacy single sentiment
}

interface ChatSession {
  id: string;
  projectId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: any;
}

const defaultScanningFilters: ScanningFilters = {
  // Advanced search fields
  search: "",
  types: ["M", "T", "WS", "WC"], // Default to curated forces only (exclude "S")
  dimensions: [], // Empty array means no dimension filter - show all dimensions
  steep: [], // No STEEP filter by default
  sentiments: [], // No sentiment filter by default
  tags: [],
  impactRange: [1, 10] as [number, number],
  sort: "relevance",
  
  // Legacy fields for backward compatibility
  lens: "all",
  timeHorizon: "all",
  sentimentFilter: "all",
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Project state - will be set dynamically based on available projects
      currentProjectId: null,
      setCurrentProjectId: (id) => set((state) => ({
        currentProjectId: id,
        // Reset scanning filters when switching projects to prevent persisted searches
        scanningFilters: defaultScanningFilters,
        // Clear selected forces when switching projects 
        selectedForces: [],
        // Reset ORION Copilot mode and thread when switching projects to prevent cross-project bleed
        isOrionCopilotProjectModeActive: false,
        orionCopilotThreadId: null
      })),

      // UI state
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      // Theme
      theme: "dark",
      setTheme: (theme) => {
        set({ theme });
        
        // Apply theme to document
        const root = document.documentElement;
        if (theme === "dark") {
          root.classList.add("dark");
          root.classList.remove("light");
        } else if (theme === "light") {
          root.classList.add("light");
          root.classList.remove("dark");
        } else {
          // System theme
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          root.classList.toggle("dark", prefersDark);
          root.classList.toggle("light", !prefersDark);
        }
      },

      // Forces view mode
      viewMode: "curated",
      setViewMode: (mode) => set({ viewMode: mode }),

      // Job notifications
      jobNotifications: [],
      addJobNotification: (notification) =>
        set((state) => ({
          jobNotifications: [notification, ...state.jobNotifications].slice(0, 10), // Keep only last 10
        })),
      removeJobNotification: (id) =>
        set((state) => ({
          jobNotifications: state.jobNotifications.filter((n) => n.id !== id),
        })),
      clearJobNotifications: () => set({ jobNotifications: [] }),

      // Scanning filters
      scanningFilters: defaultScanningFilters,
      setScanningFilters: (filters) =>
        set((state) => ({
          scanningFilters: { ...state.scanningFilters, ...filters },
        })),
      resetScanningFilters: () => set({ scanningFilters: defaultScanningFilters }),

      // Chat history
      chatHistory: [],
      addChatSession: (session) =>
        set((state) => ({
          chatHistory: [session, ...state.chatHistory],
        })),
      updateChatSession: (id, updates) =>
        set((state) => ({
          chatHistory: state.chatHistory.map((session) =>
            session.id === id ? { ...session, ...updates, updatedAt: new Date() } : session
          ),
        })),
      clearChatHistory: () => set({ chatHistory: [] }),

      // ORION Copilot integration mode
      isOrionCopilotProjectModeActive: false,
      setOrionCopilotProjectMode: (active) => set({ isOrionCopilotProjectModeActive: active }),
      orionCopilotThreadId: null,
      setOrionCopilotThreadId: (threadId) => set({ orionCopilotThreadId: threadId }),

      // Force selection - stored as array for JSON serialization, but logic handles like Set
      selectedForces: [],
      toggleForceSelection: (forceId) =>
        set((state) => {
          const selectedSet = new Set(state.selectedForces);
          if (selectedSet.has(forceId)) {
            selectedSet.delete(forceId);
          } else {
            selectedSet.add(forceId);
          }
          return { selectedForces: Array.from(selectedSet) };
        }),
      selectForces: (forceIds, mode) =>
        set((state) => {
          console.log('[Store] selectForces called:', { mode, count: forceIds.length, currentSelection: state.selectedForces.length });
          
          const selectedSet = new Set(state.selectedForces);
          let newSelection: string[];
          
          if (mode === 'replace') {
            newSelection = [...forceIds];
          } else if (mode === 'add') {
            forceIds.forEach(id => selectedSet.add(id));
            newSelection = Array.from(selectedSet);
          } else if (mode === 'remove') {
            forceIds.forEach(id => selectedSet.delete(id));
            newSelection = Array.from(selectedSet);
          } else {
            newSelection = Array.from(selectedSet);
          }
          
          console.log('[Store] New selection:', { newCount: newSelection.length, sampleIds: newSelection.slice(0, 3) });
          
          // Force persistence by creating a new state object
          const newState = { selectedForces: newSelection };
          
          // Debug persistence
          setTimeout(() => {
            const persistedState = localStorage.getItem('orion-app-state');
            if (persistedState) {
              const parsed = JSON.parse(persistedState);
              console.log('[Store] Persistence check:', { 
                persistedCount: parsed.state?.selectedForces?.length || 0,
                expectedCount: newSelection.length 
              });
            }
          }, 500);
          
          return newState;
        }),
      clearSelection: () => set({ selectedForces: [] }),
      isForceSelected: (forceId) => get().selectedForces.includes(forceId),
    }),
    {
      name: "orion-app-state",
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        viewMode: state.viewMode,
        scanningFilters: state.scanningFilters,
        chatHistory: state.chatHistory,
        selectedForces: state.selectedForces, // Now persistable as array
        isOrionCopilotProjectModeActive: state.isOrionCopilotProjectModeActive,
        orionCopilotThreadId: state.orionCopilotThreadId,
      }),
    }
  )
);

// Selectors for common state patterns
export const useCurrentProject = () => useAppStore((state) => state.currentProjectId);
export const useTheme = () => useAppStore((state) => state.theme);
export const useViewMode = () => useAppStore((state) => state.viewMode);
export const useScanningFilters = () => useAppStore((state) => state.scanningFilters);
export const useJobNotifications = () => useAppStore((state) => state.jobNotifications);
export const useSelectedForces = () => useAppStore((state) => new Set(state.selectedForces));
export const useChatHistory = (projectId?: string) =>
  useAppStore((state) => 
    projectId 
      ? state.chatHistory.filter((session) => session.projectId === projectId)
      : state.chatHistory
  );

// ORION Copilot selectors
export const useOrionCopilotProjectMode = () => useAppStore((state) => state.isOrionCopilotProjectModeActive);
export const useOrionCopilotThreadId = () => useAppStore((state) => state.orionCopilotThreadId);

// Actions
export const useAppActions = () => {
  const store = useAppStore();
  return {
    setCurrentProject: store.setCurrentProjectId,
    toggleSidebar: () => store.setSidebarCollapsed(!store.sidebarCollapsed),
    setTheme: store.setTheme,
    setViewMode: store.setViewMode,
    addJobNotification: store.addJobNotification,
    removeJobNotification: store.removeJobNotification,
    setScanningFilters: store.setScanningFilters,
    resetScanningFilters: store.resetScanningFilters,
    addChatSession: store.addChatSession,
    updateChatSession: store.updateChatSession,
    toggleForceSelection: store.toggleForceSelection,
    selectForces: store.selectForces,
    clearSelection: store.clearSelection,
    setOrionCopilotProjectMode: store.setOrionCopilotProjectMode,
    setOrionCopilotThreadId: store.setOrionCopilotThreadId,
  };
};

// Initialize theme on app load
if (typeof window !== "undefined") {
  const theme = useAppStore.getState().theme;
  useAppStore.getState().setTheme(theme);
}
