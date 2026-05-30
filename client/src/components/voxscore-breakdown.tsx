import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Gauge, TrendingUp, TrendingDown } from "lucide-react";
import type { VoxScoreProfile } from "@shared/schema";
import type { VoxDimension } from "@shared/schema";
import {
  voxTotalBandLabel,
  voxTotalBandColor,
  voxBandLabel,
  voxBandColor,
  voxFriendlyName,
  voxProfessorName,
  voxWeightPercent,
  voxMaxContribution,
  voxOrderedDimensions,
  voxStrongest,
  voxWeakest,
  VOX_FORMULA_LINE,
} from "@/lib/voxscore";

// ---------------------------------------------------------------------------
// Professor-facing VoxScore strip + breakdown table
// ---------------------------------------------------------------------------

export function ProfessorVoxScore({
  profile,
  open,
  onToggle,
  onViewEvidence,
  testId,
}: {
  profile: VoxScoreProfile;
  open: boolean;
  onToggle: () => void;
  onViewEvidence: (dimension: VoxDimension) => void;
  testId: string;
}) {
  const total = Math.round(profile.totalScore);
  const totalColor = voxTotalBandColor(profile.totalScore);
  const totalLabel = voxTotalBandLabel(profile.totalScore);
  const strongest = voxStrongest(profile.dimensions, 1)[0];
  const weakest = voxWeakest(profile.dimensions, 1)[0];
  const ordered = voxOrderedDimensions(profile.dimensions);

  return (
    <div
      className={`mt-4 rounded-md border ${totalColor.border} ${totalColor.bg} p-3 space-y-3`}
      data-testid={`voxscore-section-${testId}`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Gauge className={`h-4 w-4 ${totalColor.text}`} />
            <span className="text-xs font-semibold">VoxScore</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-bold ${totalColor.text}`} data-testid={`text-voxscore-total-${testId}`}>
              {total}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${totalColor.bg} ${totalColor.text} border ${totalColor.border}`}
            data-testid={`badge-voxscore-band-${testId}`}
          >
            {totalLabel}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px]"
          onClick={onToggle}
          data-testid={`button-voxscore-toggle-${testId}`}
        >
          {open ? "Hide breakdown" : "View breakdown"}
          {open ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
        </Button>
      </div>

      {strongest && weakest && (
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
            <TrendingUp className="h-3 w-3" />
            Strongest: {voxProfessorName(strongest.dimension)}
          </span>
          <span className="flex items-center gap-1 text-red-700 dark:text-red-400">
            <TrendingDown className="h-3 w-3" />
            Weakest: {voxProfessorName(weakest.dimension)}
          </span>
        </div>
      )}

      {open && (
        <div className="space-y-2" data-testid={`voxscore-table-${testId}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-muted-foreground text-left border-b">
                  <th className="py-1 pr-2 font-medium">Dimension</th>
                  <th className="py-1 px-2 font-medium">Weight</th>
                  <th className="py-1 px-2 font-medium">Band</th>
                  <th className="py-1 px-2 font-medium">Contribution</th>
                  <th className="py-1 pl-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((dim) => {
                  const c = voxBandColor(dim.band);
                  return (
                    <tr key={dim.dimension} className="border-b last:border-0 align-top" data-testid={`voxscore-row-${dim.dimension}-${testId}`}>
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{voxProfessorName(dim.dimension)}</td>
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{voxWeightPercent(dim.dimension)}%</td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${c.bg} ${c.text} border ${c.border}`}>
                          {dim.band} {voxBandLabel(dim.band)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                        {dim.weightedScore.toFixed(1)}/{voxMaxContribution(dim.dimension)}
                      </td>
                      <td className="py-1.5 pl-2 text-muted-foreground min-w-[160px]">
                        <span>{dim.evidence || <span className="italic">No rationale provided</span>}</span>
                        <button
                          type="button"
                          className="ml-1 text-primary underline whitespace-nowrap hover:no-underline"
                          onClick={() => onViewEvidence(dim.dimension)}
                          data-testid={`button-voxscore-evidence-${dim.dimension}-${testId}`}
                        >
                          View evidence
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground italic">{VOX_FORMULA_LINE}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student-facing VoxScore summary (simplified, no internal detail)
// ---------------------------------------------------------------------------

export function StudentVoxScore({ profile }: { profile: VoxScoreProfile }) {
  const [showAll, setShowAll] = useState(false);
  const total = Math.round(profile.totalScore);
  const totalColor = voxTotalBandColor(profile.totalScore);
  const totalLabel = voxTotalBandLabel(profile.totalScore);
  const strengths = voxStrongest(profile.dimensions, 2);
  const focus = voxWeakest(profile.dimensions, 2);
  const ordered = voxOrderedDimensions(profile.dimensions);

  return (
    <div className="space-y-3" data-testid="student-voxscore-section">
      <h4 className="font-medium text-sm">VoxScore</h4>

      <div className={`rounded-md border ${totalColor.border} ${totalColor.bg} p-3 flex items-center justify-between`}>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold ${totalColor.text}`} data-testid="text-student-voxscore-total">
            {total}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${totalColor.bg} ${totalColor.text} border ${totalColor.border}`}
          data-testid="badge-student-voxscore-band"
        >
          {totalLabel}
        </span>
      </div>

      {strengths.length > 0 && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-2 space-y-1">
          <p className="text-xs font-medium text-green-700 dark:text-green-400">Strongest areas</p>
          <div className="flex flex-wrap gap-1.5">
            {strengths.map((dim) => (
              <span
                key={dim.dimension}
                className="px-2 py-0.5 rounded-full text-[11px] bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300"
                data-testid={`chip-student-strength-${dim.dimension}`}
              >
                {voxFriendlyName(dim.dimension)}
              </span>
            ))}
          </div>
        </div>
      )}

      {focus.length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Focus next</p>
          {focus.map((dim) => (
            <div key={dim.dimension} data-testid={`tip-student-focus-${dim.dimension}`}>
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">{voxFriendlyName(dim.dimension)}</p>
              {dim.evidence && <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">{dim.evidence}</p>}
            </div>
          ))}
        </div>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-0 text-xs"
        onClick={() => setShowAll((v) => !v)}
        data-testid="button-student-voxscore-toggle"
      >
        {showAll ? "Hide full breakdown" : "View full breakdown"}
        {showAll ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
      </Button>

      {showAll && (
        <div className="space-y-1" data-testid="student-voxscore-breakdown">
          {ordered.map((dim) => {
            const c = voxBandColor(dim.band);
            return (
              <div
                key={dim.dimension}
                className="flex items-center justify-between rounded-md border p-2"
                data-testid={`student-voxscore-row-${dim.dimension}`}
              >
                <span className="text-xs">{voxFriendlyName(dim.dimension)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text} border ${c.border}`}>
                  {voxBandLabel(dim.band)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
