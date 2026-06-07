import { Loader2 } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export interface VoxScoreRadarPoint {
  dimension: string;
  label: string;
  score: number;
}

interface VoxScoreRadarChartProps {
  title: string;
  data: VoxScoreRadarPoint[];
  isLoading?: boolean;
  description?: string;
  testId: string;
}

const chartConfig = {
  score: {
    label: "VoxScore",
    color: "hsl(var(--primary))",
  },
};

export function VoxScoreRadarChart({
  title,
  data,
  isLoading = false,
  description,
  testId,
}: VoxScoreRadarChartProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[280px] flex items-center justify-center" data-testid={`${testId}-loading`}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
            No data yet / لا توجد بيانات بعد
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto h-[280px] w-full max-w-[420px]">
            <RadarChart data={data} outerRadius="72%">
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [`${Number(value).toFixed(0)}%`, "VoxScore"]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                  />
                }
              />
              <PolarGrid />
              <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="var(--color-score)"
                fill="var(--color-score)"
                fillOpacity={0.28}
              />
            </RadarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
