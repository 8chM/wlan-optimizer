/**
 * Wizard Store - Manages state for the project setup wizard.
 *
 * Tracks current step, project/floor IDs, and per-step completion data.
 * Supports both new project creation and editing existing projects.
 */

export interface WizardStepData {
  name: string;
  description: string;
  apModelId: string | null;
  hasFloorplan: boolean;
  scaleConfirmed: boolean;
  wallsDrawn: boolean;
  apsPlaced: boolean;
}

export interface WizardState {
  currentStep: number;
  projectId: string | null;
  floorId: string | null;
  stepData: WizardStepData;
  isEditMode: boolean;
}

export const WIZARD_STEPS = [
  { key: 'step1', labelKey: 'wizard.step1', icon: '📋', required: true },
  { key: 'step2', labelKey: 'wizard.step2', icon: '🖼', required: false },
  { key: 'step3', labelKey: 'wizard.step3', icon: '📐', required: false },
  { key: 'step4', labelKey: 'wizard.step4', icon: '▬', required: false },
  { key: 'step5', labelKey: 'wizard.step5', icon: '◉', required: false },
  { key: 'step6', labelKey: 'wizard.step6', icon: '✓', required: true },
] as const;

function createWizardStore() {
  let currentStep = $state(0);
  let projectId = $state<string | null>(null);
  let floorId = $state<string | null>(null);
  let isEditMode = $state(false);
  let stepData = $state<WizardStepData>({
    name: '',
    description: '',
    apModelId: null,
    hasFloorplan: false,
    scaleConfirmed: false,
    wallsDrawn: false,
    apsPlaced: false,
  });

  return {
    get currentStep() { return currentStep; },
    get projectId() { return projectId; },
    get floorId() { return floorId; },
    get isEditMode() { return isEditMode; },
    get stepData() { return stepData; },

    get totalSteps() { return WIZARD_STEPS.length; },

    /** Check if the user can advance to a given step */
    canGoToStep(step: number): boolean {
      if (step < 0 || step >= WIZARD_STEPS.length) return false;
      if (step <= currentStep) return true;
      // Step 1 (index 0) must be completed before anything else
      if (step > 0 && !projectId) return false;
      // Step 3 (calibration) requires step 2 (floorplan) — skip if no image
      if (step === 2 && !stepData.hasFloorplan) return true; // auto-skip
      return true;
    },

    /** Check if the current step can be skipped */
    canSkipCurrentStep(): boolean {
      const step = WIZARD_STEPS[currentStep];
      return step ? !step.required : false;
    },

    setStep(step: number): void {
      if (step >= 0 && step < WIZARD_STEPS.length) {
        currentStep = step;
      }
    },

    nextStep(): void {
      if (currentStep < WIZARD_STEPS.length - 1) {
        let next = currentStep + 1;
        // Auto-skip calibration if no floorplan
        if (next === 2 && !stepData.hasFloorplan) {
          next = 3;
        }
        currentStep = next;
      }
    },

    prevStep(): void {
      if (currentStep > 0) {
        let prev = currentStep - 1;
        // Auto-skip calibration if no floorplan
        if (prev === 2 && !stepData.hasFloorplan) {
          prev = 1;
        }
        currentStep = prev;
      }
    },

    setProjectId(id: string): void {
      projectId = id;
    },

    setFloorId(id: string): void {
      floorId = id;
    },

    updateStepData(updates: Partial<WizardStepData>): void {
      stepData = { ...stepData, ...updates };
    },

    /** Initialize for a new project */
    initNew(): void {
      currentStep = 0;
      projectId = null;
      floorId = null;
      isEditMode = false;
      stepData = {
        name: '',
        description: '',
        apModelId: null,
        hasFloorplan: false,
        scaleConfirmed: false,
        wallsDrawn: false,
        apsPlaced: false,
      };
    },

    /** Initialize for editing an existing project */
    initEdit(pId: string, fId: string, data: Partial<WizardStepData>): void {
      currentStep = 0;
      projectId = pId;
      floorId = fId;
      isEditMode = true;
      stepData = {
        name: data.name ?? '',
        description: data.description ?? '',
        apModelId: data.apModelId ?? null,
        hasFloorplan: data.hasFloorplan ?? false,
        scaleConfirmed: data.scaleConfirmed ?? false,
        wallsDrawn: data.wallsDrawn ?? false,
        apsPlaced: data.apsPlaced ?? false,
      };
    },

    reset(): void {
      currentStep = 0;
      projectId = null;
      floorId = null;
      isEditMode = false;
      stepData = {
        name: '',
        description: '',
        apModelId: null,
        hasFloorplan: false,
        scaleConfirmed: false,
        wallsDrawn: false,
        apsPlaced: false,
      };
    },
  };
}

/** Singleton wizard store instance */
export const wizardStore = createWizardStore();
