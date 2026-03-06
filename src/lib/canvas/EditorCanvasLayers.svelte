<!--
  EditorCanvasLayers.svelte - Editor-specific canvas overlays.

  Rendered inside WorkspaceCanvas when pageContext === 'editor'.
  Contains: WallDrawingLayer, RoomDrawingLayer, CandidateLocationMarker,
  ConstraintZoneRect, PlacementHintMarker, ChannelConflictOverlay,
  ScaleReferenceLine, door/window preview, hit-trace visualization.
-->
<script lang="ts">
  import { Line, Circle } from 'svelte-konva';
  import WallDrawingLayer from '$lib/canvas/WallDrawingLayer.svelte';
  import RoomDrawingLayer from '$lib/canvas/RoomDrawingLayer.svelte';
  import CandidateLocationMarker from '$lib/canvas/CandidateLocationMarker.svelte';
  import ConstraintZoneRect from '$lib/canvas/ConstraintZoneRect.svelte';
  import ScaleReferenceLine from '$lib/canvas/ScaleReferenceLine.svelte';
  import PlacementHintMarker from '$lib/components/editor/PlacementHintMarker.svelte';
  import ChannelConflictOverlay from '$lib/components/editor/ChannelConflictOverlay.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import { channelStore } from '$lib/stores/channelStore.svelte';
  import { workspaceStore, type DrawingLayerApi } from '$lib/stores/workspaceStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { projectPointOnSegment } from '$lib/editor/editorUtils';
  import type { PlacementHint, FloorBounds } from '$lib/heatmap';
  import type { Position } from '$lib/models/types';

  // ─── Props ──────────────────────────────────────────────────────

  interface EditorCanvasLayersProps {
    floor: NonNullable<typeof projectStore.activeFloor>;
    scalePxPerMeter: number;
    floorBounds: FloorBounds;
  }

  let { floor, scalePxPerMeter, floorBounds }: EditorCanvasLayersProps = $props();

  // ─── Internal State (component-local refs) ─────────────────────

  let wallDrawingLayer: WallDrawingLayer | undefined = $state();
  let roomDrawingLayer: RoomDrawingLayer | undefined = $state();

  // ─── Derived State ──────────────────────────────────────────────

  let mousePosition = $derived(workspaceStore.mousePosition);
  let doorWindowStart = $derived(workspaceStore.doorWindowStart);

  let wallMaterialId = $derived.by(() => {
    const tool = canvasStore.activeTool;
    if (tool === 'door') return 'mat-wood-door';
    if (tool === 'window') return 'mat-window';
    return canvasStore.selectedMaterialId ?? 'Q01';
  });

  let wallSnapTargets = $derived.by((): Position[] => {
    const walls = floor?.walls ?? [];
    const points: Position[] = [];
    for (const wall of walls) {
      for (const seg of wall.segments) {
        points.push(
          { x: seg.x1 * scalePxPerMeter, y: seg.y1 * scalePxPerMeter },
          { x: seg.x2 * scalePxPerMeter, y: seg.y2 * scalePxPerMeter },
        );
      }
    }
    return points;
  });

  let placementHints = $derived<PlacementHint[]>(editorHeatmapStore.stats?.placementHints ?? []);

  // Door/Window preview line
  interface DoorWindowPreview {
    x1: number; y1: number; x2: number; y2: number;
    type: 'door' | 'window';
  }

  let doorWindowPreview = $derived.by((): DoorWindowPreview | null => {
    if (!doorWindowStart || !mousePosition) return null;
    const tool = canvasStore.activeTool;
    if (tool !== 'door' && tool !== 'window') return null;

    const walls = floor?.walls ?? [];
    const wall = walls.find(w => w.id === doorWindowStart.wallId);
    if (!wall) return null;

    const sorted = wall.segments.slice().sort((a, b) => a.segment_order - b.segment_order);
    const seg = sorted[doorWindowStart.segIdx];
    if (!seg) return null;

    const mouseXM = mousePosition.x / scalePxPerMeter;
    const mouseYM = mousePosition.y / scalePxPerMeter;
    const proj = projectPointOnSegment(mouseXM, mouseYM, seg.x1, seg.y1, seg.x2, seg.y2);

    const tStart = Math.min(doorWindowStart.t, proj.t);
    const tEnd = Math.max(doorWindowStart.t, proj.t);
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;

    return {
      x1: (seg.x1 + dx * tStart) * scalePxPerMeter,
      y1: (seg.y1 + dy * tStart) * scalePxPerMeter,
      x2: (seg.x1 + dx * tEnd) * scalePxPerMeter,
      y2: (seg.y1 + dy * tEnd) * scalePxPerMeter,
      type: tool,
    };
  });

  // Hit-trace data for Point Inspector visualization
  interface HitTraceData {
    apX: number; apY: number;
    pointX: number; pointY: number;
    groups: Array<{
      x: number; y: number;
      color: string;
      action: string;
    }>;
  }

  function getMaterialHitColor(label: string): string {
    const l = label.toLowerCase();
    if (l.includes('door') || l.includes('tür') || l.includes('tuer')) return '#4caf50';
    if (l.includes('window') || l.includes('fenster') || l.includes('glass')) return '#2196f3';
    if (l.includes('drywall') || l.includes('gips') || l.includes('plasterboard')) return '#ffeb3b';
    if (l.includes('brick') || l.includes('concrete') || l.includes('beton') || l.includes('ziegel')) return '#ff4444';
    if (l.includes('wood') || l.includes('holz')) return '#ff9800';
    return '#ff9800';
  }

  let hitTraceData = $derived.by((): HitTraceData | null => {
    const result = workspaceStore.pointInspectorResult;
    const apId = workspaceStore.hitTraceApId;
    if (!result || !apId) return null;
    const apDebug = result.perAp.find((a) => a.apId === apId);
    if (!apDebug) return null;
    const apResp = floor?.access_points?.find((ap) => ap.id === apId);
    if (!apResp) return null;
    return {
      apX: apResp.x * scalePxPerMeter,
      apY: apResp.y * scalePxPerMeter,
      pointX: result.pointX * scalePxPerMeter,
      pointY: result.pointY * scalePxPerMeter,
      groups: apDebug.hitGroups.map((g) => ({
        x: g.representative.hitX * scalePxPerMeter,
        y: g.representative.hitY * scalePxPerMeter,
        color: getMaterialHitColor(g.representative.materialLabel),
        action: g.action,
      })),
    };
  });

  // ─── Register Drawing Layer APIs for editor page click routing ──

  $effect(() => {
    const wallApi: DrawingLayerApi | null = wallDrawingLayer
      ? {
          handleClick: (pos) => wallDrawingLayer!.handleClick(pos),
          handleDoubleClick: (pos) => wallDrawingLayer!.handleDoubleClick(pos),
        }
      : null;
    workspaceStore.setWallLayerApi(wallApi);
  });

  $effect(() => {
    const roomApi: DrawingLayerApi | null = roomDrawingLayer
      ? {
          handleClick: (pos) => roomDrawingLayer!.handleClick(pos),
          handleDoubleClick: (pos) => roomDrawingLayer!.handleDoubleClick(pos),
        }
      : null;
    workspaceStore.setRoomLayerApi(roomApi);
  });

  // Cleanup on destroy
  $effect(() => {
    return () => {
      workspaceStore.setWallLayerApi(null);
      workspaceStore.setRoomLayerApi(null);
    };
  });
