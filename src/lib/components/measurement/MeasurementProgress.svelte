<!--
  MeasurementProgress.svelte - Shows progress during a measurement.

  Displays:
  - Current step: "Reading WiFi Signal...", "TCP Upload...", etc.
  - Progress bar
  - Cancel button
-->
<script lang="ts">
  import { t } from '$lib/i18n';

  // ─── Props ─────────────────────────────────────────────────────

  interface MeasurementProgressProps {
    /** Current step key (readingWifi, tcpUpload, tcpDownload, udpTest) */
    currentStep: string;
    /** Current progress index (0-based) */
    current: number;
    /** Total measurement steps */
    total: number;
    /** Callback when cancel is clicked */
    onCancel?: () => void;
  }

  let {
    currentStep = '',
    current = 0,
    total = 4,
    onCancel,
  }: MeasurementProgressProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  let progressPercent = $derived(total > 0 ? Math.round((current / total) * 100) : 0);

  let stepLabel = $derived(getStepLabel(currentStep));

  // ─── Steps ────────────────────────────────────────────────────

  const STEPS = ['readingWifi', 'tcpUpload', 'tcpDownload', 'udpTest'];

  function getStepLabel(step: string): string {
    const key = `measurement.${step}`;
    return t(key);
  }

  function isStepComplete(stepIndex: number): boolean {
    return stepIndex < current;
  }

  function isStepActive(stepIndex: number): boolean {
    return stepIndex === current;
  }
</script>

<div class="measurement-progress">
  <div class="progress-header">
    <span class="progress-title">{t('measurement.measuring')}</span>
    <span class="progress-percent">{progressPercent}%</span>
  </div>

  <div class="progress-bar-container">
    <div class="progress-bar-fill" style="width: {progressPercent}%"></div>
  </div>

  <div class="step-list">
    {#each STEPS as step, i (step)}
      <div class="step-item" class:complete={isStepComplete(i)} class:active={isStepActive(i)}>
        <span class="step-dot"></span>
        <span class="step-label">{getStepLabel(step)}</span>
      </div>
    {/each}
  </div>

  <div class="progress-label">{stepLabel}</div>

  <button class="cancel-btn" onclick={() => onCancel?.()}>
    {t('measurement.cancelMeasurement')}
  </button>
</div>

<style>
  .measurement-progress {
    padding: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .progress-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .progress-percent {
    font-size: 0.75rem;
    color: #a5b4fc;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-weight: 600;
  }

  .progress-bar-container {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #818cf8);
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  .step-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
  }

  .step-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.7rem;
    color: #606070;
    transition: color 0.2s ease;
  }

  .step-item.complete {
    color: #4ade80;
  }

  .step-item.active {
    color: #a5b4fc;
  }

  .step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #404050;
    flex-shrink: 0;
    transition: background 0.2s ease;
  }

  .step-item.complete .step-dot {
    background: #22c55e;
  }

  .step-item.active .step-dot {
    background: #6366f1;
    animation: pulse-dot 1.2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  .step-label {
    font-weight: 500;
  }

  .progress-label {
    font-size: 0.7rem;
    color: #808090;
    margin-bottom: 10px;
    text-align: center;
    font-style: italic;
  }

  .cancel-btn {
    width: 100%;
    padding: 6px 10px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 5px;
    color: #f87171;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cancel-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }
</style>
