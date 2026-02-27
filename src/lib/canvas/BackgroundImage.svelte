<!--
  BackgroundImage.svelte - Renders the floor plan background image on the canvas.

  Loads image data (Base64 or Blob URL) and renders as a Konva.Image
  on the Background layer. Non-interactive.
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
  }

  let {
    imageData = null,
    scalePxPerMeter = 50,
    opacity = 1,
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
</script>

{#if imageElement}
  <KonvaImage
    image={imageElement}
    x={0}
    y={0}
    {opacity}
    listening={false}
  />
{/if}
