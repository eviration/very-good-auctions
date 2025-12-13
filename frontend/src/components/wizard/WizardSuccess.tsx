import { ReactNode, useEffect, useState } from 'react'

interface WizardSuccessProps {
  title: string
  message?: string
  icon?: ReactNode
  children?: ReactNode
  confetti?: boolean
}

export default function WizardSuccess({
  title,
  message,
  icon,
  children,
  confetti = true,
}: WizardSuccessProps) {
  const [showContent, setShowContent] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const contentTimer = setTimeout(() => setShowContent(true), 200)
    const confettiTimer = setTimeout(() => setShowConfetti(true), 400)
    return () => {
      clearTimeout(contentTimer)
      clearTimeout(confettiTimer)
    }
  }, [])

  return (
    <div className="min-h-screen bg-clay-bg flex items-center justify-center p-4">
      {/* Confetti animation */}
      {confetti && showConfetti && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 50 }, (_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              <div
                className={`w-3 h-3 rounded-sm ${
                  ['bg-clay-mint', 'bg-clay-peach', 'bg-clay-lavender', 'bg-clay-butter', 'bg-clay-sky'][
                    Math.floor(Math.random() * 5)
                  ]
                }`}
                style={{
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div
        className={`max-w-lg w-full clay-card p-8 md:p-12 text-center transition-all duration-700 ${
          showContent ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'
        }`}
      >
        {/* Success icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-clay-mint shadow-clay-lg flex items-center justify-center">
              {icon || (
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            {/* Celebration rings */}
            <div className="absolute inset-0 rounded-full border-4 border-clay-mint animate-ping opacity-20" />
          </div>
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl md:text-4xl font-black text-white mb-4">
          {title}
        </h1>

        {/* Message */}
        {message && (
          <p className="text-white/70 text-lg mb-8">
            {message}
          </p>
        )}

        {/* Additional content (buttons, links, etc.) */}
        {children && (
          <div className="space-y-4">
            {children}
          </div>
        )}
      </div>

      {/* Add confetti animation keyframes */}
      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(-20vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
      `}</style>
    </div>
  )
}
