import { ReactNode } from 'react'

interface WizardOptionCardProps {
  title: string
  description?: string
  icon?: ReactNode
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  badge?: string
  badgeColor?: 'mint' | 'peach' | 'lavender' | 'butter' | 'sky' | 'coral'
}

const badgeColors = {
  mint: 'bg-clay-mint',
  peach: 'bg-clay-peach',
  lavender: 'bg-clay-lavender',
  butter: 'bg-clay-butter',
  sky: 'bg-clay-sky',
  coral: 'bg-clay-coral',
}

export default function WizardOptionCard({
  title,
  description,
  icon,
  selected = false,
  onClick,
  disabled = false,
  badge,
  badgeColor = 'mint',
}: WizardOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left clay-card p-5 transition-all duration-200 ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : selected
          ? 'ring-3 ring-charcoal shadow-clay-lg scale-[1.02]'
          : 'hover:shadow-clay-lg hover:scale-[1.01]'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Selection indicator */}
        <div
          className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
            selected
              ? 'bg-charcoal'
              : 'bg-clay-surface border-2 border-charcoal/20'
          }`}
        >
          {selected && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Icon */}
        {icon && (
          <div className={`w-12 h-12 rounded-clay flex-shrink-0 flex items-center justify-center ${
            selected ? 'bg-clay-mint' : 'bg-clay-surface'
          }`}>
            {icon}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-charcoal text-lg">{title}</span>
            {badge && (
              <span className={`px-2 py-0.5 rounded-clay-pill text-xs font-bold text-charcoal ${badgeColors[badgeColor]}`}>
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-charcoal-light mt-1">{description}</p>
          )}
        </div>
      </div>
    </button>
  )
}

interface WizardOptionGridProps {
  children: ReactNode
  columns?: 1 | 2 | 3
}

export function WizardOptionGrid({ children, columns = 2 }: WizardOptionGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {children}
    </div>
  )
}
