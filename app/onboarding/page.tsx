import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export default function OnboardingPage() {
  return (
    <main className="page stack">
      <div className="stack" style={{ gap: 6 }}>
        <p className="brand">Sthamly</p>
        <h1>दुकान की जानकारी</h1>
      </div>
      <OnboardingForm />
    </main>
  );
}