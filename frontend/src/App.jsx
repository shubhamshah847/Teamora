import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import FeedbackToast from './components/FeedbackToast.jsx'
import TeamChat from './components/TeamChat.jsx'
import TeamoraLogo, { TeamoraMark } from './components/TeamoraLogo.jsx'
import { io } from 'socket.io-client'
import './App.css'
// App.jsx

export const SERVER_URI = "https://teamora-aq9u.onrender.com";

const featureCards = [
  {
    title: 'Flow orchestration',
    text: 'Build projects, assign tasks, and keep every sprint moving without friction.',
  },
  {
    title: 'Live progress',
    text: 'Track updates in real time with a focused workflow built for delivery teams.',
  },
  {
    title: 'Clean decision-making',
    text: 'Turn scattered work into clear priorities and a calmer execution rhythm.',
  },
]


const stats = [
  { label: 'Teams', value: '01' },
  { label: 'Projects', value: '02' },
  { label: 'Tasks', value: '03' },
]

const steps = ['Create a workspace', 'Invite your team', 'Launch your roadmap']

const getStoredToken = () => localStorage.getItem('Teamora-token')
const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin
let accessToken = getStoredToken()
let refreshRequest = null

export const storeAccessToken = (token) => {
  accessToken = token || null
  if (accessToken) {
    localStorage.setItem('Teamora-token', accessToken)
  } else {
    localStorage.removeItem('Teamora-token')
  }
}

const getStoredUser = () => {
  try {
    const user = localStorage.getItem('Teamora-user')
    return user ? JSON.parse(user) : null
  } catch {
    return null
  }
}

