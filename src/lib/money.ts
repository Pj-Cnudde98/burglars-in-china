import { useEffect, useState } from 'react'
import type { Expense } from './types'

// Everything is counted in yuan. An expense paid in another currency keeps the
// exchange rate of the moment it was saved, so balances do not drift later.

export const HOME_CURRENCIES = ['EUR', 'USD', 'GBP'] as const
export type Currency = 'CNY' | (typeof HOME_CURRENCIES)[number]
export const SYMBOL: Record<string, string> = { CNY: '¥', EUR: '€', USD: '$', GBP: '£' }

export function money(amount: number, currency: string, digits = 0) {
  return `${SYMBOL[currency] ?? currency + ' '}${Math.abs(amount).toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** What an expense cost, in yuan. */
export const inYuan = (e: Pick<Expense, 'amount' | 'rate'>) => Number(e.amount) * Number(e.rate ?? 1)

/** Per member: above zero means the group owes them, below zero means they owe the group. */
export function balances(expenses: Expense[]) {
  const bal = new Map<string, number>()
  const add = (id: string, n: number) => bal.set(id, (bal.get(id) ?? 0) + n)
  for (const e of expenses) {
    if (!e.split_with.length) continue
    const total = inYuan(e)
    add(e.paid_by, total)
    for (const m of e.split_with) add(m, -total / e.split_with.length)
  }
  return bal
}

export type Transfer = { from: string; to: string; amount: number }

/** The payments that clear all balances: the biggest debtor pays the biggest creditor, and so on. */
export function settleUp(bal: Map<string, number>): Transfer[] {
  const owes = [...bal].filter(([, v]) => v <= -0.5).map(([id, v]) => ({ id, left: -v })).sort((a, b) => b.left - a.left)
  const gets = [...bal].filter(([, v]) => v >= 0.5).map(([id, v]) => ({ id, left: v })).sort((a, b) => b.left - a.left)
  const out: Transfer[] = []
  let i = 0, j = 0
  while (i < owes.length && j < gets.length) {
    const amount = Math.min(owes[i].left, gets[j].left)
    if (Math.round(amount) >= 1) out.push({ from: owes[i].id, to: gets[j].id, amount: Math.round(amount) })
    owes[i].left -= amount
    gets[j].left -= amount
    if (owes[i].left < 0.5) i++
    if (gets[j].left < 0.5) j++
  }
  return out
}

/* ------------------------------------------------------------ exchange rates */

// Frankfurter: free, no key, European Central Bank rates, one new rate per working day.
export type Rates = { date: string; fetchedAt: number; perYuan: Record<string, number> }
const RATES_KEY = 'bic-rates'
const HOME_KEY = 'bic-home-currency'
const STALE_MS = 6 * 60 * 60 * 1000

function saved<T>(key: string): T | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null } catch { return null }
}

/** The last known rates, refreshed when there is signal. Null until they have been fetched once. */
export function useRates() {
  const [rates, setRates] = useState<Rates | null>(() => saved<Rates>(RATES_KEY))
  useEffect(() => {
    if (rates && Date.now() - rates.fetchedAt < STALE_MS) return
    let alive = true
    fetch(`https://api.frankfurter.dev/v1/latest?base=CNY&symbols=${HOME_CURRENCIES.join(',')}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.rates) return
        const next: Rates = { date: j.date, fetchedAt: Date.now(), perYuan: j.rates }
        setRates(next)
        try { localStorage.setItem(RATES_KEY, JSON.stringify(next)) } catch { /* storage full or blocked */ }
      })
      .catch(() => {})
    return () => { alive = false }
  }, []) // once per visit to the screen
  return rates
}

/** The currency amounts are also shown in, next to yuan. Remembered on this phone. */
export function useHomeCurrency() {
  const [home, setHome] = useState<Currency>(() => {
    const s = saved<Currency>(HOME_KEY)
    return s && (HOME_CURRENCIES as readonly string[]).includes(s) ? s : 'EUR'
  })
  const set = (c: Currency) => {
    setHome(c)
    try { localStorage.setItem(HOME_KEY, JSON.stringify(c)) } catch { /* ignore */ }
  }
  return [home, set] as const
}

/** How many yuan one unit of `currency` is worth, or null when the rate is not known yet. */
export function yuanPer(currency: string, rates: Rates | null) {
  if (currency === 'CNY') return 1
  const r = rates?.perYuan[currency]
  return r ? 1 / r : null
}
