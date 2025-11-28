import { useState, useEffect, useCallback } from 'react'

interface CountdownResult {
  days: number
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
  isUrgent: boolean
  formatted: string
}

export function useCountdown(endTime: string | Date): CountdownResult {
  const calculateTimeLeft = useCallback((): CountdownResult => {
    const end = new Date(endTime).getTime()
    const now = Date.now()
    const diff = end - now

    if (diff <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isExpired: true,
        isUrgent: false,
        formatted: 'Ended',
      }
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    const isUrgent = diff < 2 * 60 * 60 * 1000 // Less than 2 hours

    let formatted: string
    if (days > 0) {
      formatted = `${days}d ${hours}h`
    } else if (hours > 0) {
      formatted = `${hours}h ${minutes}m`
    } else {
      formatted = `${minutes}m ${seconds}s`
    }

    return {
      days,
      hours,
      minutes,
      seconds,
      isExpired: false,
      isUrgent,
      formatted,
    }
  }, [endTime])

  const [timeLeft, setTimeLeft] = useState<CountdownResult>(calculateTimeLeft)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft())
    }, 1000)

    return () => clearInterval(timer)
  }, [calculateTimeLeft])

  return timeLeft
}
