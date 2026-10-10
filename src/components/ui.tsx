import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Draws over the whole app column, wherever the screen underneath is scrolled to. */
export function Overlay({ children }: { children: ReactNode }) {
  return createPortal(children, document.querySelector('.phone') ?? document.body)
}

export function Sheet({ title, onClose, onSubmit, children, submitLabel = 'Save', busy, extra }: {
  title: string; onClose: () => void; onSubmit: (e: FormEvent) => void; children: ReactNode
  submitLabel?: string; busy?: boolean; extra?: ReactNode
}) {
  return (
    <Overlay>
      <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <form className="panel" onSubmit={(e) => { e.preventDefault(); onSubmit(e) }}>
          <h3>{title}</h3>
          {children}
          <div className="row">
            <button className="btn ghost" type="button" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button className="btn" type="submit" disabled={busy} style={{ flex: 1 }}>{busy ? 'Saving…' : submitLabel}</button>
          </div>
          {extra}
        </form>
      </div>
    </Overlay>
  )
}

export function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>
}

const ToastCtx = createContext<(msg: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const t = useRef<number>()
  const show = useCallback((m: string) => {
    setMsg(m); clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(null), 2200)
  }, [])
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>
}
export const useToast = () => useContext(ToastCtx)

export const RANK = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
export const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?'
