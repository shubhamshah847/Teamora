import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TeamoraMark } from '../components/TeamoraLogo.jsx'
import api, { initializeAuth, setAccessToken } from './axios.js'
export const SERVER_URI = 'http://localhost:3001'
const AuthContext = createContext(null)

// export const getStoredToken = () => localStorage.getItem('Teamora-token')
//export const storeAccessToken = (accessToken) => accessToken ? localStorage.setItem('Teamora-token', accessToken) : localStorage.removeItem('Teamora-token')
export const getStoredUser = () => {
    try {
        const user = localStorage.getItem('Teamora-user')
        return user ? JSON.parse(user) : null
    } catch {
        return null
    }
}

// export async function api(url, options = {}) {
// 	const { headers: optionHeaders, ...fetchOptions } = options
// 	const response = await fetch(`${SERVER_URI}${url}`, {
// 		...fetchOptions,
// 		credentials: 'include',
// 		headers: {
// 			'Content-Type': 'application/json',
// 			...(optionHeaders || {}),
// 			...(getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {}),
// 		},
// 	})
// 	const contentType = response.headers.get('content-type') || ''
// 	const data = contentType.includes('application/json') ? await response.json() : {}
// 	if (!response.ok) {
// 		const error = new Error(data.message || 'Request failed')
// 		error.statusCode = response.status
// 		throw error
// 	}
// 	return data
// }



