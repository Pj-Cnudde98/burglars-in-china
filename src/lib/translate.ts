// Translation between our languages and Chinese.
//   Text:      MyMemory (free, no key, about 5000 characters a day per connection).
//   Speaking:  the phone's own voices (speechSynthesis), which work offline.
//   Listening: the browser's speech recognition where it exists. Chrome on
//              Android has it; an installed iPhone app often does not, and the
//              microphone key on the keyboard does the same job there.

export type Lang = 'en' | 'nl' | 'zh'
export const LANGS: Record<Lang, { label: string; code: string }> = {
  en: { label: 'English', code: 'en-GB' },
  nl: { label: 'Nederlands', code: 'nl-BE' },
  zh: { label: '中文', code: 'zh-CN' }
}
export const MAX_CHARS = 300

export type Translation = { from: Lang; to: Lang; text: string; result: string }
const HISTORY_KEY = 'bic-translations'
const HISTORY_MAX = 30

export function history(): Translation[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as Translation[] } catch { return [] }
}
function remember(t: Translation) {
  const same = (x: Translation) => x.from === t.from && x.to === t.to && x.text.toLowerCase() === t.text.toLowerCase()
  const next = [t, ...history().filter((x) => !same(x))].slice(0, HISTORY_MAX)
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* storage full or blocked */ }
  return next
}

/** Translates, and keeps the answer so the same sentence works offline next time. */
export async function translate(text: string, from: Lang, to: Lang): Promise<Translation[]> {
  const known = history().find((x) => x.from === from && x.to === to && x.text.toLowerCase() === text.toLowerCase())
  if (known) return remember(known)

  const mm = (l: Lang) => (l === 'nl' ? 'nl-NL' : LANGS[l].code)
  const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${mm(from)}|${mm(to)}`)
  const j = await r.json()
  const result: string = j?.responseData?.translatedText ?? ''
  if (Number(j?.responseStatus) === 429 || result.startsWith('MYMEMORY WARNING')) throw new Error('limit')
  if (Number(j?.responseStatus) !== 200 || !result) throw new Error('failed')
  return remember({ from, to, text, result })
}

/* ------------------------------------------------------------ speaking */

export const canSpeak = () => 'speechSynthesis' in window

export function speak(text: string, lang: Lang) {
  if (!canSpeak()) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = LANGS[lang].code
  const voices = speechSynthesis.getVoices()
  const norm = (s: string) => s.replace('_', '-').toLowerCase()
  u.voice = voices.find((v) => norm(v.lang) === norm(u.lang)) ?? voices.find((v) => norm(v.lang).startsWith(lang)) ?? null
  u.rate = 0.9
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

/* ------------------------------------------------------------ listening */

// Not in TypeScript's DOM types yet.
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; abort(): void
}
function recognitionClass() {
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
export const canListen = () => Boolean(recognitionClass())

/**
 * Listens for one sentence. `onText` gets what was heard so far; `onDone` gets
 * the final sentence ("" when nothing was heard) or an error to show.
 * Returns a function that stops listening.
 */
export function listen(lang: Lang, onText: (t: string) => void, onDone: (t: string, error?: string) => void) {
  const rec = new (recognitionClass()!)()
  let heard = '', error: string | undefined
  rec.lang = LANGS[lang].code
  rec.interimResults = true
  rec.continuous = false
  rec.onresult = (e) => {
    heard = Array.from(e.results).map((r) => r[0].transcript).join('')
    onText(heard)
  }
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') error = 'The microphone is blocked. Allow it for this app in your phone settings.'
    else if (e.error === 'network') error = 'Voice input needs signal. Type instead, or use the phrasebook.'
    else if (e.error !== 'no-speech' && e.error !== 'aborted') error = 'Could not hear that. Try again.'
  }
  rec.onend = () => onDone(heard.trim(), error)
  rec.start()
  return () => rec.abort()
}
