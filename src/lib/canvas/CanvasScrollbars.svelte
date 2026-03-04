<!--
  CanvasScrollbars - HTML overlay scrollbars for the Konva canvas.

  Shows viewport position relative to content and allows panning via drag.
  Rendered as absolute-positioned HTML elements over the canvas container.
-->
<script lang="ts">
  interface CanvasScrollbarsProps {
    /** Viewport width in px */
    viewportWidth: number;
    /** Viewport height in px */
    viewportHeight: number;
    /** Content width in px (floorplan width * scalePxPerMeter) */
    contentWidth: number;
    /** Content height in px (floorplan height * scalePxPerMeter) */
    contentHeight: number;
    /** Current zoom scale */
    scale: number;
    /** Current pan offset X */
    offsetX: number;
    /** Current pan offset Y */
    offsetY: number;
    /** Callback to update offset */
    onOffsetChange: (x: number, y: number) => void;
  }

  let {
    viewportWidth,
    viewportHeight,
    contentWidth,
    contentHeight,
    scale,
    offsetX,
    offsetY,
    onOffsetChange,
  }: CanvasScrollbarsProps = $props();

  // Scrollbar constants
  const BAR_SIZE = 8; // thickness in px
  const MIN_THUMB = 30; // minimum thumb length
  const MARGIN = 2; // margin from edges

  // Track length (minus the corner area)
  let hTrackLen = $derived(viewportWidth - BAR_SIZE - MARGIN * 2);
  let vTrackLen = $derived(viewportHeight - BAR_SIZE - MARGIN * 2);

  // Scaled content dimensions
  let scaledContentW = $derived(contentWidth * scale);
  let scaledContentH = $derived(contentHeight * scale);

  // Total scrollable range: the full extent of content + viewport padding
  let totalW = $derived(Math.max(scaledContentW + viewportWidth, viewportWidth));
  let totalH = $derived(Math.max(scaledContentH + viewportHeight, viewportHeight));

  // Thumb size as ratio of viewport to total content
  let hThumbLen = $derived(Math.max(MIN_THUMB, Math.min(hTrackLen, (viewportWidth / totalW) * hTrackLen)));
  let vThumbLen = $derived(Math.max(MIN_THUMB, Math.min(vTrackLen, (viewportHeight / totalH) * vTrackLen)));

  // Scrollable range in track pixels
  let hScrollableTrack = $derived(hTrackLen - hThumbLen);
  let vScrollableTrack = $derived(vTrackLen - vThumbLen);

  // Current scroll position (0 = content fully scrolled left, 1 = fully scrolled right)
  // offsetX=0 means content origin at viewport origin
  // offsetX = viewportWidth - scaledContentW means content fully visible right side
  let hScrollRange = $derived(scaledContentW + viewportWidth - viewportWidth);
  let vScrollRange = $derived(scaledContentH + viewportHeight - viewportHeight);

  // Normalized scroll positions (0..1)
  // When offsetX = viewportWidth/2, content is shifted right (scroll pos near 0)
  // When offsetX = -(scaledContentW - viewportWidth/2), content is scrolled far right (near 1)
  let hNorm = $derived.by(() => {
    if (hScrollRange <= 0) return 0;
    // Map offset from [viewportWidth/2 .. -(scaledContentW - viewportWidth/2)]
    // to [0..1]
    const maxOffset = viewportWidth * 0.5;
    const minOffset = -(scaledContentW - viewportWidth * 0.5);
    if (maxOffset <= minOffset) return 0;
    return Math.max(0, Math.min(1, (maxOffset - offsetX) / (maxOffset - minOffset)));
  });

  let vNorm = $derived.by(() => {
    if (vScrollRange <= 0) return 0;
    const maxOffset = viewportHeight * 0.5;
    const minOffset = -(scaledContentH - viewportHeight * 0.5);
    if (maxOffset <= minOffset) return 0;
    return Math.max(0, Math.min(1, (maxOffset - offsetY) / (maxOffset - minOffset)));
  });

  // Thumb positions
  let hThumbX = $derived(MARGIN + hNorm * hScrollableTrack);
  let vThumbY = $derived(MARGIN + vNorm * vScrollableTrack);

  // Whether scrollbars should be visible
  let showH = $derived(scaledContentW > viewportWidth * 0.5);
  let showV = $derived(scaledContentH > viewportHeight * 0.5);

  // Drag state
  let draggingH = $state(false);
  let draggingV = $state(false);
  let dragStartPos = $state(0);
  let dragStartNorm = $state(0);

  function normToOffsetX(norm: number): number {
    const maxOffset = viewportWidth * 0.5;
    const minOffset = -(scaledContentW - viewportWidth * 0.5);
    return maxOffset - norm * (maxOffset - minOffset);
  }

  function normToOffsetY(norm: number): number {
    const maxOffset = viewportHeight * 0.5;
    const minOffset = -(scaledContentH - viewportHeight * 0.5);
    return maxOffset - norm * (maxOffset - minOffset);
  }

  function handleHDragStart(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    draggingH = true;
    dragStartPos = e.clientX;
    dragStartNorm = hNorm;
    window.addEventListener('mousemove', handleHDrag);
    window.addEventListener('mouseup', handleHDragEnd);
  }

  function handleHDrag(e: MouseEvent): void {
    if (!draggingH) return;
    const delta = e.clientX - dragStartPos;
    const normDelta = hScrollableTrack > 0 ? delta / hScrollableTrack : 0;
    const newNorm = Math.max(0, Math.min(1, dragStartNorm + normDelta));
    onOffsetChange(normToOffsetX(newNorm), offsetY);
  }

  function handleHDragEnd(): void {
    draggingH = false;
    window.removeEventListener('mousemove', handleHDrag);
    window.removeEventListener('mouseup', handleHDragEnd);
  }

  function handleVDragStart(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    draggingV = true;
    dragStartPos = e.clientY;
    dragStartNorm = vNorm;
    window.addEventListener('mousemove', handleVDrag);
    window.addEventListener('mouseup', handleVDragEnd);
  }

  function handleVDrag(e: MouseEvent): void {
    if (!draggingV) return;
    const delta = e.clientY - dragStartPos;
    const normDelta = vScrollableTrack > 0 ? delta / vScrollableTrack : 0;
    const newNorm = Math.max(0, Math.min(1, dragStartNorm + normDelta));
    onOffsetChange(offsetX, normToOffsetY(newNorm));
  }

  function handleVDragEnd(): void {
    draggingV = false;
    window.removeEventListener('mousemove', handleVDrag);
    window.removeEventListener('mouseup', handleVDragEnd);
  }

  // Track clicks (jump to position)
  function handleHTrackClick(e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left - MARGIN;
    const newNorm = Math.max(0, Math.min(1, (clickX - hThumbLen / 2) / hScrollableTrack));
    onOffsetChange(normToOffsetX(newNorm), offsetY);
  }

  function handleVTrackClick(e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickY = e.clientY - rect.top - MARGIN;
    const newNorm = Math.max(0, Math.min(1, (clickY - vThumbLen / 2) / vScrollableTrack));
    onOffsetChange(offsetX, normToOffsetY(newNorm));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrollbar-container">
  <!-- Horizontal scrollbar -->
  {#if showH}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="scrollbar-track h-track"
      style:width="{hTrackLen}px"
      style:height="{BAR_SIZE}px"
      style:left="{MARGIN}px"
      style:bottom="{MARGIN}px"
      onclick={handleHTrackClick}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="scrollbar-thumb"
        class:dragging={draggingH}
        style:width="{hThumbLen}px"
        style:height="{BAR_SIZE}px"
        style:left="{hThumbX - MARGIN}px"
        style:top="0"
        onmousedown={handleHDragStart}
      ></div>
    </div>
  {/if}

  <!-- Vertical scrollbar -->
  {#if showV}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="scrollbar-track v-track"
      style:height="{vTrackLen}px"
      style:width="{BAR_SIZE}px"
      style:right="{MARGIN}px"
      style:top="{MARGIN}px"
      onclick={handleVTrackClick}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="scrollbar-thumb"
        class:dragging={draggingV}
        style:height="{vThumbLen}px"
        style:width="{BAR_SIZE}px"
        style:top="{vThumbY - MARGIN}px"
        style:left="0"
        onmousedown={handleVDragStart}
      ></div>
    </div>
  {/if}
</div>

<style>
  .scrollbar-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 15;
  }

  .scrollbar-track {
    position: absolute;
    background: transparent;
    border-radius: 4px;
    pointer-events: auto;
  }

  .h-track {
    bottom: 2px;
  }

  .v-track {
    right: 2px;
  }

  .scrollbar-thumb {
    position: absolute;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 4px;
    transition: background 0.15s ease;
    cursor: pointer;
  }

  .scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.55);
  }

  .scrollbar-thumb.dragging {
    background: rgba(0, 0, 0, 0.65);
  }
</style>
