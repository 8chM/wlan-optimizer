<!--
  CalibrationResult.svelte - Shows calibration results after baseline run.

  Displays:
  - Calibrated path loss exponent (N)
  - Original N vs calibrated N
  - RMSE value with visual indicator
  - Confidence badge (high=green, medium=yellow, low=red)
  - R-squared value
  - Max deviation
  - "Apply to Heatmap" button
  - Number of measurement points used
-->
<script lang="ts">
  import { t } from '$lib/i18n';

  // ─── Props ─────────────────────────────────────────────────────

  interface CalibrationResultProps {
    /** Calibrated path loss exponent */
    calibratedN: number | null;
    /** Original path loss exponent before calibration */
    originalN: number | null;
    /** Root mean square error in dB */
    rmse: number | null;
    /** Confidence level: high, medium, low */
    confidence: string | null;
    /** Coefficient of determination */
    rSquared: number | null;
    /** Maximum deviation in dB */
    maxDeviation: number | null;
    /** Number of measurement points used */
    pointCount: number;
    /** Callback when "Apply to Heatmap" is clicked */
    onApply?: (calibratedN: number) => void;
  }

  let {
    calibratedN = null,
    originalN = null,
    rmse = null,
    confidence = null,
    rSquared = null,
    maxDeviation = null,
    pointCount = 0,
    onApply,
  }: CalibrationResultProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  let confidenceClass = $derived(getConfidenceClass(confidence));
  let confidenceLabel = $derived(getConfidenceLabel(confidence));
  let rmseColor = $derived(getRmseColor(rmse));
  let hasCalibration = $derived(calibratedN !== null);

  // ─── Helpers ──────────────────────────────────────────────────

  function getConfidenceClass(conf: string | null): string {
    switch (conf) {
      case 'high': return 'conf-high';
      case 'medium': return 'conf-medium';
      case 'low': return 'conf-low';
      default: return '';
    }
  }

  function getConfidenceLabel(conf: string | null): string {
    switch (conf) {
      case 'high': return t('measurement.confidenceHigh');
      case 'medium': return t('measurement.confidenceMedium');
      case 'low': return t('measurement.confidenceLow');
      default: return '--';
    }
  }

  function getRmseColor(value: number | null): string {
    if (value === null) return '#808090';
    if (value <= 3) return '#22c55e';
    if (value <= 6) return '#f59e0b';
    return '#ef4444';
  }

  function handleApply(): void {
    if (calibratedN !== null) {
      onApply?.(calibratedN);
    }
  }
</script>

{#if hasCalibration}
  <div class="calibration-result">
    <h3 class="cal-title">{t('measurement.calibration')}</h3>

    <div class="cal-grid">
      <!-- Calibrated N -->
      <div class="cal-row highlight">
        <span class="cal-label">{t('measurement.calibratedN')}</span>
        <span class="cal-value cal-n">
          {calibratedN !== null ? calibratedN.toFixed(2) : '--'}
        </span>
      </div>

      <!-- Original N -->
      {#if originalN !== null}
        <div class="cal-row">
          <span class="cal-label">{t('measurement.originalN')}</span>
          <span class="cal-value">{originalN.toFixed(2)}</span>
        </div>
      {/if}

      <!-- RMSE -->
      <div class="cal-row">
        <span class="cal-label">{t('measurement.rmse')}</span>
        <span class="cal-value" style="color: {rmseColor}">
          {rmse !== null ? `${rmse.toFixed(2)} dB` : '--'}
        </span>
      </div>

      <!-- R-squared -->
      {#if rSquared !== null}
        <div class="cal-row">
          <span class="cal-label">R²</span>
          <span class="cal-value">{rSquared.toFixed(4)}</span>
        </div>
      {/if}

      <!-- Max Deviation -->
      {#if maxDeviation !== null}
        <div class="cal-row">
          <span class="cal-label">{t('measurement.maxDeviation')}</span>
          <span class="cal-value">{maxDeviation.toFixed(1)} dB</span>
        </div>
      {/if}

      <!-- Point Count -->
      <div class="cal-row">
        <span class="cal-label">{t('measurement.pointsCount')}</span>
        <span class="cal-value">{pointCount}</span>
      </div>

      <!-- Confidence -->
      <div class="cal-row">
        <span class="cal-label">{t('measurement.confidence')}</span>
        <span class="cal-badge {confidenceClass}">
          {confidenceLabel}
        </span>
      </div>
    </div>

    <button class="apply-btn" onclick={handleApply}>
      {t('measurement.applyToHeatmap')}
    </button>
  </div>
{/if}

<style>
  .calibration-result {
    padding: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  .cal-title {
    margin: 0 0 10px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .cal-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
  }

  .cal-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cal-row.highlight {
    padding: 4px 6px;
    background: rgba(99, 102, 241, 0.08);
    border-radius: 4px;
  }

  .cal-label {
    font-size: 0.7rem;
    color: #808090;
    font-weight: 500;
  }

  .cal-value {
    font-size: 0.7rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    text-align: right;
  }

  .cal-n {
    font-size: 0.85rem;
    font-weight: 700;
    color: #a5b4fc;
  }

  .cal-badge {
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .conf-high {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }

  .conf-medium {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .conf-low {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .apply-btn {
    width: 100%;
    padding: 8px 12px;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 6px;
    color: #4ade80;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .apply-btn:hover {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.5);
    color: #86efac;
  }
</style>
