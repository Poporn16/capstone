export interface CategoryStyle {
  border: string
  bg: string
  badge: string
  borderHex: string
  dotColor: string
}

// Named category mappings for instant visual distinction
const NAMED_CATEGORY_STYLES: Record<string, CategoryStyle> = {
  electronics: {
    border: "border-2 border-amber-400 dark:border-amber-500/80 shadow-xs hover:border-amber-500 hover:shadow-md",
    bg: "bg-amber-50/20 dark:bg-slate-800",
    badge: "bg-amber-100 text-amber-800 border border-amber-300/80 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/60",
    borderHex: "#f59e0b",
    dotColor: "bg-amber-500"
  },
  pharmaceuticals: {
    border: "border-2 border-cyan-400 dark:border-cyan-500/80 shadow-xs hover:border-cyan-500 hover:shadow-md",
    bg: "bg-cyan-50/20 dark:bg-slate-800",
    badge: "bg-cyan-100 text-cyan-800 border border-cyan-300/80 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-700/60",
    borderHex: "#06b6d4",
    dotColor: "bg-cyan-500"
  },
  "household supplies": {
    border: "border-2 border-emerald-400 dark:border-emerald-500/80 shadow-xs hover:border-emerald-500 hover:shadow-md",
    bg: "bg-emerald-50/20 dark:bg-slate-800",
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-300/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700/60",
    borderHex: "#10b981",
    dotColor: "bg-emerald-500"
  },
  household: {
    border: "border-2 border-emerald-400 dark:border-emerald-500/80 shadow-xs hover:border-emerald-500 hover:shadow-md",
    bg: "bg-emerald-50/20 dark:bg-slate-800",
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-300/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700/60",
    borderHex: "#10b981",
    dotColor: "bg-emerald-500"
  },
  "office supplies": {
    border: "border-2 border-purple-400 dark:border-purple-500/80 shadow-xs hover:border-purple-500 hover:shadow-md",
    bg: "bg-purple-50/20 dark:bg-slate-800",
    badge: "bg-purple-100 text-purple-800 border border-purple-300/80 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700/60",
    borderHex: "#a855f7",
    dotColor: "bg-purple-500"
  },
  office: {
    border: "border-2 border-purple-400 dark:border-purple-500/80 shadow-xs hover:border-purple-500 hover:shadow-md",
    bg: "bg-purple-50/20 dark:bg-slate-800",
    badge: "bg-purple-100 text-purple-800 border border-purple-300/80 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700/60",
    borderHex: "#a855f7",
    dotColor: "bg-purple-500"
  },
  "personal care": {
    border: "border-2 border-rose-400 dark:border-rose-500/80 shadow-xs hover:border-rose-500 hover:shadow-md",
    bg: "bg-rose-50/20 dark:bg-slate-800",
    badge: "bg-rose-100 text-rose-800 border border-rose-300/80 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700/60",
    borderHex: "#f43f5e",
    dotColor: "bg-rose-500"
  },
  personal: {
    border: "border-2 border-rose-400 dark:border-rose-500/80 shadow-xs hover:border-rose-500 hover:shadow-md",
    bg: "bg-rose-50/20 dark:bg-slate-800",
    badge: "bg-rose-100 text-rose-800 border border-rose-300/80 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700/60",
    borderHex: "#f43f5e",
    dotColor: "bg-rose-500"
  },
  beverages: {
    border: "border-2 border-blue-400 dark:border-blue-500/80 shadow-xs hover:border-blue-500 hover:shadow-md",
    bg: "bg-blue-50/20 dark:bg-slate-800",
    badge: "bg-blue-100 text-blue-800 border border-blue-300/80 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700/60",
    borderHex: "#3b82f6",
    dotColor: "bg-blue-500"
  },
  groceries: {
    border: "border-2 border-teal-400 dark:border-teal-500/80 shadow-xs hover:border-teal-500 hover:shadow-md",
    bg: "bg-teal-50/20 dark:bg-slate-800",
    badge: "bg-teal-100 text-teal-800 border border-teal-300/80 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-700/60",
    borderHex: "#14b8a6",
    dotColor: "bg-teal-500"
  },
  "unmarked category": {
    border: "border-2 border-indigo-300 dark:border-indigo-500/80 shadow-xs hover:border-indigo-500 hover:shadow-md",
    bg: "bg-indigo-50/15 dark:bg-slate-800",
    badge: "bg-indigo-100 text-indigo-800 border border-indigo-300/80 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-700/60",
    borderHex: "#6366f1",
    dotColor: "bg-indigo-500"
  },
  general: {
    border: "border-2 border-indigo-300 dark:border-indigo-500/80 shadow-xs hover:border-indigo-500 hover:shadow-md",
    bg: "bg-indigo-50/15 dark:bg-slate-800",
    badge: "bg-indigo-100 text-indigo-800 border border-indigo-300/80 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-700/60",
    borderHex: "#6366f1",
    dotColor: "bg-indigo-500"
  }
}