export function AuthProvider({ children }) {
    const navigate = useNavigate()
    const inviteTokenRef = useRef(new URLSearchParams(window.location.search).get('invite'))
    const inviteAttemptedRef = useRef(false)
    const [token, setToken] = useState(null)
    const [authLoading, setAuthLoading] = useState(true)
    const [user, setUser] = useState(getStoredUser())
    const [mode, setMode] = useState('login')
    const [form, setForm] = useState({ name: '', email: '', password: '' })
    const [otpCode, setOtpCode] = useState('')
    const [pendingVerification, setPendingVerification] = useState(null)
    const [status, setStatus] = useState(() => inviteTokenRef.current ? { type: 'info', message: 'You have a team invitation. Sign in or create an account with the invited email to accept it.' } : { type: '', message: '' })

    useEffect(() => {
        setAccessToken(token)
    }, [token])

    useEffect(() => {
        let active = true
        initializeAuth().then((restoredToken) => {
            if (!active) return
            setToken(restoredToken)
            setAuthLoading(false)
        })
        return () => { active = false }
    }, [])
    useEffect(() => {
        if (user) localStorage.setItem('Teamora-user', JSON.stringify(user))
        else localStorage.removeItem('Teamora-user')
    }, [user])   // for user data stored
    useEffect(() => {
        const handleAuthExpired = () => {
            setToken(null)
            setUser(null)
            setStatus({ type: 'error', message: 'Your session expired. Please sign in again.' })
        }
        window.addEventListener('Teamora:auth-expired', handleAuthExpired)
        return () => window.removeEventListener('Teamora:auth-expired', handleAuthExpired)
    }, [])
    // useEffect(() => {
    // 	if (!token || !inviteTokenRef.current || inviteAttemptedRef.current) return
    // 	inviteAttemptedRef.current = true
    // 	api.post('/teams/invitations/accept', { token: inviteTokenRef.current })
    // 		.then(() => {
    // 			inviteTokenRef.current = null
    // 			const cleanUrl = new URL(window.location.href)
    // 			cleanUrl.searchParams.delete('invite')
    // 			window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
    // 			window.location.href = '/dashboard'
    // 		})
    // 		.catch((error) => {
    // 			inviteAttemptedRef.current = false
    // 			setStatus({ type: 'error', message: error.message || 'Unable to accept the team invitation.' })
    // 			if (error.statusCode === 403) {
    // 				setToken(null)
    // 				setUser(null)
    // 				setMode('login')
    // 				setPendingVerification(null)
    // 				setForm((current) => ({ ...current, password: '' }))
    // 			}
    // 		})
    // }, [setAccessToken])

    const handleChange = (event) => {
        const { name, value } = event.target
        setForm((current) => ({ ...current, [name]: value }))
    }
    const handleSubmit = async (event) => {
        event.preventDefault()
        setStatus({ type: 'info', message: 'checking.....' })
        try {
            const endpoint = mode === 'login' ? '/user/login' : '/user/register'
            const payload = mode === 'login' ? { email: form.email, password: form.password } : { name: form.name, email: form.email, password: form.password }
            const { data } = await api.post(`/auth${endpoint}`, payload)
            if (mode === 'login') {
                setAccessToken(data?.accessToken)
                setToken(data?.accessToken || null)
                setUser(data.user || { name: 'Team member', email: form.email })
                if (inviteTokenRef.current) {
                    setStatus({ type: 'info', message: 'Accepting your team invitation...' })
                    return
                }
                setStatus({ type: 'success', message: data.message || 'Welcome back to Teamora' })
                navigate('/dashboard')
            } else {
                setPendingVerification(data.pendingVerification)
                setStatus({ type: 'success', message: data.message || 'Verify your email to finish creating your account.' })
                setMode('otp')
                setForm({ name: '', email: form.email, password: '' })
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
            const { data } = await api.post('/auth/verify-otp', { email: pendingVerification.email, otp: otpCode })
            setAccessToken(data.accessToken)
            setToken(data?.accessToken || null)
            setUser(data.user || { name: pendingVerification.name, email: pendingVerification.email })
            setPendingVerification(null)
            setOtpCode('')
            if (inviteTokenRef.current) {
                setStatus({ type: 'info', message: 'Accepting your team invitation...' })
                return
            }
            setStatus({ type: 'success', message: data.message || 'OTP verified. Welcome to Teamora.' })
            setAccessToken(data?.accessToken)
            navigate('/dashboard')
        } catch (error) {
            setStatus({ type: 'error', message: error.message || 'Unable to verify OTP' })
        }
    }
    const handleResendOtp = async () => {
        if (!pendingVerification) return
        try {
            const { data } = await api.post('/auth/generate-new-otp', { email: pendingVerification.email })
            setStatus({ type: 'success', message: data.message || 'A fresh OTP has been sent.' })
        } catch (error) {
            setStatus({ type: 'error', message: error.message || 'Unable to resend OTP' })
        }
    }
    const logout = async () => {
        try { await api.post('/auth/logout') } catch (err) { message: `err.message` || "something went wrong" }
        setAccessToken(null)
        setToken(null)
        setUser(null)
        setStatus({ type: 'success', message: 'Signed out successfully.' })
    }

    return <AuthContext.Provider value={{ token, user, setUser, mode, setMode, form, otpCode, setOtpCode, pendingVerification, handleChange, handleSubmit, handleVerifyOtp, handleResendOtp, status, logout, authLoading }}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }

export function AuthModal({ open, onClose }) {
    const { mode, setMode, form, otpCode, setOtpCode, pendingVerification, handleChange, handleSubmit, handleVerifyOtp, handleResendOtp, status } = useAuth()
    useEffect(() => {
        if (!open) return undefined
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [open, onClose])
    if (!open) return null
    return (
        <div className="auth-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
                <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close sign-in dialog">×</button>
                {mode !== 'otp' ? <>
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
                </> : <div className="auth-card-heading otp-heading">
                    <button type="button" className="auth-back-button" onClick={() => setMode('register')}>← Back</button>
                    <span className="eyebrow">One last step</span>
                    <h2 id="auth-modal-title">Check your email.</h2>
                    <p>Enter the six-digit code we sent to verify your account.</p>
                </div>}
                {mode === 'otp' ? <form onSubmit={handleVerifyOtp} className="auth-form">
                    <label><span>Verification code</span><input type="text" inputMode="numeric" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required autoFocus /></label>
                    {pendingVerification && <p className="otp-note">Code sent to {pendingVerification.email}</p>}
                    {status.message && <div className={`status ${status.type || 'neutral'}`} role="status" aria-live="polite">{status.message}</div>}
                    <button type="submit" className="primary-button submit-button">Verify OTP</button>
                    <button type="button" className="secondary-button submit-button" onClick={handleResendOtp}>Resend code</button>
                </form> : <form onSubmit={handleSubmit} className="auth-form">
                    {mode === 'register' && <label><span>Full name</span><input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Your name" required autoFocus /></label>}
                    <label><span>Email</span><input type="email" name="email" value={form.email} onChange={handleChange} placeholder="hello@teamora.io" required autoFocus={mode === 'login'} /></label>
                    <label><span>Password</span><input type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" required /></label>
                    {status.message && <div className={`status ${status.type || 'neutral'}`} role="status" aria-live="polite">{status.message}</div>}
                    <button type="submit" className="primary-button submit-button">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
                </form>}
            </section>
        </div>
    )
}
