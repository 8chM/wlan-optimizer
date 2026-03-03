<!--
  TextAnnotation.svelte - Room label / text annotation on the canvas.

  Renders a Konva Text with a background rect. Draggable.
  Double-click to edit. RF-neutral (no effect on heatmap).
-->
<script lang="ts">
  import { Group, Text, Rect } from 'svelte-konva';
  import type { KonvaMouseEvent, KonvaDragTransformEvent } from 'svelte-konva';

  export interface AnnotationData {
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
  }

  interface TextAnnotationProps {
    annotation: AnnotationData;
    scalePxPerMeter: number;
    selected?: boolean;
    /** Whether the annotation can be dragged (false = read-only) */
    draggable?: boolean;
    onSelect?: (id: string) => void;
    onPositionChange?: (id: string, x: number, y: number) => void;
    onEdit?: (id: string) => void;
  }

  let {
    annotation,
    scalePxPerMeter,
    selected = false,
    draggable = true,
    onSelect,
    onPositionChange,
    onEdit,
  }: TextAnnotationProps = $props();

  let posX = $derived(annotation.x * scalePxPerMeter);
  let posY = $derived(annotation.y * scalePxPerMeter);

  // Estimate text width for background rect
  let textWidth = $derived(Math.max(annotation.text.length * annotation.fontSize * 0.6, 40));
  let textHeight = $derived(annotation.fontSize + 8);

  function handleClick(event: KonvaMouseEvent): void {
    event.cancelBubble = true;
    onSelect?.(annotation.id);
  }

  function handleDblClick(event: KonvaMouseEvent): void {
    event.cancelBubble = true;
    onEdit?.(annotation.id);
  }

  function handleDragEnd(event: KonvaDragTransformEvent): void {
    const node = event.target;
    const newX = node.x() / scalePxPerMeter;
    const newY = node.y() / scalePxPerMeter;
    onPositionChange?.(annotation.id, newX, newY);
  }
</script>

<Group
  x={posX}
  y={posY}
  {draggable}
  dragDistance={3}
  onclick={draggable ? handleClick : undefined}
  ondblclick={draggable ? handleDblClick : undefined}
  ondragend={draggable ? handleDragEnd : undefined}
>
  <!-- Background -->
  <Rect
    x={-4}
    y={-2}
    width={textWidth + 8}
    height={textHeight}
    fill={selected ? 'rgba(74, 108, 247, 0.15)' : 'rgba(255, 255, 255, 0.75)'}
    stroke={selected ? '#4a6cf7' : 'rgba(0, 0, 0, 0.2)'}
    strokeWidth={selected ? 1.5 : 0.5}
    cornerRadius={3}
    listening={false}
  />

  <!-- Text -->
  <Text
    x={0}
    y={2}
    text={annotation.text}
    fontSize={annotation.fontSize}
    fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
    fill="#1a1a2e"
    listening={false}
  />
</Group>
