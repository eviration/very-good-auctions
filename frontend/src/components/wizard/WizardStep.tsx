import { ReactNode, useEffect, useState } from 'react'

interface WizardStepProps {
  // Step info
  stepNumber: number
  totalSteps: number
  title: string
  subtitle?: string

  // Content
  children: ReactNode

  // Navigation
  onNext?: () => void
  onBack?: () => void
  onSkip?: () => void
  nextLabel?: string
  backLabel?: string
  skipLabel?: string

  // State
  isValid?: boolean
  isLoading?: boolean
  showBack?: boolean
  showSkip?: boolean

  // Encouragement messages
  encouragement?: string
  icon?: ReactNode
}

export default function WizardStep({
  stepNumber,
  totalSteps,
  title,
  subtitle,
  children,
  onNext,
  onBack,
  onSkip,
  nextLabel = 'Continue',
  backLabel = 'Back',
  skipLabel = 'Skip for now',
  isValid = true,
  isLoading = false,
  showBack = true,
  showSkip = false,
  encouragement,
  icon,
}: WizardStepProps) {
  const [showContent, setShowContent] = useState(false)
  const progress = (stepNumber / totalSteps) * 100

  useEffect(() => {
    // Animate content in after a brief delay
    const timer = setTimeout(() => setShowContent(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-clay-bg">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-1 bg-clay-surface">
          <div
            className="h-full bg-clay-mint transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-12 pb-24">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                i + 1 < stepNumber
                  ? 'bg-clay-mint scale-100'
                  : i + 1 === stepNumber
                  ? 'bg-charcoal scale-125'
                  : 'bg-clay-surface border-2 border-charcoal/20'
              }`}
            />
          ))}
        </div>

        {/* Main card */}
        <div
          className={`clay-card p-8 md:p-12 transition-all duration-500 ${
            showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Icon */}
          {icon && (
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-clay-lg bg-clay-mint shadow-clay flex items-center justify-center">
                {icon}
              </div>
            </div>
          )}

          {/* Title */}
          <div className="text-center mb-8">
            <p className="text-charcoal-light font-bold text-sm uppercase tracking-wider mb-2">
              Step {stepNumber} of {totalSteps}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-black text-charcoal mb-3">
              {title}
            </h1>
            {subtitle && (
              <p className="text-charcoal-light text-lg">
                {subtitle}
              </p>
            )}
          </div>

          {/* Content */}
          <div className="space-y-6">
            {children}
          </div>

          {/* Encouragement message */}
          {encouragement && isValid && (
            <div className="mt-8 p-4 rounded-clay bg-clay-mint/30 border-2 border-clay-mint/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-clay-mint flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-charcoal font-medium">{encouragement}</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div
          className={`mt-8 transition-all duration-500 delay-200 ${
            showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Back button */}
            {showBack && stepNumber > 1 && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="clay-button bg-clay-surface text-charcoal order-2 sm:order-1"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                {backLabel}
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1 order-1 sm:order-2" />

            {/* Skip button */}
            {showSkip && onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="text-charcoal-light font-bold hover:text-charcoal transition-colors order-3"
              >
                {skipLabel}
              </button>
            )}

            {/* Next/Continue button */}
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                disabled={!isValid || isLoading}
                className="clay-button bg-clay-mint text-charcoal font-bold px-8 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed order-4"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-charcoal/30 border-t-charcoal rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    {nextLabel}
                    <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
