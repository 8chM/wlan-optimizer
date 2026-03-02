<!--
  BackgroundImage.svelte - Renders the floor plan background image on the canvas.

  Loads image data (Base64 or Blob URL) and renders as a Konva.Image
  on the Background layer. Non-interactive.
  Supports rotation in 90-degree increments (0, 90, 180, 270).
-->
<script lang="ts">
  import { Image as KonvaImage } from 'svelte-konva';

  interface BackgroundImageProps {
    /** Image data as Base64 string or Blob URL. Null = no image. */
    imageData: string | null;
    /** Scale factor: pixels per meter */
    scalePxPerMeter: number;
    /** Optional opacity for the background image */
    opacity?: number;
    /** Rotation in degrees (0, 90, 180, 270). Default: 0 */
    rotation?: number;
  }

  let {
    imageData = null,
    scalePxPerMeter = 50,
    opacity = 1,
    rotation = 0,
  }: BackgroundImageProps = $props();

  let imageElement = $state<HTMLImageElement | null>(null);

  // Load image when data changes, with cancellation to prevent stale image race conditions
  $effect(() => {
    let cancelled = false;

    if (!imageData) {
      imageElement = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        imageElement = img;
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        console.error('[BackgroundImage] Failed to load image');
        imageElement = null;
      }
    };
    img.src = imageData;

    return () => {
      cancelled = true;
    };
  });

  // Calculate offset to keep the image properly positioned after rotation.
  // Konva rotates around the (x, y) point by default, so we use offset
  // to rotate around the image center and then reposition.
  let offsetConfig = $derived.by(() => {
    if (!imageElement) return { x: 0, y: 0, offsetX: 0, offsetY: 0 };

    const w = imageElement.naturalWidth;
    const h = imageElement.naturalHeight;
    const r = rotation % 360;

    // We rotate around the center of the image using offset,
    // then adjust x/y so the top-left corner lands at (0, 0).
    switch (r) {
      case 90:
        return { x: h, y: 0, offsetX: 0, offsetY: 0 };
      case 180:
        return { x: w, y: h, offsetX: 0, offsetY: 0 };
      case 270:
        return { x: 0, y: w, offsetX: 0, offsetY: 0 };
      default:
        return { x: 0, y: 0, offsetX: 0, offsetY: 0 };
    }
  });
</script>

{#if imageElement}
  <KonvaImage
    image={imageElement}
    x={offsetConfig.x}
    y={offsetConfig.y}
    offsetX={offsetConfig.offsetX}
    offsetY={offsetConfig.offsetY}
    rotation={rotation}
    {opacity}
    listening={false}
  />
{/if}
