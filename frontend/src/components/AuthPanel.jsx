import { useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase.js'

export default function AuthPanel({ session, onClose }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function sendMagicLink(event) {
    event.preventDefault()
    if (!supabaseConfigured || !supabase) {
      setMessage('Supabase is not configured in the frontend environment yet.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw error
      setMessage('Magic link sent. Open the email on this device to sign in.')
    } catch (error) {
      setMessage(error.message || 'Unable to send sign-in link')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    setBusy(true)
    await supabase.auth.signOut()
    setBusy(false)
    onClose?.()
  }

  return (
    <div className="auth-panel glass-panel" role="dialog" aria-label="GreenRoute account">
      <div className="auth-head">
        <div>
          <span>GREENROUTE CLOUD</span>
          <h3>{session ? 'Your account' : 'Sign in to sync trips'}</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close account panel">×</button>
      </div>

      {session ? (
        <div className="signed-in-block">
          <div className="user-orb">{(session.user.email || 'G').charAt(0).toUpperCase()}</div>
          <div><strong>{session.user.email}</strong><small>Trip history and dashboard sync enabled</small></div>
          <button type="button" className="secondary-btn" onClick={signOut} disabled={busy}>Sign out</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={sendMagicLink}>
          <p>No password needed. GreenRoute sends a secure Supabase magic link to your email.</p>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" /></label>
          <button type="submit" className="optimize-btn" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}<span>→</span></button>
        </form>
      )}
      {message && <p className="auth-message">{message}</p>}
    </div>
  )
}
