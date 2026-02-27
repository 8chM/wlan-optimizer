<!--
  ServerSetupWizard.svelte - Modal/panel for iPerf3 server setup.

  Shows IP address input, connection test button, status indicator,
  and setup instructions for running iperf3 -s on another device.
-->
<script lang="ts">
  import { t } from '$lib/i18n';

  // ─── Props ─────────────────────────────────────────────────────

  interface ServerSetupWizardProps {
    /** Current server IP address */
    serverIp: string;
    /** Whether the server is reachable (null = not tested) */
    reachable: boolean | null;
    /** Whether a connection check is in progress */
    checking: boolean;
    /** Callback when IP changes */
    onIpChange?: (ip: string) => void;
    /** Callback when test connection is clicked */
    onTestConnection?: () => void;
    /** Callback when continue is clicked */
    onContinue?: () => void;
  }

  let {
    serverIp,
    reachable = null,
    checking = false,
    onIpChange,
    onTestConnection,
    onContinue,
  }: ServerSetupWizardProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  let canContinue = $derived(reachable === true);
  let statusClass = $derived(
    checking ? 'checking' : reachable === true ? 'reachable' : reachable === false ? 'unreachable' : '',
  );

  // ─── Handlers ─────────────────────────────────────────────────

  function handleIpInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    onIpChange?.(target.value);
  }

  function handleTestClick(): void {
    onTestConnection?.();
  }

  function handleContinue(): void {
    onContinue?.();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && serverIp.trim()) {
      handleTestClick();
    }
  }
</script>

<div class="server-setup">
  <h3 class="setup-title">{t('measurement.serverSetup')}</h3>

  <div class="instructions">
    <p class="instruction-text">{t('measurement.serverInstructions')}</p>
    <code class="instruction-code">iperf3 -s</code>
  </div>

  <div class="input-group">
    <label class="input-label" for="server-ip">{t('measurement.serverIp')}</label>
    <div class="input-row">
      <input
        id="server-ip"
        type="text"
        class="ip-input"
        value={serverIp}
        oninput={handleIpInput}
        onkeydown={handleKeydown}
        placeholder="192.168.1.100"
        autocomplete="off"
        spellcheck="false"
      />
      <button
        class="test-btn"
        onclick={handleTestClick}
        disabled={!serverIp.trim() || checking}
      >
        {t('measurement.testConnection')}
      </button>
    </div>
  </div>

  {#if statusClass}
    <div class="status-indicator {statusClass}">
      <span class="status-dot"></span>
      <span class="status-text">
        {#if checking}
          {t('measurement.serverChecking')}
        {:else if reachable === true}
          {t('measurement.serverReachable')}
        {:else}
          {t('measurement.serverUnreachable')}
        {/if}
      </span>
    </div>
  {/if}

  <button
    class="continue-btn"
    onclick={handleContinue}
    disabled={!canContinue}
  >
    {t('measurement.continueSetup')}
  </button>
</div>

<style>
  .server-setup {
    padding: 12px;
  }

  .setup-title {
    margin: 0 0 12px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .instructions {
    margin-bottom: 12px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
  }

  .instruction-text {
    margin: 0 0 6px;
    font-size: 0.75rem;
    color: #a0a0b0;
    line-height: 1.4;
  }

  .instruction-code {
    display: block;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.75rem;
    color: #6366f1;
  }

  .input-group {
    margin-bottom: 10px;
  }

  .input-label {
    display: block;
    font-size: 0.7rem;
    color: #808090;
    margin-bottom: 4px;
    font-weight: 500;
  }

  .input-row {
    display: flex;
    gap: 6px;
  }

  .ip-input {
    flex: 1;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 5px;
    color: #e0e0f0;
    font-size: 0.8rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .ip-input:focus {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .ip-input::placeholder {
    color: #505060;
  }

  .test-btn {
    padding: 6px 10px;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 5px;
    color: #a5b4fc;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .test-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.5);
    color: #c7d2fe;
  }

  .test-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 5px;
    margin-bottom: 10px;
    font-size: 0.75rem;
  }

  .status-indicator.checking {
    background: rgba(99, 102, 241, 0.1);
    color: #a5b4fc;
  }

  .status-indicator.reachable {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
  }

  .status-indicator.unreachable {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .checking .status-dot {
    background: #6366f1;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .reachable .status-dot {
    background: #22c55e;
  }

  .unreachable .status-dot {
    background: #ef4444;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .status-text {
    font-weight: 500;
  }

  .continue-btn {
    width: 100%;
    padding: 8px 12px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 6px;
    color: #c7d2fe;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .continue-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.3);
    border-color: rgba(99, 102, 241, 0.6);
    color: #e0e7ff;
  }

  .continue-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
