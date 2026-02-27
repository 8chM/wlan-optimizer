<!--
  ToastContainer.svelte - Fixed-position container rendering all active toasts.

  Positioned top-right with stacked layout and z-index 9999.
  Reads toasts from the global toastStore.
-->
<script lang="ts">
  import { toastStore } from '$lib/stores/toastStore.svelte';
  import Toast from './Toast.svelte';

  function handleClose(id: string): void {
    toastStore.removeToast(id);
  }
</script>

{#if toastStore.toasts.length > 0}
  <div class="toast-container">
    {#each toastStore.toasts as toast (toast.id)}
      <Toast
        id={toast.id}
        type={toast.type}
        message={toast.message}
        onClose={handleClose}
      />
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: auto;
  }
</style>
