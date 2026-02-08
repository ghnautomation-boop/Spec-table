import { createContext, useContext, useState, useEffect, useCallback } from "react";

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState([]);
  const [isDismissed, setIsDismissed] = useState(false);

  // Load state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem("onboarding_state");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setIsDismissed(parsed.isDismissed || false);
        if (!parsed.isDismissed && parsed.isActive) {
          setIsActive(true);
          setCurrentStep(parsed.currentStep || 0);
        }
      } catch (e) {
        console.warn("Failed to parse onboarding state:", e);
      }
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    if (isActive || isDismissed) {
      localStorage.setItem(
        "onboarding_state",
        JSON.stringify({
          isActive,
          currentStep,
          isDismissed,
        })
      );
    }
  }, [isActive, currentStep, isDismissed]);

  const startTour = useCallback((tourSteps) => {
    setSteps(tourSteps);
    setCurrentStep(0);
    setIsActive(true);
    setIsDismissed(false);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev < steps.length - 1) {
        return prev + 1;
      }
      // Tour completed
      setIsActive(false);
      setIsDismissed(true);
      return prev;
    });
  }, [steps.length]);

  const previousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setIsDismissed(true);
  }, []);

  const dismissTour = useCallback(() => {
    setIsActive(false);
    setIsDismissed(true);
  }, []);

  const resetTour = useCallback(() => {
    setIsActive(false);
    setIsDismissed(false);
    setCurrentStep(0);
    setSteps([]);
    localStorage.removeItem("onboarding_state");
  }, []);

  const value = {
    isActive,
    currentStep,
    steps,
    isDismissed,
    startTour,
    nextStep,
    previousStep,
    skipTour,
    dismissTour,
    resetTour,
    currentStepData: steps[currentStep] || null,
    hasNext: currentStep < steps.length - 1,
    hasPrevious: currentStep > 0,
    progress: steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
