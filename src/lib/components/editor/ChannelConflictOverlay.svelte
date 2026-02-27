<!--
  ChannelConflictOverlay.svelte - Konva layer showing channel conflict lines between APs.

  Renders connection lines between APs with channel conflicts:
  - Red lines for co-channel interference
  - Orange lines for adjacent-channel interference
  - Line thickness proportional to conflict score
-->
<script lang="ts">
  import { Line, Text, Rect } from 'svelte-konva';
  import type { ChannelConflict } from '$lib/heatmap/channel-analysis';
  import type { AccessPointResponse } from '$lib/api/invoke';

  interface ChannelConflictOverlayProps {
    conflicts: ChannelConflict[];
    accessPoints: AccessPointResponse[];
    scalePxPerMeter: number;
    visible?: boolean;
  }

  let {
    conflicts,
    accessPoints,
    scalePxPerMeter,
    visible = true,
  }: ChannelConflictOverlayProps = $props();

  interface ConflictLine {
    points: number[];
    stroke: string;
    strokeWidth: number;
    label: string;
    labelX: number;
    labelY: number;
  }

  let conflictLines = $derived.by((): ConflictLine[] => {
    if (!visible) return [];

    const apMap = new Map(accessPoints.map((ap) => [ap.id, ap]));

    return conflicts.map((conflict): ConflictLine | null => {
      const ap1 = apMap.get(conflict.ap1Id);
      const ap2 = apMap.get(conflict.ap2Id);
      if (!ap1 || !ap2) return null;

      const x1 = ap1.x * scalePxPerMeter;
      const y1 = ap1.y * scalePxPerMeter;
      const x2 = ap2.x * scalePxPerMeter;
      const y2 = ap2.y * scalePxPerMeter;

      const stroke = conflict.type === 'co-channel' ? '#ef4444' : '#f97316';
      const strokeWidth = Math.max(1, conflict.score * 4);

      return {
        points: [x1, y1, x2, y2],
        stroke,
        strokeWidth,
        label: `CH ${conflict.channel1}↔${conflict.channel2}`,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 10,
      };
    }).filter((line): line is ConflictLine => line !== null);
  });
</script>

{#if visible}
  {#each conflictLines as line, i (i)}
    <Line
      points={line.points}
      stroke={line.stroke}
      strokeWidth={line.strokeWidth}
      dash={[8, 4]}
      opacity={0.7}
      listening={false}
    />
    <!-- Conflict label at midpoint -->
    <Rect
      x={line.labelX - 30}
      y={line.labelY - 2}
      width={60}
      height={14}
      fill="rgba(0, 0, 0, 0.7)"
      cornerRadius={3}
      listening={false}
    />
    <Text
      x={line.labelX - 30}
      y={line.labelY}
      width={60}
      text={line.label}
      fontSize={9}
      fontFamily="-apple-system, sans-serif"
      fill={line.stroke}
      align="center"
      listening={false}
    />
  {/each}
{/if}
