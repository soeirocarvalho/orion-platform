/**
 * ORION Foresight & Innovation Platform - Constants
 * Exact color palette and design tokens from original ORION visualization system
 */

// Exact 50-color vibrant palette from original ORION visualization reference
// Maintains visual distinction and stability across 37 clusters
export const ORION_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57", 
  "#FF9FF3", "#54A0FF", "#5F27CD", "#00D2D3", "#FF9F43",
  "#EE5A24", "#009432", "#0652DD", "#9980FA", "#FDA7DF",
  "#D63031", "#74B9FF", "#A29BFE", "#6C5CE7", "#FD79A8",
  "#00B894", "#E17055", "#81ECEC", "#FDCB6E", "#E84393",
  "#00CEC9", "#55A3FF", "#FF7675", "#C44569", "#F8B500",
  "#3742FA", "#2F3542", "#FF3838", "#7BED9F", "#70A1FF",
  "#5352ED", "#FF4757", "#2ED573", "#1E90FF", "#FF6348",
  "#4834D4", "#686DE0", "#30336B", "#95E1D3", "#F8B195",
  "#F67280", "#C06C84", "#6C5B7B", "#355C7D", "#2C3E50"
];

// Legacy reference to maintain backward compatibility
export const CLUSTER_COLORS = ORION_COLORS;

/**
 * Apple Design System Constants
 * Original ORION dark theme colors and styling
 */
export const APPLE_DESIGN = {
  // Background colors
  BG: "#000000",
  PANEL: "#1c1c1e",
  ACCENT: "#2c2c2e",
  
  // Text colors  
  TEXT: "#ffffff",
  TEXT_SECONDARY: "#8e8e93",
  
  // Accent colors
  BLUE: "#007aff",
  
  // Typography
  FONT: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif"
} as const;

/**
 * ORION Brand & System Colors
 * Matching original design specifications
 */
export const ORION_BRAND_COLORS = {
  // Primary ORION brand colors
  primary: "#007AFF",
  primaryHover: "#0051D5", 
  secondary: "#34C759",
  warning: "#FF9500",
  danger: "#FF3B30",
  purple: "#AF52DE",
  
  // Apple system colors  
  systemBlue: "#007AFF",
  systemGreen: "#34C759",
  systemOrange: "#FF9500", 
  systemRed: "#FF3B30",
  systemPurple: "#AF52DE",
  systemTeal: "#5AC8FA",
  
  // Neutral colors
  textPrimary: "#1D1D1F",
  textSecondary: "#86868B", 
  textTertiary: "#C7C7CC",
  backgroundPrimary: "#FFFFFF",
  backgroundSecondary: "#F2F2F7",
  backgroundTertiary: "#FAFAFA",
  
  // Surfaces
  surfacePrimary: "rgba(255, 255, 255, 0.8)",
  surfaceSecondary: "rgba(242, 242, 247, 0.8)",
  surfaceElevated: "rgba(255, 255, 255, 0.95)"
} as const;

/**
 * ORION Design Theme Configuration
 * Complete design token system from original platform
 */
export const ORION_THEME = {
  // Colors from Apple theme
  colors: {
    bg: "#000000",
    panel: "#1c1c1e", 
    accent: "#2c2c2e",
    blue: "#007aff",
    text: "#ffffff",
    textSecondary: "#8e8e93"
  },
  
  // Shadows  
  shadows: {
    sm: "0 1px 3px rgba(0, 0, 0, 0.1)",
    md: "0 4px 6px rgba(0, 0, 0, 0.1)", 
    lg: "0 10px 25px rgba(0, 0, 0, 0.15)",
    xl: "0 20px 40px rgba(0, 0, 0, 0.2)",
    orion: "0 4px 24px rgba(0,0,0,0.18)" // Original ORION shadow
  },
  
  // Spacing
  spacing: {
    xs: "4px",
    sm: "8px", 
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px"
  },
  
  // Border radius
  radius: {
    sm: "6px",
    md: "12px",
    lg: "16px", 
    xl: "20px",
    pill: "50px",
    orion: "18px" // Original ORION radius
  },
  
  // Typography
  typography: {
    fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeights: {
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    }
  },
  
  // Plot configuration for visualization
  plotConfig: {
    displayModeBar: false,
    displaylogo: false,
    modeBarButtonsToRemove: ["pan2d", "lasso2d"],
    doubleClick: "reset"
  }
} as const;

/**
 * Get stable ORION color by cluster index (0-36)
 * Fixed mapping ensures consistent colors across sessions
 */
export function getOrionClusterColor(clusterIndex: number): string {
  // Ensure index is within bounds
  const safeIndex = Math.abs(clusterIndex) % ORION_COLORS.length;
  return ORION_COLORS[safeIndex];
}

/**
 * Get a stable color for a cluster based on its ID  
 * Uses deterministic hashing for consistent coloring across sessions
 */
