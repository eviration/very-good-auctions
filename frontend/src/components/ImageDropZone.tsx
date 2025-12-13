import { useState, useRef, useEffect, useCallback } from 'react'

interface ImageDropZoneProps {
  currentImageUrl?: string | null
  previewUrl?: string | null
  onFileSelect: (file: File) => void
  onRemove?: () => void
  aspectRatio?: 'square' | 'landscape'
  maxSizeMB?: number
  label?: string
  hint?: string
  disabled?: boolean
  className?: string
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export default function ImageDropZone({
  currentImageUrl,
  previewUrl,
  onFileSelect,
  onRemove,
  aspectRatio = 'landscape',
  maxSizeMB = 10,
  label = 'Image',
  hint,
  disabled = false,
  className = '',
}: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const validateFile = useCallback((file: File): boolean => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Invalid file type. Please use JPG, PNG, GIF, or WebP.')
      return false
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${maxSizeMB}MB.`)
      return false
    }
    setError(null)
    return true
  }, [maxSizeMB])

  const handleFile = useCallback((file: File) => {
    if (disabled) return
    if (validateFile(file)) {
      onFileSelect(file)
    }
  }, [disabled, validateFile, onFileSelect])

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('image/')) {
        handleFile(file)
      } else {
        setError('Please drop an image file.')
      }
    }
  }

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return

      // Check if the paste target is within the drop zone or is focused
      const activeElement = document.activeElement
      const dropZone = dropZoneRef.current

      // Only handle paste if the drop zone is focused or hovered
      if (!dropZone) return

      // Check if drop zone contains the active element or is the active element
      const isDropZoneFocused = dropZone.contains(activeElement) || dropZone === activeElement

      // Also check if mouse is over the drop zone (for global paste when hovering)
      const isHovering = dropZone.matches(':hover')

      if (!isDropZoneFocused && !isHovering) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            handleFile(file)
          }
          break
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [disabled, handleFile])

  const displayImage = previewUrl || currentImageUrl
  const sizeClasses = aspectRatio === 'square'
    ? 'w-32 h-32'
    : 'w-full h-32 md:h-40'

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-white mb-2">
          {label}
        </label>
      )}

      <div
        ref={dropZoneRef}
        tabIndex={0}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            !disabled && fileInputRef.current?.click()
          }
        }}
        className={`
          relative rounded-xl border-2 border-dashed transition-all cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-sage/50
          ${sizeClasses}
          ${disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : isDragging
              ? 'border-sage bg-sage/10 scale-[1.02]'
              : 'border-sage/30 hover:border-sage hover:bg-sage/5'
          }
        `}
      >
        {displayImage ? (
          <img
            src={displayImage}
            alt="Preview"
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <svg
              className={`w-10 h-10 mb-2 ${isDragging ? 'text-sage' : 'text-sage/40'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-center text-gray-500">
              {isDragging ? (
                <span className="text-sage font-medium">Drop image here</span>
              ) : (
                <>
                  <span className="font-medium text-sage">Click to upload</span>
                  <br />
                  <span className="text-xs">or drag & drop, or paste</span>
                </>
              )}
            </p>
          </div>
        )}

        {/* Drag overlay */}
        {isDragging && displayImage && (
          <div className="absolute inset-0 bg-sage/80 rounded-lg flex items-center justify-center">
            <p className="text-white font-medium">Drop to replace</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* Hint and error */}
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="flex-1">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : hint ? (
            <p className="text-xs text-gray-500">{hint}</p>
          ) : (
            <p className="text-xs text-gray-500">
              JPG, PNG, GIF or WebP. Max {maxSizeMB}MB.
            </p>
          )}
        </div>

        {/* Action buttons */}
        {displayImage && !disabled && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              className="text-xs text-sage hover:underline"
            >
              Change
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