</script>

<!-- Wall drawing layer (active when wall/door/window tool is selected) -->
<WallDrawingLayer
  bind:this={wallDrawingLayer}
  active={canvasStore.activeTool === 'wall' || canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window'}
  {scalePxPerMeter}
  stageScale={canvasStore.scale}
  snapTargets={wallSnapTargets}
  floorId={floor.id}
  materialId={wallMaterialId}
  mousePosition={mousePosition}
  onWallCreated={workspaceStore.editorCallbacks?.onWallCreated}
/>

<!-- Room drawing layer (closed polygon → multiple walls) -->
<RoomDrawingLayer
  bind:this={roomDrawingLayer}
  active={canvasStore.activeTool === 'room'}
  {scalePxPerMeter}
  stageScale={canvasStore.scale}
  snapTargets={wallSnapTargets}
  floorId={floor.id}
  materialId={wallMaterialId}
  mousePosition={mousePosition}
  onRoomCreated={workspaceStore.editorCallbacks?.onRoomCreated}
/>

<!-- Candidate location markers -->
{#each workspaceStore.candidates as cand (cand.id)}
  <CandidateLocationMarker
    candidate={cand}
    selected={canvasStore.isSelected(cand.id)}
    {scalePxPerMeter}
    draggable={canvasStore.activeTool === 'select'}
    interactive={canvasStore.activeTool === 'select'}
    onSelect={workspaceStore.editorCallbacks?.onItemSelect}
    onPositionChange={workspaceStore.editorCallbacks?.onCandidatePositionChange}
    onDelete={workspaceStore.editorCallbacks?.onCandidateDelete}
  />
{/each}

<!-- Constraint zone rectangles -->
{#each workspaceStore.constraintZones as zone (zone.id)}
  <ConstraintZoneRect
    {zone}
    selected={canvasStore.isSelected(zone.id)}
    {scalePxPerMeter}
    interactive={canvasStore.activeTool === 'select'}
    onSelect={workspaceStore.editorCallbacks?.onItemSelect}
    onPositionChange={workspaceStore.editorCallbacks?.onZonePositionChange}
    onResize={workspaceStore.editorCallbacks?.onZoneResize}
    onDelete={workspaceStore.editorCallbacks?.onZoneDelete}
  />
{/each}

<!-- Placement hint markers (visible when heatmap is active) -->
{#if editorHeatmapStore.visible && placementHints.length > 0}
  <PlacementHintMarker
    hints={placementHints}
    {scalePxPerMeter}
  />
{/if}

<!-- Channel conflict overlay lines -->
{#if channelStore.overlayVisible && channelStore.analysis}
  <ChannelConflictOverlay
    conflicts={channelStore.analysis.conflicts}
    accessPoints={floor.access_points ?? []}
    {scalePxPerMeter}
    visible={channelStore.overlayVisible}
  />
{/if}

<!-- Persistent scale reference line (visible after calibration) -->
{#if workspaceStore.confirmedScalePoints.length === 2 && workspaceStore.confirmedScaleDistanceM !== null}
  <ScaleReferenceLine
    points={workspaceStore.confirmedScalePoints}
    distanceM={workspaceStore.confirmedScaleDistanceM}
  />
{/if}

<!-- Door/Window 2-click preview -->
{#if doorWindowStart}
  <!-- Start point marker -->
  <Circle
    x={doorWindowStart.x * scalePxPerMeter}
    y={doorWindowStart.y * scalePxPerMeter}
    radius={5}
    fill={canvasStore.activeTool === 'door' ? '#8B6914' : '#64B5F6'}
    stroke="#ffffff"
    strokeWidth={2}
    listening={false}
  />
  <!-- Preview line from start to current mouse position -->
  {#if doorWindowPreview}
    <Line
      points={[doorWindowPreview.x1, doorWindowPreview.y1, doorWindowPreview.x2, doorWindowPreview.y2]}
      stroke={doorWindowPreview.type === 'door' ? '#8B6914' : '#64B5F6'}
      strokeWidth={6}
      dash={doorWindowPreview.type === 'door' ? [6, 4] : [2, 3]}
      opacity={0.7}
      lineCap="butt"
      listening={false}
    />
  {/if}
{/if}

<!-- Hit-trace visualization (Point Inspector ray from AP to point) -->
{#if hitTraceData}
  <Line
    points={[hitTraceData.apX, hitTraceData.apY, hitTraceData.pointX, hitTraceData.pointY]}
    stroke="rgba(255, 255, 100, 0.5)"
    strokeWidth={2}
    dash={[6, 3]}
    listening={false}
  />
  {#each hitTraceData.groups as group}
    {#if group.action === 'same_barrier_merged'}
      <Circle
        x={group.x}
        y={group.y}
        radius={8}
        fill="transparent"
        stroke="#ffeb3b"
        strokeWidth={1.5}
        listening={false}
      />
    {:else if group.action === 'opening_replaced_wall'}
      <Circle
        x={group.x}
        y={group.y}
        radius={8}
        fill="transparent"
        stroke="#4caf50"
        strokeWidth={1.5}
        listening={false}
      />
    {/if}
    <Circle
      x={group.x}
      y={group.y}
      radius={5}
      fill={group.color}
      stroke="#ffffff"
      strokeWidth={1.5}
      listening={false}
    />
  {/each}
  <!-- AP end marker -->
  <Circle
    x={hitTraceData.apX}
    y={hitTraceData.apY}
    radius={5}
    fill="#4caf50"
    stroke="#ffffff"
    strokeWidth={2}
    listening={false}
  />
  <!-- Point end marker -->
  <Circle
    x={hitTraceData.pointX}
    y={hitTraceData.pointY}
    radius={5}
    fill="#2196f3"
    stroke="#ffffff"
    strokeWidth={2}
    listening={false}
  />
{/if}