// Curated distinct color palettes for dynamic/custom categories
const CATEGORY_PALETTES: CategoryStyle[] = [
  {
    border: "border-2 border-blue-400 dark:border-blue-500/80 shadow-xs hover:border-blue-500 hover:shadow-md",
    bg: "bg-blue-50/20 dark:bg-slate-800",
    badge: "bg-blue-100 text-blue-800 border border-blue-300/80 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700/60",
    borderHex: "#3b82f6",
    dotColor: "bg-blue-500"
  },
  {
    border: "border-2 border-emerald-400 dark:border-emerald-500/80 shadow-xs hover:border-emerald-500 hover:shadow-md",
    bg: "bg-emerald-50/20 dark:bg-slate-800",
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-300/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700/60",
    borderHex: "#10b981",
    dotColor: "bg-emerald-500"
  },
  {
    border: "border-2 border-amber-400 dark:border-amber-500/80 shadow-xs hover:border-amber-500 hover:shadow-md",
    bg: "bg-amber-50/20 dark:bg-slate-800",
    badge: "bg-amber-100 text-amber-800 border border-amber-300/80 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/60",
    borderHex: "#f59e0b",
    dotColor: "bg-amber-500"
  },
  {
    border: "border-2 border-purple-400 dark:border-purple-500/80 shadow-xs hover:border-purple-500 hover:shadow-md",
    bg: "bg-purple-50/20 dark:bg-slate-800",
    badge: "bg-purple-100 text-purple-800 border border-purple-300/80 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700/60",
    borderHex: "#a855f7",
    dotColor: "bg-purple-500"
  },
  {
    border: "border-2 border-cyan-400 dark:border-cyan-500/80 shadow-xs hover:border-cyan-500 hover:shadow-md",
    bg: "bg-cyan-50/20 dark:bg-slate-800",
    badge: "bg-cyan-100 text-cyan-800 border border-cyan-300/80 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-700/60",
    borderHex: "#06b6d4",
    dotColor: "bg-cyan-500"
  },
  {
    border: "border-2 border-rose-400 dark:border-rose-500/80 shadow-xs hover:border-rose-500 hover:shadow-md",
    bg: "bg-rose-50/20 dark:bg-slate-800",
    badge: "bg-rose-100 text-rose-800 border border-rose-300/80 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700/60",
    borderHex: "#f43f5e",
    dotColor: "bg-rose-500"
  },
  {
    border: "border-2 border-teal-400 dark:border-teal-500/80 shadow-xs hover:border-teal-500 hover:shadow-md",
    bg: "bg-teal-50/20 dark:bg-slate-800",
    badge: "bg-teal-100 text-teal-800 border border-teal-300/80 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-700/60",
    borderHex: "#14b8a6",
    dotColor: "bg-teal-500"
  },
  {
    border: "border-2 border-indigo-400 dark:border-indigo-500/80 shadow-xs hover:border-indigo-500 hover:shadow-md",
    bg: "bg-indigo-50/20 dark:bg-slate-800",
    badge: "bg-indigo-100 text-indigo-800 border border-indigo-300/80 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-700/60",
    borderHex: "#6366f1",
    dotColor: "bg-indigo-500"
  }
]

// Fallback for empty or unspecified category
const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  border: "border-2 border-slate-300 dark:border-slate-600 shadow-xs hover:border-slate-400 hover:shadow-md",
  bg: "bg-slate-50/30 dark:bg-slate-800",
  badge: "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  borderHex: "#64748b",
  dotColor: "bg-slate-400"
}

/**
 * Fast deterministic string hash function (djb2)
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Automatically assigns a vibrant, consistent color theme to any category name.
 */
export const getCategoryStyles = (categoryName: string = ""): CategoryStyle => {
  const cat = (categoryName || "").trim().toLowerCase()
  if (!cat) {
    return DEFAULT_CATEGORY_STYLE
  }

  // Exact named match if present
  if (NAMED_CATEGORY_STYLES[cat]) {
    return NAMED_CATEGORY_STYLES[cat]
  }

  const paletteIndex = hashString(cat) % CATEGORY_PALETTES.length
  return CATEGORY_PALETTES[paletteIndex]
}

