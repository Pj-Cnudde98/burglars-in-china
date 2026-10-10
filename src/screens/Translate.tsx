import { useEffect, useRef, useState } from 'react'
import { LANGS, MAX_CHARS, canListen, canSpeak, history, listen, speak, translate, type Lang, type Translation } from '../lib/translate'
import { PHRASES } from '../lib/phrases'
import { Overlay, useToast } from '../components/ui'

const MINE_KEY = 'bic-my-language'
type Shown = { text: string; sub?: string; lang: Lang }

export default function Translate({ back }: { back: JSX.Element }) {
  const toast = useToast()
  const [mine, setMine] = useState<'en' | 'nl'>(() => {
    try { return localStorage.getItem(MINE_KEY) === 'nl' ? 'nl' : 'en' } catch { return 'en' }
  })
  const [toChinese, setToChinese] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [recent, setRecent] = useState<Translation[]>(history)
  const [answer, setAnswer] = useState<Translation | null>(null)
  const [big, setBig] = useState<Shown | null>(null)
  const [group, setGroup] = useState(PHRASES[0].group)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => { stop.current?.(); if (canSpeak()) speechSynthesis.cancel() }, [])

  const from: Lang = toChinese ? mine : 'zh'
  const to: Lang = toChinese ? 'zh' : mine

  const run = async (input = text) => {
    const q = input.trim().slice(0, MAX_CHARS)
    if (!q || busy) return
    setBusy(true)
    try {
      const list = await translate(q, from, to)
      setRecent(list)
      setAnswer(list[0])
      speak(list[0].result, to)
    } catch (e) {
      toast((e as Error).message === 'limit' ? 'The free translations for today are used up. The phrasebook still works.'
        : navigator.onLine ? 'Could not translate that. Try again.' : 'Translating needs signal. The phrasebook below works offline.')
    } finally { setBusy(false) }
  }

  const mic = () => {
    if (listening) { stop.current?.(); return }
    setListening(true)
    setAnswer(null)
    try {
      stop.current = listen(from, setText, (heard, error) => {
        setListening(false)
        stop.current = null
        if (error) toast(error)
        else if (heard) { setText(heard); run(heard) }
      })
    } catch {
      setListening(false)
      toast('Could not start the microphone.')
    }
  }

  const pickMine = (l: 'en' | 'nl') => {
    setMine(l); setAnswer(null)
    try { localStorage.setItem(MINE_KEY, l) } catch { /* ignore */ }
  }
  const reuse = (t: Translation) => {
    const theirs = t.from === 'zh' ? t.to : t.from
    if (theirs !== 'zh') pickMine(theirs)
    setToChinese(t.to === 'zh'); setText(t.text); setAnswer(t)
    speak(t.result, t.to)
  }
  const swap = () => { setToChinese(!toChinese); setText(''); setAnswer(null) }

  return (
    <div className="stack">
      {back}
      <h2 style={{ margin: 0 }}>Translate</h2>

      <div className="card stack">
        <div className="row">
          <div className="seg" style={{ flex: 1 }}>
            {(['en', 'nl'] as const).map((l) => <button key={l} type="button" aria-pressed={mine === l} onClick={() => pickMine(l)}>{LANGS[l].label}</button>)}
          </div>
          <button type="button" className="swap" onClick={swap} aria-label="Swap direction">{toChinese ? '→' : '←'}</button>
          <span className="zh" style={{ fontWeight: 700, fontSize: 17 }}>中文</span>
        </div>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run() }}>
          <textarea className="tin" lang={LANGS[from].code} value={text} maxLength={MAX_CHARS} onChange={(e) => { setText(e.target.value); setAnswer(null) }}
            placeholder={listening ? 'Listening…' : toChinese ? `Type or say something in ${LANGS[mine].label}` : '请说话或输入中文'} aria-label={`Text in ${LANGS[from].label}`} />
          <div className="row">
            {canListen() && (
              <button type="button" className={`btn ${listening ? '' : 'ghost'}`} onClick={mic} aria-pressed={listening}>
                {listening ? '■ Stop' : `🎤 Speak ${LANGS[from].label}`}
              </button>
            )}
            <button className="btn" type="submit" disabled={busy || !text.trim()} style={{ flex: 1 }}>{busy ? 'Translating…' : 'Translate'}</button>
          </div>
        </form>
        {!canListen() && <div className="muted" style={{ fontSize: 12 }}>To talk instead of type, tap the microphone key on your keyboard.</div>}

        {answer && (
          <div className="tout">
            <div className={to === 'zh' ? 'zh big' : 'big'} lang={LANGS[to].code}>{answer.result}</div>
            <div className="row">
              {canSpeak() && <button type="button" className="btn ghost sm" onClick={() => speak(answer.result, to)}>🔊 Play</button>}
              <button type="button" className="btn ghost sm" onClick={() => setBig({ text: answer.result, sub: answer.text, lang: to })}>Show big</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn sm" onClick={swap}>{toChinese ? 'Their answer' : 'My turn'}</button>
            </div>
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row between"><h3>Phrasebook</h3><span className="chip off"><span className="dot" />Offline</span></div>
        <div className="filters">
          {PHRASES.map((g) => <button key={g.group} aria-pressed={g.group === group} onClick={() => setGroup(g.group)}>{g.group}</button>)}
        </div>
        <div className="card">
          {PHRASES.find((g) => g.group === group)!.items.map((p) => (
            <div className="phrase" key={p.en}>
              <button type="button" className="say" onClick={() => speak(p.zh, 'zh')} aria-label={`Play: ${p.en}`}>
                <span className="muted" style={{ fontSize: 12 }}>{p.en}</span>
                <span className="zh" lang="zh-CN">{p.zh}</span>
                <span className="py">{p.py}</span>
              </button>
              <button type="button" className="icon-btn" onClick={() => setBig({ text: p.zh, sub: `${p.py} · ${p.en}`, lang: 'zh' })}>Show</button>
            </div>
          ))}
          {group === 'Emergency' && <div className="muted" style={{ fontSize: 12, paddingTop: 10 }}>Police 110 · Ambulance 120 · Fire 119</div>}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row between"><h3>Recent</h3><span className="muted" style={{ fontSize: 12 }}>Saved on this phone</span></div>
          <div className="card">
            {recent.map((t, i) => (
              <button type="button" className="phrase say" key={i} onClick={() => reuse(t)}>
                <span className="muted" style={{ fontSize: 12 }}>{t.text}</span>
                <span className={t.to === 'zh' ? 'zh' : ''}>{t.result}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {big && (
        <Overlay>
          <div className="showbig" onClick={() => setBig(null)}>
            <div className={big.lang === 'zh' ? 'zh text' : 'text'} lang={LANGS[big.lang].code}>{big.text}</div>
            {big.sub && <div className="sub">{big.sub}</div>}
            <div className="row" onClick={(e) => e.stopPropagation()}>
              {canSpeak() && <button type="button" className="btn" onClick={() => speak(big.text, big.lang)}>🔊 Play</button>}
              <button type="button" className="btn ghost" style={{ color: 'var(--ink)', borderColor: '#b9a99a' }} onClick={() => setBig(null)}>Close</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
