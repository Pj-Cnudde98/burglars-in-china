import { useState } from 'react'
import { useStore } from '../lib/store'

export default function Login() {
  const { join } = useStore()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="login">
      <div className="big" aria-hidden="true">贼</div>
      <div>
        <h2>Burglars in China</h2>
        <p className="hint" style={{ margin: '6px 0 0' }}>Join the trip with the code from the group chat</p>
      </div>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true); setError(null)
        try { await join(code, name) } catch (err) {
          setError(navigator.onLine ? (err as Error).message : 'You need internet the first time you join.')
        } finally { setBusy(false) }
      }}>
        <div className="field"><label htmlFor="tripCode">Trip code</label>
          <input id="tripCode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" required placeholder="DRAGON-27" />
        </div>
        <div className="field"><label htmlFor="myName">Your name</label>
          <input id="myName" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required maxLength={40} placeholder="Use the same name every time" />
        </div>
        {error && <p className="err">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join the trip'}</button>
        <p className="hint">No password. The app remembers you on this phone.</p>
      </form>
    </div>
  )
}