async function apiRequest(url, options = {}) {
  const { headers: optionHeaders, ...fetchOptions } = options

  const sendRequest = (token) => fetch(url, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(optionHeaders || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  const readResponse = async (response) => {
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await response.json() : {}
    return { data, response }
  }

  let { data, response } = await readResponse(await sendRequest(accessToken))

  if (response.status === 401 && url !== '/auth/refresh-access-token') {
    if (!refreshRequest) {
      refreshRequest = fetch('/auth/refresh-access-token', {
        method: 'POST',
        credentials: 'include',
      })
        .then(async (refreshResponse) => {
          const contentType = refreshResponse.headers.get('content-type') || ''
          const refreshData = contentType.includes('application/json') ? await refreshResponse.json() : {}
          if (!refreshResponse.ok || !refreshData.accessToken) {
            const error = new Error(refreshData.message || 'Session expired. Please sign in again.')
            error.statusCode = refreshResponse.status
            throw error
          }
          storeAccessToken(refreshData.accessToken)
          return refreshData.accessToken
        })
        .catch((error) => {
          storeAccessToken(null)
          window.dispatchEvent(new Event('Teamora:auth-expired'))
          throw error
        })
        .finally(() => {
          refreshRequest = null
        })
    }

    const refreshedToken = await refreshRequest
      ; ({ data, response } = await readResponse(await sendRequest(refreshedToken)))
  }

  if (!response.ok) {
    const error = new Error(data.message || 'Request failed')
    error.statusCode = response.status
    throw error
  }

  return data
}

function App() {
  const [token, setToken] = useState(getStoredToken())
  const [user, setUser] = useState(getStoredUser())
  const inviteTokenRef = useRef(new URLSearchParams(window.location.search).get('invite'))
  const inviteAttemptedRef = useRef(false)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [otpCode, setOtpCode] = useState('')
  const [pendingVerification, setPendingVerification] = useState(null)
  const [status, setStatus] = useState(() => inviteTokenRef.current
    ? { type: 'info', message: 'You have a team invitation. Sign in or create an account with the invited email to accept it.' }
    : { type: '', message: '' })

  useEffect(() => {
    if (token) {
      storeAccessToken(token)
    } else {
      storeAccessToken(null)
    }
  }, [token])

  useEffect(() => {
    if (user) {
      localStorage.setItem('Teamora-user', JSON.stringify(user))
    } else {
      localStorage.removeItem('Teamora-user')
    }
  }, [user])

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null)
      setUser(null)
      setStatus({ type: 'error', message: 'Your session expired. Please sign in again.' })
    }

    window.addEventListener('Teamora:auth-expired', handleAuthExpired)
    return () => window.removeEventListener('Teamora:auth-expired', handleAuthExpired)
  }, [])

  useEffect(() => {
    if (!token || !inviteTokenRef.current || inviteAttemptedRef.current) return
    inviteAttemptedRef.current = true
    apiRequest('/teams/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: inviteTokenRef.current }),
    })
      .then(() => {
        inviteTokenRef.current = null
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('invite')
        window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
        window.location.href = '/dashboard'
      })
      .catch((error) => {
        inviteAttemptedRef.current = false
        setStatus({ type: 'error', message: error.message || 'Unable to accept the team invitation.' })
        if (error.statusCode === 403) {
          storeAccessToken(null)
          setToken(null)
          setUser(null)
          setMode('login')
          setPendingVerification(null)
          setForm((current) => ({ ...current, password: '' }))
        }
      })
  }, [token])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus({ type: 'info', message: 'creating.....' })

    try {
      const endpoint = mode === 'login' ? '/user/login' : '/user/register'
      const payload =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : { name: form.name, email: form.email, password: form.password }

      const response = await fetch(`/auth${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Something went wrong')

      if (mode === 'login') {
        const nextToken = data.accessToken || getStoredToken()
        const nextUser = data.user || { name: 'Team member', email: form.email }
        if (nextToken) storeAccessToken(nextToken)
        localStorage.setItem('Teamora-user', JSON.stringify(nextUser))
        setToken(nextToken)
        setUser(nextUser)
        if (inviteTokenRef.current) {
          setStatus({ type: 'info', message: 'Accepting your team invitation...' })
          return
        }
        setStatus({ type: 'success', message: data.message || 'Welcome back to Teamora' })
        window.location.href = '/dashboard'
      } else {
        setPendingVerification(data.pendingVerification)
        setStatus({
          type: 'success',
          message: data.message || 'Verify your email to finish creating your account.',
        })
        setMode('otp')
        setForm({ name: '', email: '', password: '' })
        setOtpCode('')
      }
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'something went wrong' })
    }
  }

  const handleVerifyOtp = async (event) => {
    event.preventDefault()
    if (!pendingVerification || !otpCode) {
      setStatus({ type: 'error', message: 'Please enter the OTP sent to your email.' })
      return
    }

    try {
      setStatus({ type: 'info', message: 'Verifying your account...' })
      const response = await fetch('/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: pendingVerification.email, otp: otpCode }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'OTP verification failed')

      const nextToken = data.accessToken || getStoredToken()
      const nextUser = data.user || { name: pendingVerification.name, email: pendingVerification.email }
      if (nextToken) storeAccessToken(nextToken)
      localStorage.setItem('Teamora-user', JSON.stringify(nextUser))
      setToken(nextToken)
      setUser(nextUser)
      setPendingVerification(null)
      setOtpCode('')
      if (inviteTokenRef.current) {
        setStatus({ type: 'info', message: 'Accepting your team invitation...' })
        return
      }
      setStatus({ type: 'success', message: data.message || 'OTP verified. Welcome to Teamora.' })
      window.location.href = '/dashboard'
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to verify OTP' })
    }
  }

  const handleResendOtp = async () => {
    if (!pendingVerification) return

    try {
      const response = await fetch('/auth/generate-new-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: pendingVerification.email }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Unable to resend OTP')
      setStatus({ type: 'success', message: data.message || 'A fresh OTP has been sent.' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to resend OTP' })
    }
  }

  const logout = async () => {
    try {
      await apiRequest('/auth/logout')
    } catch {
      // Clear the local session even if the server-side logout request fails.
    } finally {
      storeAccessToken(null)
      setToken(null)
      setUser(null)
      setStatus({ type: 'success', message: 'Signed out successfully.' })
    }
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              token={token}
              mode={mode}
              setMode={setMode}
              form={form}
              otpCode={otpCode}
              setOtpCode={setOtpCode}
              pendingVerification={pendingVerification}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
              handleVerifyOtp={handleVerifyOtp}
              handleResendOtp={handleResendOtp}
              status={status}
              user={user}
            />
          }
        />
        <Route
          path="/dashboard/*"
          element={token ? <DashboardApp user={user} token={token} onLogout={logout} onUserUpdate={setUser} /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function LandingPage({ token, mode, setMode, form, otpCode, setOtpCode, pendingVerification, handleChange, handleSubmit, handleVerifyOtp, handleResendOtp, status, user }) {
  const navigate = useNavigate()
  const [authOpen, setAuthOpen] = useState(() => Boolean(new URLSearchParams(window.location.search).get('invite')))
  const [showSplash, setShowSplash] = useState(() => {
    try {
      if (sessionStorage.getItem('teamora-splash-seen')) return false
      sessionStorage.setItem('teamora-splash-seen', 'true')
      return true
    } catch {
      return false
    }
  })
  const [splashOpening, setSplashOpening] = useState(false)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!showSplash) return undefined
    const revealTimer = window.setTimeout(() => setSplashOpening(true), 1500)
    const removeTimer = window.setTimeout(() => setShowSplash(false), 2200)
    return () => {
      window.clearTimeout(revealTimer)
      window.clearTimeout(removeTimer)
    }
  }, [showSplash])

  useEffect(() => {
    if (!authOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleDialogKeydown = (event) => {
      if (event.key === 'Escape') {
        setAuthOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleDialogKeydown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleDialogKeydown)
    }
  }, [authOpen])

  const openAuth = (nextMode) => {
    previousFocusRef.current = document.activeElement
    setMode(nextMode)
    setAuthOpen(true)
  }

  const closeAuth = () => {
    setAuthOpen(false)
    window.requestAnimationFrame(() => previousFocusRef.current?.focus?.())
  }

  const goToWorkspace = () => {
    if (token) {
      navigate('/dashboard')
    } else {
      openAuth('login')
    }
  }

  const scrollToSection = (event, sectionId) => {
    event.preventDefault()
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="Teamora-shell">
     <header className="topbar flex items-center justify-between">
  <TeamoraLogo />

  <div className="flex items-center gap-3">
    <button
      onClick={() =>
        window.open(
          "https://docs.google.com/forms/d/e/1FAIpQLSdaBY48jxR9bjHdySLWvhDKnN6KlFx0Yz8mrVRuB0qCLv3xTw/viewform",
          "_blank"
        )
      }
      className="nav-button"
    >
      Feedback
    </button>

    <button className="nav-button" type="button" onClick={goToWorkspace}>
      {token ? 'Open workspace' : 'Sign in'}
    </button>
  </div>
</header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker"><span className="hero-kicker-dot" /> Real-time work. Zero friction.</span>
            <h1>Make good work <span>move forward.</span></h1>
            <p>One focused workspace for projects, people, and the work that matters.</p>

            <div className="hero-actions">
              <button type="button" className="primary-button hero-primary" onClick={() => token ? navigate('/dashboard') : openAuth('register')}>
                {token ? 'Open your workspace' : 'Create your workspace'} <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="secondary-button hero-secondary" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                Explore Teamora
              </button>
            </div>

            <div className="stats-row">
              {stats.map((item) => (
                <div className="stat-block" key={item.label}>
                  <span className="stat-index">{item.value}</span>
                  <strong>{item.label}</strong>
                </div>
              ))}
            </div>
          </div>
          <ProductPreview />
        </section>

        <section className="features" id="features">
          <div className="section-header">
            <span className="eyebrow">Why Teamora</span>
            <h2>Command center for teams that move with intention.</h2>
          </div>

          <div className="feature-grid">
            {featureCards.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <FeatureIcon title={feature.title} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="process" id="process">
          <div className="section-header narrow">
            <span className="eyebrow">Simple process</span>
            <h2>From idea to execution in three steps.</h2>
          </div>

          <div className="steps-row">
            {steps.map((step, index) => (
              <div className="step-card" key={step}>
                <span>0{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </section>

      </main>

      <footer className="footer">
        <p>© 2026 Teamora. Thoughtful work, made visible.</p>
        <p className="creator-credit">Designed &amp; developed by <strong>Shubham Shah</strong></p>
      </footer>

      {authOpen && (
        <div className="auth-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeAuth()}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" ref={dialogRef}>
            <button type="button" className="auth-modal-close" onClick={closeAuth} aria-label="Close sign-in dialog">×</button>
            {mode !== 'otp' ? (
              <>
                <div className="auth-card-heading">
                  <span className="auth-card-mark"><TeamoraMark /></span>
                  <span className="eyebrow">Your workspace awaits</span>
                  <h2 id="auth-modal-title">{mode === 'login' ? 'Welcome back.' : 'Start with clarity.'}</h2>
                  <p>{mode === 'login' ? 'Sign in to pick up where your team left off.' : 'Create an account and bring your team together.'}</p>
                </div>
                <div className="auth-tabs" role="tablist" aria-label="Authentication">
                  <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>Sign in</button>
                  <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => setMode('register')}>Create account</button>
                </div>
              </>
            ) : (
              <div className="auth-card-heading otp-heading">
                <button type="button" className="auth-back-button" onClick={() => setMode('register')}>← Back</button>
                <span className="eyebrow">One last step</span>
                <h2 id="auth-modal-title">Check your email.</h2>
                <p>Enter the six-digit code we sent to verify your account.</p>
              </div>
            )}

            {mode === 'otp' ? (
              <form onSubmit={handleVerifyOtp} className="auth-form">
                <label><span>Verification code</span><input type="text" inputMode="numeric" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required autoFocus /></label>
                {pendingVerification && <p className="otp-note">Code sent to {pendingVerification.email}</p>}
                {status.message && <div className={`status ${status.type || 'neutral'}`} role="status" aria-live="polite">{status.message}</div>}
                <button type="submit" className="primary-button submit-button">Verify OTP</button>
                <button type="button" className="secondary-button submit-button" onClick={handleResendOtp}>Resend code</button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                {mode === 'register' && <label><span>Full name</span><input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Your name" required autoFocus /></label>}
                <label><span>Email</span><input type="email" name="email" value={form.email} onChange={handleChange} placeholder="hello@teamora.io" required autoFocus={mode === 'login'} /></label>
                <label><span>Password</span><input type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" required /></label>
                {status.message && <div className={`status ${status.type || 'neutral'}`} role="status" aria-live="polite">{status.message}</div>}
                <button type="submit" className="primary-button submit-button">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
              </form>
            )}
          </section>
        </div>
      )}

      {showSplash && <SplashScreen opening={splashOpening} />}
    </div>
  )
}

function FeatureIcon({ title }) {
  const paths = {
    'Flow orchestration': <><path d="M5 7h5l3 5h6" /><path d="m16 9 3 3-3 3" /><path d="M19 17h-5l-3-5H5" /><circle cx="5" cy="7" r="1.5" /><circle cx="5" cy="17" r="1.5" /></>,
    'Live progress': <><path d="M4 18V6" /><path d="M4 18h16" /><path d="m7 14 4-4 3 2 5-6" /><path d="M16 6h3v3" /></>,
    'Clean decision-making': <><path d="m6 12 4 4L19 7" /><path d="M20 12a8 8 0 1 1-4.1-7" /></>,
  }

  return <div className="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[title]}</svg></div>
}

function ProductPreview() {
  const columns = [
    { title: 'To do', count: '02', tasks: [{ name: 'Map onboarding flow', tag: 'Design', initials: ['AL', 'MK'] }, { name: 'Draft launch checklist', tag: 'Planning', initials: ['JS'] }] },
    { title: 'In progress', count: '03', tasks: [{ name: 'Build team dashboard', tag: 'Product', initials: ['MK', 'RD'] }, { name: 'Review sprint feedback', tag: 'Research', initials: ['AL'] }] },
    { title: 'Done', count: '04', tasks: [{ name: 'Set up workspace', tag: 'Setup', initials: ['JS', 'RD'] }, { name: 'Align project goals', tag: 'Team', initials: ['MK'] }] },
  ]

  return (
    <div className="product-preview" aria-label="Preview of a Teamora project board">
      <div className="preview-window-bar"><div className="preview-window-dots" aria-hidden="true"><i /><i /><i /></div><span>Product launch</span><span className="preview-live"><i />Live</span></div>
      <div className="preview-board-heading"><div><span className="preview-overline">TEAM WORKSPACE</span><h2>Website relaunch</h2></div><button type="button" aria-label="More board options" tabIndex="-1">•••</button></div>
      <div className="preview-board-columns">
        {columns.map((column) => (
          <section className="preview-column" key={column.title} aria-label={`${column.title} tasks`}>
            <h3><span>{column.title}</span><small>{column.count}</small></h3>
            {column.tasks.map((task) => (
              <article className="preview-task" key={task.name}>
                <strong>{task.name}</strong>
                <span className="preview-task-tag">{task.tag}</span>
                <div className="preview-task-footer"><div className="preview-avatars" aria-label={`${task.initials.length} assigned team member${task.initials.length > 1 ? 's' : ''}`}>
                  {task.initials.map((initial, index) => <span className={`preview-avatar avatar-${index + 1}`} key={initial}>{initial}</span>)}
                </div><span className="preview-task-check" aria-hidden="true">✓</span></div>
              </article>
            ))}
          </section>
        ))}
      </div>
      <div className="preview-activity"><span className="preview-activity-pulse" /><span><strong>Alex</strong> moved a task to In progress</span><small>just now</small></div>
    </div>
  )
}

function SplashScreen({ opening }) {
  return (
    <div className={`splash-screen${opening ? ' is-opening' : ''}`} aria-label="Teamora loading" role="status">
      <div className="splash-panel splash-panel-top" />
      <div className="splash-panel splash-panel-bottom" />
      <div className="splash-lockup">
        <div className="splash-symbol-frame">
          <TeamoraMark />
          <svg className="splash-hex-outline" viewBox="0 0 100 100" aria-hidden="true"><polygon points="27,4 73,4 96,27 96,73 73,96 27,96 4,73 4,27 27,4" /></svg>
        </div>
        <p className="brand-name">team<span className="brand-accent">o</span>ra</p>
      </div>
    </div>
  )
}

function DashboardApp({ user, token, onLogout, onUserUpdate }) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('Teamora-theme') || 'light')
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [invitationAction, setInvitationAction] = useState('')
  const [invitationNotice, setInvitationNotice] = useState('')

  useEffect(() => {
    localStorage.setItem('Teamora-theme', theme)
  }, [theme])

  useEffect(() => {
    let active = true
    apiRequest('/teams/invitations/pending')
      .then((data) => {
        if (active) setPendingInvitations(data.invitations || [])
      })
      .catch(() => {
        if (active) setPendingInvitations([])
      })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!logoutConfirmOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !logoutBusy) setLogoutConfirmOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [logoutConfirmOpen, logoutBusy])

  const confirmLogout = async () => {
    if (logoutBusy) return
    setLogoutBusy(true)
    try {
      await onLogout()
    } finally {
      setLogoutConfirmOpen(false)
      setLogoutBusy(false)
    }
  }

  const acceptPendingInvitation = async (invitation) => {
    const invitationKey = `${invitation.teamId}-${invitation.invitationId}`
    setInvitationAction(invitationKey)
    setInvitationNotice('')
    try {
      const data = await apiRequest(`/teams/${invitation.teamId}/invitations/${invitation.invitationId}/accept`, { method: 'POST' })
      setPendingInvitations((current) => current.filter((item) => item.invitationId !== invitation.invitationId))
      setInvitationNotice(data.message || `You joined ${invitation.teamName}.`)
    } catch (error) {
      setInvitationNotice(error.message || 'Unable to accept this invitation.')
    } finally {
      setInvitationAction('')
    }
  }

  const navigation = [
    { label: 'Overview', to: '/dashboard', end: true, icon: 'M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9ZM9 21v-7h6v7' },
    { label: 'Teams', to: '/dashboard/teams', icon: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6' },
    { label: 'Team chat', to: '/dashboard/chat', icon: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z' },
    { label: 'Projects', to: '/dashboard/projects', icon: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h5l2 2h8A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-11Z' },
    { label: 'Tasks', to: '/dashboard/tasks', icon: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01' },
    { label: 'Settings', to: '/dashboard/settings', icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.09-.03a1.7 1.7 0 0 0-1.82.54l-.05.07h-3.4l-.05-.07a1.7 1.7 0 0 0-1.82-.54l-.09.03-1.7-2.94.06-.06A1.7 1.7 0 0 0 9.4 15l-.08-.04v-3.4l.08-.04a1.7 1.7 0 0 0-.34-1.88L9 9.58l1.7-2.94.09.03a1.7 1.7 0 0 0 1.82-.54l.05-.07h3.4l.05.07a1.7 1.7 0 0 0 1.82.54l.09-.03 1.7 2.94-.06.06A1.7 1.7 0 0 0 19.4 11l.08.04v3.4l-.08.04Z' },
  ]

  return (
    <div className={`dashboard-shell ${theme === 'dark' ? 'dashboard-theme-dark' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark"><TeamoraMark /></div>
          <div className="sidebar-brand-copy"><span>team<span className="brand-accent">o</span>ra</span><small>WORKSPACE</small></div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">WORKSPACE</span>
          {navigation.map((item) => (
            <NavLink to={item.to} end={item.end} key={item.label}>
              <svg className="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
              <span>{item.label}</span>
              {item.label === 'Tasks' && <span className="sidebar-nav-arrow" aria-hidden="true">↗</span>}
            </NavLink>
          ))}
        </nav>

        <div className="user-panel">
          <div className="sidebar-user-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'N'}</div>
          <div className="sidebar-user-info"><strong>{user?.name || 'Teamora Member'}</strong><span>{user?.email || 'team@Teamora.io'}</span></div>
          <button type="button" className="logout-button" onClick={() => setLogoutConfirmOpen(true)} aria-label="Sign out" title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6" /></svg>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        {pendingInvitations.length > 0 && (
          <section className="pending-invitations-panel" aria-labelledby="pending-invitations-title">
            <div className="pending-invitations-heading">
              <div><span className="eyebrow">Team invitations</span><h2 id="pending-invitations-title">You're invited</h2></div>
              <span className="pending-invitations-count">{pendingInvitations.length}</span>
            </div>
            {invitationNotice && <p className="pending-invitation-notice" role="status">{invitationNotice}</p>}
            <div className="pending-invitation-list">
              {pendingInvitations.map((invitation) => {
                const invitationKey = `${invitation.teamId}-${invitation.invitationId}`
                return (
                  <article className="pending-invitation-row" key={invitationKey}>
                    <div><strong>{invitation.teamName}</strong><span>Invited by {invitation.invitedBy} · {invitation.role}</span></div>
                    <button type="button" className="primary-button" onClick={() => acceptPendingInvitation(invitation)} disabled={Boolean(invitationAction)}>
                      {invitationAction === invitationKey ? 'Joining…' : 'Accept invitation'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )}
        <Routes>
          <Route path="/" element={<OverviewPage token={token} user={user} />} />
          <Route path="/teams" element={<TeamsPage token={token} user={user} />} />
          <Route path="/chat" element={<TeamChat token={token} user={user} apiRequest={apiRequest} />} />
          <Route path="/projects" element={<ProjectsPage token={token} user={user} />} />
          <Route path="/tasks" element={<TasksPage token={token} user={user} />} />
          <Route path="/settings" element={<SettingsPage user={user} onUserUpdate={onUserUpdate} onRequestLogout={() => setLogoutConfirmOpen(true)} theme={theme} onThemeChange={setTheme} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      {logoutConfirmOpen && (
        <div className="logout-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !logoutBusy) setLogoutConfirmOpen(false) }}>
          <section className="logout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-dialog-title">
            <div className="logout-dialog-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6" /></svg></div>
            <span className="eyebrow">Session control</span>
            <h2 id="logout-dialog-title">Leaving so soon?</h2>
            <p>Your workspace is saved. You can securely sign back in whenever you're ready.</p>
            <div className="logout-dialog-user"><span>{user?.name?.charAt(0)?.toUpperCase() || 'N'}</span><div><strong>{user?.name || 'Teamora Member'}</strong><small>{user?.email || ''}</small></div></div>
            <div className="logout-dialog-actions"><button type="button" className="stay-button" onClick={() => setLogoutConfirmOpen(false)} disabled={logoutBusy}>Stay in workspace</button><button type="button" className="confirm-logout-button" onClick={confirmLogout} disabled={logoutBusy}>{logoutBusy ? <><span className="logout-spinner" aria-hidden="true" /> Signing out…</> : <>Sign out securely <span aria-hidden="true">↗</span></>}</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

function OverviewPage({ token, user }) {
  const [teams, setTeams] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadOverview = async () => {
      try {
        const data = await apiRequest('/teams')
        const nextTeams = data.teams || []
        setTeams(nextTeams)

        const projectResults = await Promise.all(nextTeams.map(async (team) => {
          try {
            const result = await apiRequest(`/team/get/projects/${team._id}`)
            return (result.projects || []).map((project) => ({ ...project, teamName: team.name }))
          } catch {
            return []
          }
        }))
        const projects = projectResults.flat()
        const taskResults = await Promise.all(projects.map(async (project) => {
          try {
            const result = await apiRequest(`/team/get/tasks/${project._id}`)
            return (result.tasks || []).map((task) => ({
              ...task,
              projectName: project.name,
              teamName: project.teamName,
            }))
          } catch {
            return []
          }
        }))
        setTasks(taskResults.flat())
      } catch (error) {
        setTeams([])
        setTasks([])
      } finally {
        setLoading(false)
      }
    }

    loadOverview()
  }, [token])

  useEffect(() => {
    const socket = io(socketUrl, { auth: { token } })
    const handleTaskUpdated = (updatedTask) => {
      setTasks((currentTasks) => currentTasks.map((task) => (
        task._id === updatedTask._id ? { ...task, ...updatedTask } : task
      )))
    }

    socket.on('task-updated', handleTaskUpdated)
    return () => {
      socket.off('task-updated', handleTaskUpdated)
    }
  }, [token])

  const summary = useMemo(
    () => [
      { label: 'Active teams', value: teams.length || 0 },
      { label: 'Open tasks', value: tasks.filter((task) => task.status !== 'completed').length },
      { label: 'Completion rate', value: tasks.length ? `${Math.round((tasks.filter((task) => task.status === 'completed').length / tasks.length) * 100)}%` : '0%' },
    ],
    [teams, tasks]
  )

  const openTasks = tasks.filter((task) => task.status !== 'completed').slice(0, 5)

  return (
    <div className="page-panel overview-dashboard">
      <div className="page-header">
        <div>
          <span className="eyebrow">Overview</span>
          <h2>Welcome back, {user?.name || 'Creator'}.</h2>
        </div>
      </div>

      <div className="summary-grid">
        {summary.map((item) => (
          <div className="metric-card" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="content-grid two-col">
        <div className="panel-card">
          <h3>Your Team</h3>
          {loading ? <p>Loading teams...</p> : teams.length === 0 ? <p>No teams yet.</p> : <ul className="list-stack">{teams.slice(0, 4).map((team) => <li key={team._id}>{team.name}</li>)}</ul>}
        </div>

        <div className="panel-card">
          <div className="overview-section-heading">
            <h3>Open tasks</h3>
            <NavLink to="/dashboard/tasks">View all</NavLink>
          </div>
          {loading ? <p>Loading tasks...</p> : openTasks.length === 0 ? <p>No open tasks right now.</p> : (
            <ul className="list-stack overview-task-list">
              {openTasks.map((task) => (
                <li key={task._id}>
                  <strong>{task.title}</strong>
                  <span>{task.projectName} · {task.teamName}</span>
                  <span className="overview-task-meta"><span className={`project-status status-${task.status}`}>{task.status?.replace('-', ' ')}</span><span>Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'not set'}</span></span>
                  {task.members?.length > 0 && <span>Assigned to {task.members.map((member) => member.name || member.email).join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamsPage({ token, user }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [busy, setBusy] = useState(false)
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState('member')
  const [teamProjects, setTeamProjects] = useState([])
  const [memberToRemove, setMemberToRemove] = useState(null)

  const loadTeams = async () => {
    try {
      const data = await apiRequest('/teams')
      setTeams(data.teams || [])
    } catch (error) {
      setFormStatus(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTeams()
  }, [token])

  const handleCreateTeam = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      if (modal === 'edit' && selectedTeam) {
        await apiRequest(`/teams/${selectedTeam._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, description }),
        })
      } else {
        await apiRequest('/teams', {
          method: 'POST',
          body: JSON.stringify({ name, description }),
        })
      }
      setName('')
      setDescription('')
      setSelectedTeam(null)
      setModal(null)
      setFormStatus(modal === 'edit' ? 'Team updated successfully.' : 'Team created successfully.')
      await loadTeams()
    } catch (error) {
      setFormStatus(error)
    } finally {
      setBusy(false)
    }
  }

  const openTeamForm = (team = null) => {
    setSelectedTeam(team)
    setName(team?.name || '')
    setDescription(team?.description || '')
    setFormStatus('')
    setModal(team ? 'edit' : 'create')
  }

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return
    setBusy(true)
    try {
      await apiRequest(`/teams/${selectedTeam._id}`, { method: 'DELETE' })
      setTeams((current) => current.filter((team) => team._id !== selectedTeam._id))
      setFormStatus(`“${selectedTeam.name}” was deleted.`)
      setSelectedTeam(null)
      setModal(null)
    } catch (error) {
      setFormStatus(error)
      setModal(null)
    } finally {
      setBusy(false)
    }
  }

  const openTeamDetails = async (team) => {
    setSelectedTeam(team)
    setTeamProjects([])
    setFormStatus('')
    setModal('details')
    try {
      const data = await apiRequest(`/team/get/projects/${team._id}`)
      setTeamProjects(data.projects || [])
    } catch {
      setTeamProjects([])
    }
  }

  const handleAddMember = async (event) => {
    event.preventDefault()
    if (!selectedTeam || !memberEmail.trim()) return
    setBusy(true)
    setFormStatus('')
    try {
      const data = await apiRequest(`/teams/${selectedTeam._id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail.trim(), role: memberRole }),
      })
      setSelectedTeam(data.team)
      setTeams((current) => current.map((team) => team._id === data.team._id ? data.team : team))
      setMemberEmail('')
      setMemberRole('member')
      setFormStatus(data.message)
    } catch (error) {
      setFormStatus(error)
    } finally {
      setBusy(false)
    }
  }

  const handleMemberRoleChange = async (member, role) => {
    if (!selectedTeam) return
    setBusy(true)
    setFormStatus('')
    try {
      const data = await apiRequest(`/teams/${selectedTeam._id}/members/${member.user._id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setSelectedTeam(data.team)
      setTeams((current) => current.map((team) => team._id === data.team._id ? data.team : team))
      setFormStatus('Member role updated.')
    } catch (error) {
      setFormStatus(error)
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!selectedTeam || !memberToRemove) return
    setBusy(true)
    try {
      const memberIdentifier = memberToRemove.user?._id || memberToRemove._id
      const data = await apiRequest(`/teams/${selectedTeam._id}/members/${memberIdentifier}`, { method: 'DELETE' })
      setSelectedTeam(data.team)
      setTeams((current) => current.map((team) => team._id === data.team._id ? data.team : team))
      setFormStatus(`${memberToRemove.user?.name || memberToRemove.email} was removed from the team.`)
      setMemberToRemove(null)
    } catch (error) {
      setFormStatus(error)
      setMemberToRemove(null)
    } finally {
      setBusy(false)
    }
  }

  const canManageSelectedTeam = selectedTeam && (
    selectedTeam.owner?._id === user?._id
    || selectedTeam.members?.some((member) => member.user?._id === user?._id && member.role === 'admin')
  )
  const isSelectedTeamOwner = selectedTeam?.owner?._id === user?._id

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <span className="eyebrow">Teams</span>
          <h2>Team workspace</h2>
          <p className="page-subtitle">Organize people and keep each workspace moving.</p>
        </div>
        <button type="button" className="primary-button team-create-button" onClick={() => openTeamForm()}>
          <span aria-hidden="true">＋</span> Create team
        </button>
      </div>

      <FeedbackToast message={formStatus} />

      {loading ? (
        <div className="panel-card team-empty-state">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="panel-card team-empty-state">
          <div className="team-empty-icon">N</div>
          <h3>Your team space starts here</h3>
          <p>Create a team to bring people, projects, and tasks together.</p>
          <button type="button" className="primary-button" onClick={() => openTeamForm()}>Create your first team</button>
        </div>
      ) : (
        <section className="team-grid" aria-label="Your teams">
          {teams.map((team) => (
            <article className="team-card team-card-clickable" key={team._id} onClick={() => openTeamDetails(team)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openTeamDetails(team) }} role="button" tabIndex={0} aria-label={`View ${team.name} details`}>
              <div className="team-card-top">
                <div className="team-avatar" aria-hidden="true">{team.name?.charAt(0)?.toUpperCase() || 'T'}</div>
                <div className="team-card-actions">
                  {(team.owner?._id === user?._id || team.members?.some((member) => member.user?._id === user?._id && member.role === 'admin' && member.invitationStatus !== 'pending')) && <button type="button" className="team-action-button" onClick={(event) => { event.stopPropagation(); openTeamForm(team) }} aria-label={`Edit ${team.name}`} title="Edit team">Edit</button>}
                  {team.owner?._id === user?._id && <button type="button" className="team-action-button danger" onClick={(event) => { event.stopPropagation(); setSelectedTeam(team); setModal('delete') }} aria-label={`Delete ${team.name}`} title="Delete team">Delete</button>}
                </div>
              </div>
              <h3>{team.name}</h3>
              <p>{team.description || 'No description added yet.'}</p>
              <div className="team-card-footer">
                <span>{team.members?.filter((member) => member.invitationStatus !== 'pending').length || 1} {team.members?.filter((member) => member.invitationStatus !== 'pending').length === 1 ? 'member' : 'members'}{team.members?.some((member) => member.invitationStatus === 'pending') ? ` · ${team.members.filter((member) => member.invitationStatus === 'pending').length} pending` : ''}</span>
                <span>Created {team.createdAt ? new Date(team.createdAt).toLocaleDateString() : 'recently'}</span>
              </div>
            </article>
          ))}
        </section>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
          <section className="team-modal" role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button>
            <span className="eyebrow">Team workspace</span>
            <h3 id="team-modal-title">{modal === 'edit' ? 'Edit team' : 'Create a team'}</h3>
            <p>{modal === 'edit' ? 'Update the team details.' : 'Give your team a name and a shared purpose.'}</p>
            <form className="form-stack" onSubmit={handleCreateTeam}>
              <label>
                <span>Team name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Platform team" required maxLength={80} autoFocus />
              </label>
              <label>
                <span>Description</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows="4" placeholder="What will this team work on?" maxLength={500} />
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving...' : modal === 'edit' ? 'Save changes' : 'Create team'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === 'details' && selectedTeam && (
        <div className="modal-backdrop team-details-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
          <section className="team-modal team-details-modal" role="dialog" aria-modal="true" aria-labelledby="team-details-title">
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button>
            <div className="team-details-heading">
              <div className="team-avatar">{selectedTeam.name?.charAt(0)?.toUpperCase() || 'T'}</div>
              <div><span className="eyebrow">Team workspace</span><h3 id="team-details-title">{selectedTeam.name}</h3><p>{selectedTeam.description || 'No description added yet.'}</p></div>
            </div>

            <div className="team-details-columns">
              <section className="team-detail-section">
                <div className="team-section-heading"><div><span className="eyebrow">Workspace</span><h4>Members <span className="count-pill">{selectedTeam.members?.length || 0}</span></h4></div></div>
                <ul className="member-list">
                  {(selectedTeam.members || []).map((member) => {
                    const isOwner = selectedTeam.owner?._id === member.user?._id
                    const isPending = member.invitationStatus === 'pending'
                    const memberName = member.user?.name || member.name || member.email || 'Team member'
                    const canEditRole = isSelectedTeamOwner && !isOwner && !isPending
                    const canRemove = canManageSelectedTeam && !isOwner
                    return (
                      <li className="member-row" key={member.user?._id || member._id}>
                        <div className="member-identity"><div className="member-avatar">{memberName.charAt(0).toUpperCase()}</div><div><strong>{memberName}</strong><span>{member.user?.email || member.email}</span>{isPending && <span className="invitation-pending-label">Invitation pending</span>}</div></div>
                        <div className="member-controls">
                          {canEditRole ? <select aria-label={`Role for ${memberName}`} value={member.role} disabled={busy} onChange={(event) => handleMemberRoleChange(member, event.target.value)}><option value="member">Member</option><option value="admin">Admin</option></select> : <span className={`role-pill role-${member.role}`}>{isPending ? 'Pending' : isOwner ? 'Owner · Admin' : member.role}</span>}
                          {canRemove && <button type="button" className="team-action-button danger" onClick={() => setMemberToRemove(member)} disabled={busy}>Remove</button>}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {canManageSelectedTeam && (
                  <form className="add-member-form" onSubmit={handleAddMember}>
                    <h5>Add a teammate</h5>
                    <p>They'll receive an email and join the team after accepting the invitation.</p>
                    <label><span>Email address</span><input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="colleague@example.com" required /></label>
                    <div className="add-member-actions"><select aria-label="New member role" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option value="member">Member</option>{isSelectedTeamOwner && <option value="admin">Admin</option>}</select><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Adding...' : 'Add member'}</button></div>
                  </form>
                )}
              </section>

              <section className="team-detail-section">
                <div className="team-section-heading"><div><span className="eyebrow">Delivery</span><h4>Projects <span className="count-pill">{teamProjects.length}</span></h4></div></div>
                {teamProjects.length === 0 ? <p className="team-detail-empty">No projects in this team yet.</p> : <ul className="team-project-list">{teamProjects.map((project) => <li key={project._id}><div className="project-list-mark">P</div><div><strong>{project.name}</strong><span>{project.status?.replace('-', ' ')} · Due {project.duesTime ? new Date(project.duesTime).toLocaleDateString() : 'not set'}</span></div></li>)}</ul>}
              </section>
            </div>
          </section>
        </div>
      )}

      {modal === 'details' && memberToRemove && (
        <div className="modal-backdrop confirm-layer">
          <section className="team-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="remove-member-title">
            <div className="confirm-icon" aria-hidden="true">!</div><span className="eyebrow">Remove member</span><h3 id="remove-member-title">Remove from team?</h3><p><strong>{memberToRemove.user?.name || memberToRemove.name || memberToRemove.email}</strong> {memberToRemove.invitationStatus === 'pending' ? 'will no longer be able to accept this invitation.' : "will lose access to this team's projects and tasks."}</p>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setMemberToRemove(null)}>Cancel</button><button type="button" className="primary-button delete-confirm-button" onClick={handleRemoveMember} disabled={busy}>{busy ? 'Removing...' : 'Remove member'}</button></div>
          </section>
        </div>
      )}

      {modal === 'delete' && selectedTeam && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
          <section className="team-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-team-title" aria-describedby="delete-team-description">
            <div className="confirm-icon" aria-hidden="true">!</div>
            <span className="eyebrow">Delete team</span>
            <h3 id="delete-team-title">Are you sure?</h3>
            <p id="delete-team-description">This will permanently delete <strong>{selectedTeam.name}</strong>. This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setModal(null); setSelectedTeam(null) }}>Cancel</button>
              <button type="button" className="primary-button delete-confirm-button" onClick={handleDeleteTeam} disabled={busy}>{busy ? 'Deleting...' : 'Delete team'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function ProjectsPage({ token, user }) {
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [projects, setProjects] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('planned')
  const [dueDate, setDueDate] = useState('')
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const selectedTeam = teams.find((team) => team._id === selectedTeamId)
  const canManageSelectedTeam = Boolean(selectedTeam && (
    selectedTeam.owner?._id === user?._id
    || selectedTeam.members?.some((member) => member.user?._id === user?._id && member.role === 'admin' && member.invitationStatus !== 'pending')
  ))

  useEffect(() => {
    const loadTeams = async () => {
      try {
        const data = await apiRequest('/teams')
        const nextTeams = data.teams || []
        setTeams(nextTeams)
        if (nextTeams[0] && !selectedTeamId) setSelectedTeamId(nextTeams[0]._id)
        if (nextTeams.length === 0) setLoading(false)
      } catch (error) {
        setMessage(error)
        setLoading(false)
      }
    }

    loadTeams()
  }, [token])

  useEffect(() => {
    if (!selectedTeamId) return
    const loadProjects = async () => {
      try {
        const data = await apiRequest(`/team/get/projects/${selectedTeamId}`)
        setProjects(data.projects || [])
      } catch (error) {
        setProjects([])
        setMessage(error)
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [selectedTeamId, token])

  const handleSaveProject = async (event) => {
    event.preventDefault()
    if (!selectedTeamId) return

    setBusy(true)
    try {
      const isEditing = modal === 'edit' && selectedProject
      await apiRequest(isEditing ? `/team/update/project/${selectedProject._id}` : `/team/create/project/${selectedTeamId}`, {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify({ name, description, Team: selectedTeamId, duesTime: dueDate, status }),
      })
      setName('')
      setDescription('')
      setDueDate('')
      setStatus('planned')
      setSelectedProject(null)
      setModal(null)
      setMessage(isEditing ? 'Project updated successfully.' : 'Project created successfully.')

      const data = await apiRequest(`/team/get/projects/${selectedTeamId}`)
      setProjects(data.projects || [])
    } catch (error) {
      setMessage(error)
    } finally {
      setBusy(false)
    }
  }

  const openProjectForm = (project = null) => {
    setSelectedProject(project)
    setName(project?.name || '')
    setDescription(project?.description || '')
    setDueDate(project?.duesTime ? new Date(project.duesTime).toISOString().slice(0, 10) : '')
    setStatus(project?.status || 'planned')
    setMessage('')
    setModal(project ? 'edit' : 'create')
  }

  const handleDeleteProject = async () => {
    if (!selectedProject) return
    setBusy(true)
    try {
      await apiRequest(`/team/delete/project/${selectedProject._id}`, { method: 'DELETE' })
      setProjects((current) => current.filter((project) => project._id !== selectedProject._id))
      setMessage(`“${selectedProject.name}” was deleted.`)
      setSelectedProject(null)
      setModal(null)
    } catch (error) {
      setMessage(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <span className="eyebrow">Projects</span>
          <h2>Delivery roadmap</h2>
          <p className="page-subtitle">Plan work, track delivery, and keep every team aligned.</p>
        </div>
        <div className="page-header-actions">
          {teams.length > 0 && (
            <select className="header-select" aria-label="Filter projects by team" value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>
              {teams.map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}
            </select>
          )}
          <button type="button" className="primary-button team-create-button" onClick={() => openProjectForm()} disabled={!teams.length || !canManageSelectedTeam}>
            <span aria-hidden="true">＋</span> Create project
          </button>
        </div>
      </div>

      <FeedbackToast message={message} />
      {teams.length === 0 && !loading ? (
        <div className="panel-card team-empty-state"><div className="team-empty-icon">P</div><h3>Create a team first</h3><p>Projects belong to a team. Create a team before adding a project.</p></div>
      ) : loading ? (
        <div className="panel-card team-empty-state">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="panel-card team-empty-state"><div className="team-empty-icon">P</div><h3>No projects yet</h3><p>{canManageSelectedTeam ? 'Create the first project for this team to get your roadmap started.' : 'There are no projects in this team yet.'}</p>{canManageSelectedTeam && <button type="button" className="primary-button" onClick={() => openProjectForm()}>Create project</button>}</div>
      ) : (
        <section className="team-grid" aria-label="Projects">
          {projects.map((project) => (
            <article className="team-card" key={project._id}>
              <div className="team-card-top">
                <div className="team-avatar project-avatar" aria-hidden="true">P</div>
                {canManageSelectedTeam && <div className="team-card-actions">
                  <button type="button" className="team-action-button" onClick={() => openProjectForm(project)} aria-label={`Edit ${project.name}`}>Edit</button>
                  <button type="button" className="team-action-button danger" onClick={() => { setSelectedProject(project); setModal('delete') }} aria-label={`Delete ${project.name}`}>Delete</button>
                </div>}
              </div>
              <h3>{project.name}</h3>
              <p>{project.description || 'No description added yet.'}</p>
              <div className="project-tags"><span className={`project-status status-${project.status}`}>{project.status?.replace('-', ' ')}</span><span>Due {project.duesTime ? new Date(project.duesTime).toLocaleDateString() : 'not set'}</span></div>
            </article>
          ))}
        </section>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
          <section className="team-modal" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button>
            <span className="eyebrow">Delivery roadmap</span>
            <h3 id="project-modal-title">{modal === 'edit' ? 'Edit project' : 'Create a project'}</h3>
            <p>{modal === 'edit' ? 'Update the project details and delivery status.' : 'Set up a project under the selected team.'}</p>
            <form className="form-stack" onSubmit={handleSaveProject}>
              <label><span>Project name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Website redesign" required maxLength={100} autoFocus /></label>
              <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows="3" placeholder="What will this project deliver?" required /></label>
              <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="planned">Planned</option><option value="in-progress">In progress</option><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
              <label><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving...' : modal === 'edit' ? 'Save changes' : 'Create project'}</button></div>
            </form>
          </section>
        </div>
      )}

      {modal === 'delete' && selectedProject && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
          <section className="team-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title">
            <div className="confirm-icon" aria-hidden="true">!</div><span className="eyebrow">Delete project</span><h3 id="delete-project-title">Are you sure?</h3><p>This will permanently delete <strong>{selectedProject.name}</strong>. This action cannot be undone.</p>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setModal(null); setSelectedProject(null) }}>Cancel</button><button type="button" className="primary-button delete-confirm-button" onClick={handleDeleteProject} disabled={busy}>{busy ? 'Deleting...' : 'Delete project'}</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

function TasksPage({ token, user }) {
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [tasks, setTasks] = useState([])
  const [form, setForm] = useState({ title: '', description: '', status: 'pending', dueDate: '', members: [] })
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [statusOnlyEdit, setStatusOnlyEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const teamsData = await apiRequest('/teams')
        const teamList = teamsData.teams || []
        const projectList = []

        for (const team of teamList) {
          try {
            const projectData = await apiRequest(`/team/get/projects/${team._id}`)
            projectList.push(...(projectData.projects || []).map((project) => ({
              ...project,
              teamName: team.name,
              teamOwnerId: typeof team.owner === 'object' ? team.owner?._id : team.owner,
              teamMembers: team.members || [],
            })))
          } catch {
            // ignore failed project fetches
          }
        }

        setProjects(projectList)
        if (projectList[0] && !selectedProjectId) setSelectedProjectId(projectList[0]._id)
        if (projectList.length === 0) setLoading(false)
      } catch {
        setMessage('Unable to load project tasks.')
        setLoading(false)
      }
    }

    loadProjects()
  }, [token])
  useEffect(() => {
    if (!selectedProjectId) return

    const socket = io(socketUrl, { auth: { token } })

    const handleTaskUpdated = (updatedTask) => {
      const projectId = typeof updatedTask.project === 'object'
        ? updatedTask.project?._id
        : updatedTask.project

      if (String(projectId) !== String(selectedProjectId)) return

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task._id === updatedTask._id ? updatedTask : task
        )
      )
    }


    socket.on('task-updated', handleTaskUpdated)

    return () => {
      socket.off('task-updated', handleTaskUpdated)
      socket.disconnect()
    }
  }, [selectedProjectId, token])

  useEffect(() => {
    if (!selectedProjectId) return
    const loadTasks = async () => {
      try {
        const data = await apiRequest(`/team/get/tasks/${selectedProjectId}`)
        setTasks(data.tasks || [])
      } catch (error) {
        setTasks([])
        setMessage(error)
      } finally {
        setLoading(false)
      }
    }

    loadTasks()
  }, [selectedProjectId, token])

  const handleSaveTask = async (event) => {
    event.preventDefault()
    if (!selectedProjectId) {
      setMessage('Select a project before creating a task.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const isEditing = modal === 'edit' && selectedTask
      const payload = statusOnlyEdit
        ? { status: form.status }
        : {
          title: form.title,
          description: form.description,
          status: form.status,
          ...(isEditing ? {} : { project: selectedProjectId }),
          members: form.members.filter(Boolean),
          dueDate: form.dueDate,
        }
      await apiRequest(isEditing ? `/team/update/task/${selectedTask._id}` : '/team/create/task', {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      setForm({ title: '', description: '', status: 'pending', dueDate: '', members: [] })
      setMessage(isEditing ? 'Task updated successfully.' : 'Task created successfully.')
      setSelectedTask(null)
      setModal(null)
      try {
        const data = await apiRequest(`/team/get/tasks/${selectedProjectId}`)
        setTasks(data.tasks || [])
      } catch {
        setMessage('Task saved. Refresh the page if the task list does not update.')
      }
    } catch (error) {
      setMessage(error)
    } finally {
      setBusy(false)
    }
  }

  const openTaskForm = (task = null) => {
    const currentProject = projects.find((project) => project._id === selectedProjectId)
    const userId = String(user?._id || '')
    const canManageTask = String(currentProject?.teamOwnerId || '') === userId
      || currentProject?.teamMembers?.some((member) => (
        String(typeof member.user === 'object' ? member.user?._id : member.user) === userId
        && member.role === 'admin'
      ))
    const isAssignee = task?.members?.some((member) => (
      String(typeof member === 'object' ? member?._id : member) === userId
    ))
    setStatusOnlyEdit(Boolean(task && isAssignee && !canManageTask))
    setSelectedTask(task)
    setForm({
      title: task?.title || '',
      description: task?.description || '',
      status: task?.status || 'pending',
      dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
      members: task?.members?.map((member) => typeof member === 'string' ? member : member._id) || [],
    })
    setMessage('')
    setModal(task ? 'edit' : 'create')
  }

  const handleDeleteTask = async () => {
    if (!selectedTask) return
    setBusy(true)
    try {
      await apiRequest(`/team/delete/task/${selectedTask._id}`, { method: 'DELETE' })
      setTasks((current) => current.filter((task) => task._id !== selectedTask._id))
      setMessage(`“${selectedTask.title}” was deleted.`)
      setSelectedTask(null)
      setModal(null)
    } catch (error) {
      setMessage(error)
    } finally {
      setBusy(false)
    }
  }

  const handleChange = (event) => {
    const { name, value, selectedOptions, multiple } = event.target
    const nextValue = multiple ? Array.from(selectedOptions, (option) => option.value) : value
    setForm((current) => ({ ...current, [name]: nextValue }))
  }

  const currentProject = projects.find((project) => project._id === selectedProjectId)
  const currentUserId = String(user?._id || '')
  const canManageSelectedProject = String(currentProject?.teamOwnerId || '') === currentUserId
    || currentProject?.teamMembers?.some((member) => (
      String(typeof member.user === 'object' ? member.user?._id : member.user) === currentUserId
      && member.role === 'admin'
    ))
  const isTaskAssignee = (task) => task.members?.some((member) => (
    String(typeof member === 'object' ? member?._id : member) === currentUserId
  ))

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <span className="eyebrow">Tasks</span>
          <h2>Execution traCker</h2>
          <p className="page-subtitle">Turn project plans into clear, actionable work.</p>
        </div>
        <div className="page-header-actions">
          {projects.length > 0 && (
            <select className="header-select" aria-label="Filter tasks by project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              {projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}
            </select>
          )}
          <button type="button" className="primary-button team-create-button" onClick={() => openTaskForm()} disabled={loading || !projects.length} title={!projects.length && !loading ? 'Create a project first' : undefined}>
            <span aria-hidden="true">＋</span> Ticket
          </button>
        </div>
      </div>

      <FeedbackToast message={message} />
      {loading ? (
        <div className="panel-card team-empty-state">Loading tasks...</div>
      ) : projects.length === 0 ? (
        <div className="panel-card team-empty-state"><div className="team-empty-icon">T</div><h3>Create a project first</h3><p>Tasks belong to a project. Create a project before adding tasks.</p><NavLink className="primary-button" to="/dashboard/projects">Go to projects</NavLink></div>
      ) : tasks.length === 0 ? (
        <div className="panel-card team-empty-state"><div className="team-empty-icon">T</div><h3>No tasks yet</h3><p>Add the first task to this project and turn the plan into action.</p><button type="button" className="primary-button" onClick={() => openTaskForm()}>Ticket</button></div>
      ) : (
        <section className="team-grid" aria-label="Tasks">
          {tasks.map((task) => (
            <article className="team-card" key={task._id}>
              <div className="team-card-top">
                <div className="team-avatar task-avatar" aria-hidden="true">✓</div>
                <div className="team-card-actions">
                  {(canManageSelectedProject || isTaskAssignee(task)) && (
                    <button type="button" className="team-action-button" onClick={() => openTaskForm(task)} aria-label={`${isTaskAssignee(task) && !canManageSelectedProject ? 'Update status for' : 'Edit'} ${task.title}`}>
                      {isTaskAssignee(task) && !canManageSelectedProject ? 'Update status' : 'Edit'}
                    </button>
                  )}
                  {canManageSelectedProject && <button type="button" className="team-action-button danger" onClick={() => { setSelectedTask(task); setModal('delete') }} aria-label={`Delete ${task.title}`}>Delete</button>}
                </div>
              </div>
              <h3>{task.title}</h3>
              <p>{task.description || 'No description added yet.'}</p>
              <div className="project-tags"><span className={`project-status status-${task.status}`}>{task.status?.replace('-', ' ')}</span><span>Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'not set'}</span></div>
              <div className="task-assignees"><span className="task-assignees-label">Assigned to</span>{task.members?.length ? <div className="assignee-chips">{task.members.map((member) => <span className="assignee-chip" key={member._id}>{member.name || member.email}</span>)}</div> : <span className="unassigned-label">Unassigned</span>}</div>
            </article>
          ))}
        </section>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
          <section className="team-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button>
            <span className="eyebrow">Execution tracker</span>
            <h3 id="task-modal-title">{statusOnlyEdit ? 'Update task status' : modal === 'edit' ? 'Edit task' : 'Create a task'}</h3>
            <p>{statusOnlyEdit ? 'As the assignee, you can update this task’s status.' : modal === 'edit' ? 'Update the task details and progress.' : 'Add a clear next step to the selected project.'}</p>
            <form className="form-stack" onSubmit={handleSaveTask}>
              {!statusOnlyEdit && <>
                <label><span>Project</span><select value={selectedProjectId} onChange={(event) => { setSelectedProjectId(event.target.value); setForm((current) => ({ ...current, members: [] })) }} disabled={modal === 'edit'} required>{projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}</select></label>
                <label><span>Task title</span><input name="title" value={form.title} onChange={handleChange} placeholder="Prepare launch assets" required maxLength={120} autoFocus /></label>
                <label><span>Description</span><textarea name="description" value={form.description} onChange={handleChange} rows="3" placeholder="Task details" /></label>
                <label><span>Assign team members</span><select name="members" value={form.members} onChange={handleChange} multiple size={Math.min(Math.max(currentProject?.teamMembers?.filter((member) => member.user?._id).length || 2, 2), 5)}>{(currentProject?.teamMembers || []).filter((member) => member.user?._id).map((member) => <option key={member.user._id} value={member.user._id}>{member.user.name || member.user.email} · {member.role}</option>)}</select><small className="field-hint">Use Ctrl/Command to select more than one member.</small></label>
              </>}
              <label><span>Status</span><select name="status" value={form.status} onChange={handleChange}><option value="pending">To do</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></label>
              {!statusOnlyEdit && <label><span>Due date</span><input type="date" name="dueDate" value={form.dueDate} onChange={handleChange} required /></label>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving...' : modal === 'edit' ? 'Save changes' : 'Ticket'}</button></div>
            </form>
          </section>
        </div>
      )}

      {modal === 'delete' && selectedTask && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
          <section className="team-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-task-title">
            <div className="confirm-icon" aria-hidden="true">!</div><span className="eyebrow">Delete task</span><h3 id="delete-task-title">Are you sure?</h3><p>This will permanently delete <strong>{selectedTask.title}</strong>. This action cannot be undone.</p>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setModal(null); setSelectedTask(null) }}>Cancel</button><button type="button" className="primary-button delete-confirm-button" onClick={handleDeleteTask} disabled={busy}>{busy ? 'Deleting...' : 'Delete task'}</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

function SettingsPage({ user, onUserUpdate, onRequestLogout, theme, onThemeChange }) {
  const [name, setName] = useState(user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [emailNotifications, setEmailNotifications] = useState(() => localStorage.getItem('Teamora-email-notifications') !== 'false')
  const hasPasswordInput = Boolean(currentPassword || newPassword || confirmPassword)
  const profileChanged = name.trim() !== (user?.name || '').trim()
  const hasAccountChanges = profileChanged || hasPasswordInput

  useEffect(() => {
    setName(user?.name || '')
  }, [user?.name])

  const saveAccountSettings = async (event) => {
    event.preventDefault()
    if (!hasAccountChanges) {
      setFeedback({ type: 'success', message: 'There are no changes to save.' })
      return
    }
    if (hasPasswordInput && (!currentPassword || !newPassword || !confirmPassword)) {
      setFeedback({ type: 'error', message: 'Fill in all three password fields to change your password.' })
      return
    }
    if (hasPasswordInput && newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'New password and confirmation do not match.' })
      return
    }
    if (hasPasswordInput && newPassword.length < 7) {
      setFeedback({ type: 'error', message: 'New password must be at least 7 characters.' })
      return
    }

    const payload = {}
    if (profileChanged) payload.name = name.trim()
    if (hasPasswordInput) {
      payload.currentPassword = currentPassword
      payload.newPassword = newPassword
    }

    setSaving(true)
    setFeedback({ type: '', message: '' })
    try {
      const data = await apiRequest('/auth/account', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      onUserUpdate(data.user)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFeedback({ type: 'success', message: data.message || 'Account settings saved.' })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  const handleNotificationToggle = (event) => {
    const enabled = event.target.checked
    setEmailNotifications(enabled)
    localStorage.setItem('Teamora-email-notifications', String(enabled))
  }

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <span className="eyebrow">Settings</span>
          <h2>Make Teamora yours.</h2>
          <p className="page-subtitle">Manage your account, appearance, and session preferences.</p>
        </div>
      </div>

      <FeedbackToast message={feedback.message} type={feedback.type} />

      <div className="settings-layout">
        <form className="settings-main-column" onSubmit={saveAccountSettings}>
          <section className="panel-card settings-panel">
            <div className="settings-panel-heading"><div className="settings-icon">◎</div><div><h3>Personal profile</h3><p>Update the name shown to your teammates.</p></div></div>
            <div className="settings-profile-summary"><div className="settings-profile-avatar">{(user?.name || 'N').charAt(0).toUpperCase()}</div><div><strong>{user?.name || 'Teamora Member'}</strong><span>{user?.email}</span></div><span className="verified-badge">Verified</span></div>
            <label className="settings-field"><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="Your name" /></label>
            <label className="settings-field"><span>Email address</span><input value={user?.email || ''} disabled readOnly /><small>Your verified email is used to sign in and cannot be changed here.</small></label>
            <div className="settings-form-footer"><span>Profile and password updates are saved together.</span></div>
          </section>

          <section className="panel-card settings-panel">
            <div className="settings-panel-heading"><div className="settings-icon">⌑</div><div><h3>Password &amp; security</h3><p>Use a unique password to protect your workspace.</p></div></div>
            <div className="settings-password-grid">
              <label className="settings-field"><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder="Enter current password" /></label>
              <span className="settings-password-spacer" />
              <label className="settings-field"><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={7} placeholder="At least 7 characters" /></label>
              <label className="settings-field"><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={7} placeholder="type your password again" /></label>
            </div>
            <div className="settings-form-footer"><span>Leave password fields blank to keep your current password.</span><button type="submit" className="primary-button" disabled={saving || !hasAccountChanges}>{saving ? 'Saving...' : 'Save all changes'}</button></div>
          </section>
        </form>

        <aside className="settings-side-column">
          <section className="panel-card settings-panel preference-panel">
            <div className="settings-panel-heading"><div className="settings-icon">◐</div><div><h3>Appearance</h3><p>Choose how your workspace looks.</p></div></div>
            <div className="theme-options" role="group" aria-label="Workspace theme">
              <button type="button" className={theme === 'light' ? 'theme-option selected' : 'theme-option'} onClick={() => onThemeChange('light')}><span className="theme-preview theme-preview-light"><i /><i /><i /></span><strong>Light</strong>{theme === 'light' && <span className="theme-check">✓</span>}</button>
              <button type="button" className={theme === 'dark' ? 'theme-option selected' : 'theme-option'} onClick={() => onThemeChange('dark')}><span className="theme-preview theme-preview-dark"><i /><i /><i /></span><strong>Dark</strong>{theme === 'dark' && <span className="theme-check">✓</span>}</button>
            </div>
            <div className="preference-divider" />
            <label className="settings-toggle-row"><span><strong>Email notifications</strong><small>Receive account and workspace updates.</small></span><input type="checkbox" checked={emailNotifications} onChange={handleNotificationToggle} /><i className="toggle-track" aria-hidden="true" /></label>
            <p className="preference-saved-note">Preferences are saved on this device.</p>
          </section>

          <section className="panel-card settings-panel session-panel">
            <div className="settings-panel-heading"><div className="settings-icon">↗</div><div><h3>Current session</h3><p>You are signed in to Teamora.</p></div></div>
            <div className="session-status"><span className="session-status-dot" /> Session active <span>·</span> {user?.email}</div>
            <button type="button" className="settings-signout-button" onClick={onRequestLogout}><span>Sign out of this device</span><span aria-hidden="true">→</span></button>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default App
