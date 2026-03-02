<!--
  BackgroundImage.svelte - Renders the floor plan background image on the canvas.

  Loads image data (Base64 or Blob URL) and renders as a Konva.Image
  on the Background layer. Non-interactive.
  Supports arbitrary rotation angles (0-359 degrees).
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
    /** Rotation in degrees (0-359). Default: 0 */
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
  // Supports arbitrary angles via trigonometric bounding box calculation.
  // Konva rotates around the (x, y) point by default, so we use offset
  // to rotate around the image center and then reposition.
  let offsetConfig = $derived.by(() => {
    if (!imageElement) return { x: 0, y: 0, offsetX: 0, offsetY: 0 };

    const w = imageElement.width || imageElement.naturalWidth;
    const h = imageElement.height || imageElement.naturalHeight;
    const r = ((rotation % 360) + 360) % 360;

    if (r === 0) return { x: 0, y: 0, offsetX: 0, offsetY: 0 };

    // Rotate around the image center, then shift so bounding box starts at (0,0)
    const cx = w / 2;
    const cy = h / 2;
    const rad = (r * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Compute all four corners after rotation around center
    const corners = [
      { x: -cx, y: -cy },
      { x: w - cx, y: -cy },
      { x: w - cx, y: h - cy },
      { x: -cx, y: h - cy },
    ].map((c) => ({
      x: c.x * cos - c.y * sin + cx,
      y: c.x * sin + c.y * cos + cy,
    }));

    const minX = Math.min(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));

    return { x: -minX, y: -minY, offsetX: 0, offsetY: 0 };
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
