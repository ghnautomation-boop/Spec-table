import { useOnboarding } from "./OnboardingContext.jsx";
import { onboardingSteps } from "../utils/onboardingSteps.jsx";

export function OnboardingButton() {
  const { startTour, isDismissed, resetTour, isActive } = useOnboarding();

  // Nu afișa butonul dacă tour-ul este deja activ
  if (isActive) {
    return null;
  }

  return (
    <div style={{ 
      position: "fixed", 
      top: "80px", 
      right: "20px", 
      zIndex: 1000,
    }}>
      {isDismissed ? (
        <s-button
          variant="secondary"
          onClick={() => {
            resetTour();
            startTour(onboardingSteps);
          }}
          icon="play"
          accessibilityLabel="Restart Interactive Guide"
          style={{ 
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          Restart Guide
        </s-button>
      ) : (
        <s-button
          variant="primary"
          onClick={() => startTour(onboardingSteps)}
          icon="play"
          accessibilityLabel="Start Interactive Guide"
          style={{ 
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          Start Guide
        </s-button>
      )}
    </div>
  );
}