export function getClusterColor(clusterId: string): string {
  // Simple hash function for consistent color assignment
  let hash = 0;
  for (let i = 0; i < clusterId.length; i++) {
    const char = clusterId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const colorIndex = Math.abs(hash) % ORION_COLORS.length;
  return ORION_COLORS[colorIndex];
}

/**
 * Get cluster color with alpha transparency
 */
export function getClusterColorWithAlpha(clusterId: string, alpha: number = 0.8): string {
  const color = getClusterColor(clusterId);
  
  // Convert hex to rgba
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Convert hex color to rgba string (utility from original ORION)
 */
export function hexToRgba(hexColor: string, alpha: number = 1.0): string {
  try {
    const hex = hexColor.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(150, 150, 150, ${alpha})`;
  } catch {
    return `rgba(150, 150, 150, ${alpha})`;
  }
}

/**
 * Generate a deterministic pseudo-random number from a seed string
 * Used for consistent positioning jitter
 */
export function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Convert to 0-1 range
  return Math.abs(hash) / 2147483647;
}

/**
 * Calculate positions for cluster centroids on a circle (2D) or sphere (3D)
 * Returns deterministic positions based on sorted cluster IDs
 */
export function calculateClusterCentroids(
  clusterIds: string[], 
  is3D: boolean = false, 
  radius: number = 300
): Array<{ x: number; y: number; z: number }> {
  // Sort cluster IDs for deterministic positioning
  const sortedIds = [...clusterIds].sort();
  const positions: Array<{ x: number; y: number; z: number }> = [];
  
  if (sortedIds.length === 0) return positions;
  
  if (is3D) {
    // Handle edge cases for small cluster counts to avoid division by zero
    if (sortedIds.length === 1) {
      // Single cluster at origin
      positions.push({ x: 0, y: 0, z: 0 });
    } else if (sortedIds.length === 2) {
      // Two clusters on opposite sides of Z axis
      positions.push({ x: 0, y: 0, z: radius });
      positions.push({ x: 0, y: 0, z: -radius });
    } else {
      // Distribute clusters on sphere using Fibonacci spiral
      const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // Golden angle in radians
      
      for (let i = 0; i < sortedIds.length; i++) {
        const y = 1 - (i / (sortedIds.length - 1)) * 2; // y goes from 1 to -1
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = goldenAngle * i;
        
        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;
        
        positions.push({
          x: x * radius,
          y: y * radius,
          z: z * radius
        });
      }
    }
  } else {
    // Handle edge cases for 2D mode
    if (sortedIds.length === 1) {
      // Single cluster at origin
      positions.push({ x: 0, y: 0, z: 0 });
    } else {
      // Distribute clusters evenly on circle
      for (let i = 0; i < sortedIds.length; i++) {
        const angle = (2 * Math.PI * i) / sortedIds.length;
        
        positions.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: 0
        });
      }
    }
  }
  
  return positions;
}

/**
 * Generate jittered position for a force within its cluster
 * Uses force impact and ID for deterministic positioning
 */
export function generateForceJitter(
  forceId: string,
  impact: number = 5,
  maxJitter: number = 80
): { x: number; y: number; z: number } {
  // Use force ID as seed for consistent positioning
  const random1 = seededRandom(forceId + "_x");
  const random2 = seededRandom(forceId + "_y");
  const random3 = seededRandom(forceId + "_z");
  
  // Scale jitter by impact (higher impact = less jitter, more central)
  const impactScale = Math.max(0.3, 1 - (impact / 10));
  const jitterRadius = maxJitter * impactScale;
  
  // Convert to polar/spherical coordinates for more natural distribution
  const angle = random1 * 2 * Math.PI;
  const distance = Math.sqrt(random2) * jitterRadius; // Square root for uniform distribution
  
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    z: (random3 - 0.5) * jitterRadius * 0.5 // Less z-axis variation
  };
}

/**
 * STEEP category colors (fallback for unclustered forces)
 */
export const STEEP_COLORS = {
  Social: "#FF6B6B",
  Technological: "#4ECDC4", 
  Economic: "#45B7D1",
  Environmental: "#96CEB4",
  Political: "#FECA57", // Updated to match ORION palette
  Other: "#FF9FF3"
} as const;

/**
 * Force type colors (original ORION system)
 */
export const FORCE_TYPE_COLORS = {
  M: "#FF6B6B",      // Megatrends - Red
  T: "#4ECDC4",      // Trends - Teal
  WS: "#45B7D1",     // Weak Signals - Blue
  WC: "#96CEB4",     // Wild Cards - Green
  S: "#FECA57"       // Other/Scenarios - Yellow
} as const;

/**
 * Driving Force color mapping for visualization
 * Used for node coloring based on driving force type
 */
export const DRIVING_FORCE_COLORS = {
  "megatrends": ORION_COLORS[0],    // #FF6B6B
  "trends": ORION_COLORS[1],        // #4ECDC4
  "weak signals": ORION_COLORS[2],  // #45B7D1
  "wildcards": ORION_COLORS[3],     // #96CEB4
  "signals": "rgba(120,120,120,0.96)" // Special grey for signals
} as const;