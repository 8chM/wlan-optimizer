<!--
  MeasurementPoints.svelte - Konva markers for measurement points on the canvas.

  Features:
  - Each point is a shape + label text with RSSI value
  - Color coding by quality: good=green, fair=amber, poor=orange, failed=red, pending=gray
  - Different shapes per run: Circle=Run1, RegularPolygon(3)=Run2, Rect=Run3
  - Click handler to show detail
  - Uses svelte-konva with flat props (NOT config={})
-->
<script lang="ts">
  import { Group, Circle, Rect, RegularPolygon, Text } from 'svelte-konva';
  import type { KonvaMouseEvent } from 'svelte-konva';
  import type { MeasurementPointResponse, MeasurementResponse } from '$lib/api/invoke';

  // ─── Props ─────────────────────────────────────────────────────

  interface MeasurementPointsProps {
    /** Measurement points to display */
    points: MeasurementPointResponse[];
    /** Measurements for the active run (to determine quality/color) */
    measurements: MeasurementResponse[];
    /** Scale: pixels per meter */
    scalePxPerMeter: number;
    /** Active run ID to determine shape */
    activeRunId: string | null;
    /** Run number for shape selection (1=circle, 2=triangle, 3=square) */
    activeRunNumber: number;
    /** Whether interaction is enabled */
    interactive?: boolean;
    /** Callback when a point is clicked */
    onPointClick?: (pointId: string) => void;
  }

  let {
    points,
    measurements,
    scalePxPerMeter = 50,
    activeRunId = null,
    activeRunNumber = 1,
    interactive = true,
    onPointClick,
  }: MeasurementPointsProps = $props();

  // ─── Constants ────────────────────────────────────────────────

  const QUALITY_COLORS: Record<string, string> = {
    good: '#22c55e',
    fair: '#f59e0b',
    poor: '#f97316',
    failed: '#ef4444',
  };

  const PENDING_COLOR = '#6b7280';
  const MARKER_RADIUS = 8;

  // ─── Derived ──────────────────────────────────────────────────

  /** Pre-built lookup map: point_id → measurement for the active run (O(1) access). */
  let measurementByPoint = $derived.by(() => {
    const map = new Map<string, MeasurementResponse>();
    if (!activeRunId) return map;
    for (const m of measurements) {
      if (m.measurement_run_id === activeRunId) {
        map.set(m.measurement_point_id, m);
      }
    }
    return map;
  });

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Gets the quality color for a measurement point based on
   * the latest measurement at that point for the active run.
   */
  function getQualityColor(point: MeasurementPointResponse): string {
    const measurement = measurementByPoint.get(point.id);
    if (!measurement) return PENDING_COLOR;
    return QUALITY_COLORS[measurement.quality] ?? PENDING_COLOR;
  }

  /**
   * Gets the RSSI display text for a point.
   */
  function getRssiText(point: MeasurementPointResponse): string {
    const measurement = measurementByPoint.get(point.id);
    if (!measurement || measurement.rssi_dbm === null) return '';
    return `${measurement.rssi_dbm}`;
  }

  function handlePointClick(pointId: string, event: KonvaMouseEvent): void {
    event.cancelBubble = true;
    onPointClick?.(pointId);
  }
</script>

{#each points as point (point.id)}
  {@const posX = point.x * scalePxPerMeter}
  {@const posY = point.y * scalePxPerMeter}
  {@const color = getQualityColor(point)}
  {@const rssi = getRssiText(point)}

  <Group
    x={posX}
    y={posY}
    listening={interactive}
    onclick={(e: KonvaMouseEvent) => handlePointClick(point.id, e)}
  >
    <!-- Shape based on run number -->
    {#if activeRunNumber === 2}
      <!-- Triangle for Run 2 -->
      <RegularPolygon
        x={0}
        y={0}
        sides={3}
        radius={MARKER_RADIUS}
        fill={color}
        stroke="#ffffff"
        strokeWidth={1.5}
        listening={false}
      />
    {:else if activeRunNumber === 3}
      <!-- Square for Run 3 -->
      <Rect
        x={-MARKER_RADIUS + 2}
        y={-MARKER_RADIUS + 2}
        width={MARKER_RADIUS * 2 - 4}
        height={MARKER_RADIUS * 2 - 4}
        fill={color}
        stroke="#ffffff"
        strokeWidth={1.5}
        cornerRadius={2}
        listening={false}
      />
    {:else}
      <!-- Circle for Run 1 (default) -->
      <Circle
        x={0}
        y={0}
        radius={MARKER_RADIUS}
        fill={color}
        stroke="#ffffff"
        strokeWidth={1.5}
        listening={false}
      />
    {/if}

    <!-- Label: point name -->
    <Text
      x={-20}
      y={MARKER_RADIUS + 3}
      width={40}
      text={point.label}
      fontSize={9}
      fontFamily="-apple-system, sans-serif"
      fill="#e0e0f0"
      align="center"
      listening={false}
    />

    <!-- RSSI value (if measured) -->
    {#if rssi}
      <Text
        x={-20}
        y={-(MARKER_RADIUS + 12)}
        width={40}
        text={rssi}
        fontSize={9}
        fontFamily="SF Mono, Fira Code, monospace"
        fill={color}
        align="center"
        fontStyle="bold"
        listening={false}
      />
    {/if}
  </Group>
{/each}
