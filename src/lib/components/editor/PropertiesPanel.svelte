<!--
  PropertiesPanel.svelte - Context-dependent properties panel for the editor sidebar.

  Shows different content based on what is selected:
  - Nothing selected: empty state hint
  - Wall selected: WallProperties
  - AP selected: APProperties
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { WallResponse, AccessPointResponse, MaterialResponse } from '$lib/api/invoke';
  import type { CandidateLocation, ConstraintZone, APCapabilities } from '$lib/recommendations/types';
  import WallProperties from './WallProperties.svelte';
  import APProperties from './APProperties.svelte';
  import MultiWallProperties from './MultiWallProperties.svelte';
  import CandidateProperties from './CandidateProperties.svelte';
  import ConstraintZoneProperties from './ConstraintZoneProperties.svelte';
  import APCapabilitiesSection from './APCapabilitiesSection.svelte';

  interface PropertiesPanelProps {
    /** Currently selected wall (if any) */
    selectedWall?: WallResponse | null;
    /** Currently selected access point (if any) */
    selectedAp?: AccessPointResponse | null;
    /** Multiple selected walls for bulk editing */
    selectedWalls?: WallResponse[];
    /** Available materials for wall material selection */
    materials?: MaterialResponse[];
    /** Currently selected candidate location (if any) */
    selectedCandidate?: CandidateLocation | null;
    /** Currently selected constraint zone (if any) */
    selectedZone?: ConstraintZone | null;
    /** AP capabilities for the selected AP */
    apCapabilities?: APCapabilities | null;
    /** Callback when a wall is updated */
    onWallUpdate?: (wallId: string, updates: {
      materialId?: string;
      thicknessCm?: number | null;
      attenuationOverride24ghz?: number | null;
      attenuationOverride5ghz?: number | null;
    }) => void;
    /** Callback when an AP is updated */
    onApUpdate?: (apId: string, updates: {
      label?: string;
      txPower24ghzDbm?: number;
      txPower5ghzDbm?: number;
      enabled?: boolean;
      height_m?: number;
      mounting?: string;
      channel_24ghz?: number;
      channel_5ghz?: number;
      channel_width?: string;
      orientation_deg?: number;
    }) => void;
    /** Callback to bulk-update walls */
    onBulkWallUpdate?: (wallIds: string[], updates: { materialId?: string }) => void;
    /** Callback when a wall is deleted */
    onDeleteWall?: (wallId: string) => void;
    /** Callback when an AP is deleted */
    onDeleteAp?: (apId: string) => void;
    /** Callback when a candidate is updated */
    onCandidateUpdate?: (id: string, updates: Partial<CandidateLocation>) => void;
    /** Callback when a candidate is deleted */
    onDeleteCandidate?: (id: string) => void;
    /** Callback when a zone is updated */
    onZoneUpdate?: (id: string, updates: Partial<ConstraintZone>) => void;
    /** Callback when a zone is deleted */
    onDeleteZone?: (id: string) => void;
    /** Callback when AP capabilities change */
    onCapabilitiesChange?: (apId: string, caps: APCapabilities) => void;
  }

  let {
    selectedWall = null,
    selectedAp = null,
    selectedWalls = [],
    materials = [],
    selectedCandidate = null,
    selectedZone = null,
    apCapabilities = null,
    onWallUpdate,
    onApUpdate,
    onBulkWallUpdate,
    onDeleteWall,
    onDeleteAp,
    onCandidateUpdate,
    onDeleteCandidate,
    onZoneUpdate,
    onDeleteZone,
    onCapabilitiesChange,
  }: PropertiesPanelProps = $props();

  let hasSelection = $derived(selectedWall !== null || selectedAp !== null || selectedWalls.length > 1 || selectedCandidate !== null || selectedZone !== null);
</script>

<div class="properties-panel">
  {#if selectedWalls.length > 1}
    <MultiWallProperties
      walls={selectedWalls}
      {materials}
      onBulkUpdate={onBulkWallUpdate}
      onBulkDelete={onDeleteWall}
    />
  {:else if selectedWall}
    <WallProperties
      wall={selectedWall}
      {materials}
      onUpdate={onWallUpdate}
      onDelete={onDeleteWall}
    />
  {:else if selectedAp}
    <APProperties
      accessPoint={selectedAp}
      onUpdate={onApUpdate}
      onDelete={onDeleteAp}
    />
    <APCapabilitiesSection
      apId={selectedAp.id}
      capabilities={apCapabilities}
      {onCapabilitiesChange}
    />
  {:else if selectedCandidate}
    <CandidateProperties
      candidate={selectedCandidate}
      onUpdate={onCandidateUpdate}
      onDelete={onDeleteCandidate}
    />
  {:else if selectedZone}
    <ConstraintZoneProperties
      zone={selectedZone}
      onUpdate={onZoneUpdate}
      onDelete={onDeleteZone}
    />
  {:else}
    <div class="empty-state">
      <h3 class="panel-title">{t('properties.title')}</h3>
      <p class="hint-text">{t('properties.noSelection')}</p>
    </div>
  {/if}
</div>

<style>
  .properties-panel {
    padding: 4px 0;
  }

  .empty-state {
    text-align: center;
    padding: 16px 8px;
  }

  .panel-title {
    margin: 0 0 8px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .hint-text {
    margin: 0;
    font-size: 0.75rem;
    color: #6a6a8a;
    line-height: 1.4;
  }
</style>
