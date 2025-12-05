import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react'

interface BaseInputProps {
  label: string
  hint?: string
  error?: string
  success?: boolean
  successMessage?: string
  required?: boolean
}

type WizardInputProps = BaseInputProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>

export const WizardInput = forwardRef<HTMLInputElement, WizardInputProps>(
  ({ label, hint, error, success, successMessage, required, ...props }, ref) => {
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="text-charcoal font-bold text-lg">
            {label}
            {required && <span className="text-clay-coral ml-1">*</span>}
          </span>
          {hint && (
            <span className="block text-charcoal-light text-sm mt-1">{hint}</span>
          )}
        </label>
        <input
          ref={ref}
          className={`clay-input w-full text-lg py-4 transition-all ${
            error
              ? 'ring-2 ring-clay-coral'
              : success
              ? 'ring-2 ring-clay-mint'
              : ''
          }`}
          {...props}
        />
        {error && (
          <p className="text-clay-coral font-medium text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </p>
        )}
        {success && successMessage && (
          <p className="text-sage font-medium text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMessage}
          </p>
        )}
      </div>
    )
  }
)

WizardInput.displayName = 'WizardInput'

type WizardTextareaProps = BaseInputProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>

export const WizardTextarea = forwardRef<HTMLTextAreaElement, WizardTextareaProps>(
  ({ label, hint, error, success, successMessage, required, ...props }, ref) => {
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="text-charcoal font-bold text-lg">
            {label}
            {required && <span className="text-clay-coral ml-1">*</span>}
          </span>
          {hint && (
            <span className="block text-charcoal-light text-sm mt-1">{hint}</span>
          )}
        </label>
        <textarea
          ref={ref}
          className={`clay-input w-full text-lg py-4 min-h-[120px] transition-all ${
            error
              ? 'ring-2 ring-clay-coral'
              : success
              ? 'ring-2 ring-clay-mint'
              : ''
          }`}
          {...props}
        />
        {error && (
          <p className="text-clay-coral font-medium text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </p>
        )}
        {success && successMessage && (
          <p className="text-sage font-medium text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMessage}
          </p>
        )}
      </div>
    )
  }
)

WizardTextarea.displayName = 'WizardTextarea'
