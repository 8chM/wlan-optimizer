<!--
  OnboardingDialog.svelte - First-launch onboarding wizard.

  Shows a 3-step introduction on first launch (tracked via localStorage).
  Steps: 1) Upload floor plan, 2) Draw walls & place APs, 3) View heatmap.
  Includes a language toggle (DE/EN) at the top.
-->
<script lang="ts">
  import { t, getLocale, setLocale, type Locale } from '$lib/i18n';

  const STORAGE_KEY = 'onboarding_completed';

  let visible = $state(false);
  let currentStep = $state(0);
  let locale = $state<Locale>(getLocale());

  // Check if onboarding should be shown
  $effect(() => {
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        visible = true;
      }
    }
  });

  const totalSteps = 3;

  function stepTitleKey(step: number): string {
    switch (step) {
      case 0: return 'onboarding.step1Title';
      case 1: return 'onboarding.step2Title';
      case 2: return 'onboarding.step3Title';
      default: return 'onboarding.step1Title';
    }
  }

  function stepDescKey(step: number): string {
    switch (step) {
      case 0: return 'onboarding.step1Desc';
      case 1: return 'onboarding.step2Desc';
      case 2: return 'onboarding.step3Desc';
      default: return 'onboarding.step1Desc';
    }
  }

  function stepIcon(step: number): string {
    switch (step) {
      case 0: return '\uD83D\uDCC2'; // folder open
      case 1: return '\u270F\uFE0F'; // pencil
      case 2: return '\uD83D\uDDFA\uFE0F'; // map
      default: return '\uD83D\uDCC2';
    }
  }

  function handleNext(): void {
    if (currentStep < totalSteps - 1) {
      currentStep++;
    } else {
      dismiss();
    }
  }

  function handlePrev(): void {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  function dismiss(): void {
    visible = false;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }

  function toggleLocale(): void {
    const newLocale: Locale = locale === 'de' ? 'en' : 'de';
    locale = newLocale;
    setLocale(newLocale);
  }
</script>

{#if visible}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="dialog">
      <!-- Language toggle -->
      <div class="dialog-header">
        <button class="lang-toggle" onclick={toggleLocale}>
          {locale === 'de' ? 'EN' : 'DE'}
        </button>
        <button class="skip-btn" onclick={dismiss}>
          {t('onboarding.skip')}
        </button>
      </div>

      <!-- Welcome -->
      <h2 class="dialog-title">{t('onboarding.welcome')}</h2>

      <!-- Step content -->
      <div class="step-content">
        <div class="step-icon">{stepIcon(currentStep)}</div>
        <h3 class="step-title">{t(stepTitleKey(currentStep))}</h3>
        <p class="step-desc">{t(stepDescKey(currentStep))}</p>
      </div>

      <!-- Step indicators -->
      <div class="step-dots">
        {#each Array(totalSteps) as _, i}
          <span class="dot" class:active={i === currentStep}></span>
        {/each}
      </div>

      <!-- Navigation -->
      <div class="dialog-actions">
        {#if currentStep > 0}
          <button class="btn-secondary" onclick={handlePrev}>
            &larr;
          </button>
        {:else}
          <div></div>
        {/if}

        <button class="btn-primary" onclick={handleNext}>
          {#if currentStep === totalSteps - 1}
            {t('onboarding.gotIt')}
          {:else}
            &rarr;
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: #ffffff;
    border-radius: 16px;
    padding: 32px;
    width: 420px;
    max-width: 90vw;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
    text-align: center;
  }

  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .lang-toggle {
    padding: 4px 12px;
    background: #f0f0f5;
    border: 1px solid #d0d0e0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    color: #1a1a2e;
    transition: background 0.15s ease;
  }

  .lang-toggle:hover {
    background: #e0e0f0;
  }

  .skip-btn {
    padding: 4px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    color: #808090;
    transition: color 0.15s ease;
  }

  .skip-btn:hover {
    color: #1a1a2e;
  }

  .dialog-title {
    margin: 0 0 24px;
    font-size: 1.3rem;
    font-weight: 700;
    color: #1a1a2e;
  }

  .step-content {
    padding: 16px 0 24px;
  }

  .step-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
  }

  .step-title {
    margin: 0 0 8px;
    font-size: 1.05rem;
    font-weight: 600;
    color: #1a1a2e;
  }

  .step-desc {
    margin: 0;
    font-size: 0.85rem;
    color: #5a5a7a;
    line-height: 1.5;
  }

  .step-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 24px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #d0d0e0;
    transition: background 0.2s ease;
  }

  .dot.active {
    background: #4a6cf7;
  }

  .dialog-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .btn-primary {
    padding: 10px 28px;
    background: #4a6cf7;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: background 0.15s ease;
  }

  .btn-primary:hover {
    background: #3a5ce7;
  }

  .btn-secondary {
    padding: 10px 20px;
    background: #f0f0f5;
    color: #1a1a2e;
    border: 1px solid #d0d0e0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }

  .btn-secondary:hover {
    background: #e0e0f0;
  }
</style>
