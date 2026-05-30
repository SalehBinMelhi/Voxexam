import {
  VOX_DIMENSION_WEIGHTS,
  VOX_PASS_THRESHOLD,
  type VoxDimension,
  type VoxBand,
  type VoxDimensionScore,
} from "@shared/schema";

type ColorSet = { text: string; bg: string; border: string; dot: string };

// Band label derived from the 0–100 total score.
export function voxTotalBandLabel(total: number): string {
  if (total >= 90) return "Exemplary";
  if (total >= 75) return "Proficient";
  if (total >= 60) return "Developing";
  if (total >= 40) return "Limited";
  return "Inadequate";
}

// Color set derived from the 0–100 total score.
export function voxTotalBandColor(total: number): ColorSet {
  if (total >= 90)
    return {
      text: "text-green-700 dark:text-green-400",
      bg: "bg-green-100 dark:bg-green-900/30",
      border: "border-green-200 dark:border-green-800",
      dot: "bg-green-500",
    };
  if (total >= 75)
    return {
      text: "text-blue-700 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-900/30",
      border: "border-blue-200 dark:border-blue-800",
      dot: "bg-blue-500",
    };
  if (total >= 60)
    return {
      text: "text-yellow-700 dark:text-yellow-400",
      bg: "bg-yellow-100 dark:bg-yellow-900/30",
      border: "border-yellow-200 dark:border-yellow-800",
      dot: "bg-yellow-500",
    };
  if (total >= 40)
    return {
      text: "text-orange-700 dark:text-orange-400",
      bg: "bg-orange-100 dark:bg-orange-900/30",
      border: "border-orange-200 dark:border-orange-800",
      dot: "bg-orange-500",
    };
  return {
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
  };
}

const BAND_LABELS: Record<VoxBand, string> = {
  1: "Inadequate",
  2: "Limited",
  3: "Developing",
  4: "Proficient",
  5: "Exemplary",
};

// Label for a per-dimension band (1–5).
export function voxBandLabel(band: VoxBand): string {
  return BAND_LABELS[band] ?? "—";
}

// Color set for a per-dimension band (1–5).
export function voxBandColor(band: VoxBand): ColorSet {
  switch (band) {
    case 5:
      return {
        text: "text-green-700 dark:text-green-400",
        bg: "bg-green-100 dark:bg-green-900/30",
        border: "border-green-200 dark:border-green-800",
        dot: "bg-green-500",
      };
    case 4:
      return {
        text: "text-blue-700 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-900/30",
        border: "border-blue-200 dark:border-blue-800",
        dot: "bg-blue-500",
      };
    case 3:
      return {
        text: "text-yellow-700 dark:text-yellow-400",
        bg: "bg-yellow-100 dark:bg-yellow-900/30",
        border: "border-yellow-200 dark:border-yellow-800",
        dot: "bg-yellow-500",
      };
    case 2:
      return {
        text: "text-orange-700 dark:text-orange-400",
        bg: "bg-orange-100 dark:bg-orange-900/30",
        border: "border-orange-200 dark:border-orange-800",
        dot: "bg-orange-500",
      };
    default:
      return {
        text: "text-red-700 dark:text-red-400",
        bg: "bg-red-100 dark:bg-red-900/30",
        border: "border-red-200 dark:border-red-800",
        dot: "bg-red-500",
      };
  }
}

// Friendly, student-facing dimension names.
const FRIENDLY_NAMES: Record<VoxDimension, string> = {
  D1: "Subject Knowledge",
  D2: "Reasoning",
  D3: "Evidence & Examples",
  D4: "Responsiveness",
  D5: "Organization",
  D6: "Communication",
  D7: "Professionalism",
};

export function voxFriendlyName(dimension: VoxDimension): string {
  return FRIENDLY_NAMES[dimension] ?? dimension;
}

// Professor-facing label: code + name (e.g. "D1 Subject Knowledge").
export function voxProfessorName(dimension: VoxDimension): string {
  return `${dimension} ${FRIENDLY_NAMES[dimension] ?? ""}`.trim();
}

// Weight (as a percentage 0–100) for a dimension.
export function voxWeightPercent(dimension: VoxDimension): number {
  return Math.round((VOX_DIMENSION_WEIGHTS[dimension] ?? 0) * 100);
}

// Maximum possible weighted contribution for a dimension (= weight as 0–100 points).
export function voxMaxContribution(dimension: VoxDimension): number {
  return (VOX_DIMENSION_WEIGHTS[dimension] ?? 0) * 100;
}

// Normalized 0–1 performance for a dimension: weightedScore relative to its max
// possible contribution. This removes the weight bias so that "strongest" reflects
// how well the student did on the dimension, not how heavily it is weighted.
export function voxNormalizedScore(dim: VoxDimensionScore): number {
  const max = voxMaxContribution(dim.dimension);
  return max > 0 ? dim.weightedScore / max : 0;
}

// Dimensions in canonical D1…D7 order.
export function voxOrderedDimensions(dimensions: VoxDimensionScore[]): VoxDimensionScore[] {
  return [...dimensions].sort((a, b) => a.dimension.localeCompare(b.dimension));
}

// Dimensions sorted strongest → weakest by normalized weighted score.
// Ties broken by raw weightedScore, then dimension code, for determinism.
export function voxStrongest(dimensions: VoxDimensionScore[], count: number): VoxDimensionScore[] {
  return [...dimensions]
    .sort(
      (a, b) =>
        voxNormalizedScore(b) - voxNormalizedScore(a) ||
        b.weightedScore - a.weightedScore ||
        a.dimension.localeCompare(b.dimension),
    )
    .slice(0, count);
}

// Dimensions sorted weakest → strongest by normalized weighted score.
// Ties broken by raw weightedScore, then dimension code, for determinism.
export function voxWeakest(dimensions: VoxDimensionScore[], count: number): VoxDimensionScore[] {
  return [...dimensions]
    .sort(
      (a, b) =>
        voxNormalizedScore(a) - voxNormalizedScore(b) ||
        a.weightedScore - b.weightedScore ||
        a.dimension.localeCompare(b.dimension),
    )
    .slice(0, count);
}

export const VOX_FORMULA_LINE =
  "VoxScore = sum of (band score × dimension weight × 100). Pass threshold: 60/100.";

export { VOX_PASS_THRESHOLD };
