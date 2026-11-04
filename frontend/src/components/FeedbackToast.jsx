import { useEffect, useState } from 'react'

export default function FeedbackToast({ message, type }) {
  const [visible, setVisible] = useState(Boolean(message))
  const isErrorObject = message instanceof Error
  const messageText = isErrorObject ? message.message : String(message || '')
  const statusCode = isErrorObject ? message.statusCode : message?.statusCode
  const normalizedMessage = messageText.toLowerCase()
  const inferredType = type || (
    typeof statusCode === 'number' && statusCode > 400
      ? 'error'
      : isErrorObject
        ? 'error'
        : /warning|partially|but .*could not/.test(normalizedMessage)
          ? 'warning'
          : /unable|failed|error|invalid|could not|not found|expired|cannot|required|already|only the owner/.test(normalizedMessage)
            ? 'error'
            : 'success'
  )

  useEffect(() => {
    setVisible(Boolean(message))
    if (!message) return undefined
    const timer = window.setTimeout(() => setVisible(false), 5200)
    return () => window.clearTimeout(timer)
  }, [message])

  if (!message || !visible) return null

  const icon = inferredType === 'error' ? '×' : inferredType === 'warning' ? '!' : '✓'
  const title = inferredType === 'error'
    ? (statusCode ? `Request failed · ${statusCode}` : 'Action needed')
    : inferredType === 'warning' ? 'Heads up' : 'Success'

  return (
    <div className={`feedback-toast feedback-toast-${inferredType}`} role={inferredType === 'error' ? 'alert' : 'status'} aria-live={inferredType === 'error' ? 'assertive' : 'polite'}>
      <span className="feedback-toast-icon" aria-hidden="true">{icon}</span>
      <span className="feedback-toast-copy"><strong>{title}</strong><span>{messageText}</span></span>
      <button type="button" className="feedback-toast-close" onClick={() => setVisible(false)} aria-label="Dismiss notification">×</button>
      <span className="feedback-toast-progress" aria-hidden="true" />
    </div>
  )
}
