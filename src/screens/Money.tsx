import { useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { fmtShort } from '../lib/dates'
import { HOME_CURRENCIES, SYMBOL, balances, inYuan, money, settleUp, useHomeCurrency, useRates, yuanPer, type Currency, type Rates, type Transfer } from '../lib/money'
import { Field, Sheet, initial, useToast } from '../components/ui'
import type { Expense } from '../lib/types'

export default function Money({ back }: { back: JSX.Element }) {
  const { data, session, memberName } = useStore()
  const toast = useToast()
  const rates = useRates()
  const [home, setHome] = useHomeCurrency()
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)

  const bal = balances(data.expenses)
  const total = data.expenses.filter((e) => !e.is_settlement).reduce((a, e) => a + inYuan(e), 0)
  const mine = bal.get(session!.memberId) ?? 0
  const people = [...bal.entries()].filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => b[1] - a[1])
  const transfers = settleUp(bal)

  const perYuan = rates?.perYuan[home]
  const yuan = (n: number) => money(Math.round(n), 'CNY')
  const alsoHome = (n: number) => (perYuan ? ` ≈ ${money(n * perYuan, home, Math.abs(n * perYuan) < 100 ? 2 : 0)}` : '')

  // Recorded as a payment from one person to the other, which brings both balances back to zero.
  const markPaid = async (t: Transfer) => {
    if (!confirm(`Mark ${yuan(t.amount)} from ${memberName(t.from)} to ${memberName(t.to)} as paid?`)) return
    const { error } = await supabase.from('expenses').insert({
      trip_id: session!.tripId, description: 'Settle up', amount: t.amount, currency: 'CNY', rate: 1,
      paid_by: t.from, split_with: [t.to], is_settlement: true, created_by: session!.memberId
    })
    toast(error ? (navigator.onLine ? 'Could not save. Try again.' : 'You are offline. Try again with signal.') : 'Marked as paid')
  }

  return (
    <div className="stack">
      {back}
      <div className="row between"><h2 style={{ margin: 0 }}>Expenses</h2><button className="btn sm" onClick={() => setEditing({ paid_by: session!.memberId, split_with: data.members.map((m) => m.id), currency: 'CNY' })}>+ Add</button></div>

      <Converter rates={rates} home={home} setHome={setHome} />

      <div className="bal">
        <div className="card"><span className="muted" style={{ fontSize: 12 }}>Group total</span><b>{yuan(total)}</b><span className="muted" style={{ fontSize: 12 }}>{alsoHome(total)}</span></div>
        <div className="card"><span className="muted" style={{ fontSize: 12 }}>{mine >= 0 ? 'You get back' : 'You owe'}</span><b className={mine >= 0 ? 'pos' : 'neg'}>{yuan(mine)}</b><span className="muted" style={{ fontSize: 12 }}>{alsoHome(Math.abs(mine))}</span></div>
      </div>

      {people.length > 0 && (
        <div className="card stack">
          <h3>Balances</h3>
          {people.map(([id, v]) => (
            <div key={id} className="row between"><span>{memberName(id)}</span><b className={`num ${v >= 0 ? 'pos' : 'neg'}`}>{v >= 0 ? '+' : '−'}{yuan(v)}</b></div>
          ))}
        </div>
      )}

      {data.expenses.length > 0 && (
        <div className="card stack">
          <div><h3>Settle up</h3><div className="muted" style={{ fontSize: 12 }}>A short list of payments that makes everyone even.</div></div>
          {transfers.length === 0 && <p className="muted" style={{ margin: 0 }}>Everyone is even. 干杯!</p>}
          {transfers.map((t) => {
            const involved = t.from === session!.memberId || t.to === session!.memberId || session!.isAdmin
            return (
              <div key={`${t.from}-${t.to}`} className="row between">
                <div style={{ minWidth: 0 }}>
                  <div><b>{memberName(t.from)}</b> <span className="muted">pays</span> <b>{memberName(t.to)}</b></div>
                  <div className="num muted" style={{ fontSize: 13 }}><b style={{ color: 'var(--paper)' }}>{yuan(t.amount)}</b>{alsoHome(t.amount)}</div>
                </div>
                {involved && <button className="btn ghost sm" onClick={() => markPaid(t)}>Paid</button>}
              </div>
            )
          })}
        </div>
      )}

      <div className="card">
        {data.expenses.length === 0 && <p className="muted" style={{ margin: 0 }}>No expenses yet.</p>}
        {[...data.expenses].reverse().map((e) => {
          const canEdit = e.created_by === session!.memberId || session!.isAdmin
          const foreign = e.currency !== 'CNY'
          return (
            <div className="exp" key={e.id} onClick={() => canEdit && setEditing(e)}>
              <span className={`av ${e.paid_by === session!.memberId ? 'me' : ''}`}>{e.is_settlement ? '⇄' : initial(memberName(e.paid_by))}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{e.is_settlement ? `${memberName(e.paid_by)} paid ${memberName(e.split_with[0])} back` : e.description}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {e.is_settlement ? fmtShort(e.created_at.slice(0, 10))
                    : `${memberName(e.paid_by)} paid · split ${e.split_with.length} ways · ${yuan(inYuan(e) / e.split_with.length)} each`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b className="num">{foreign ? money(Number(e.amount), e.currency, 2) : yuan(Number(e.amount))}</b>
                {foreign && <div className="num muted" style={{ fontSize: 12 }}>{yuan(inYuan(e))}</div>}
              </div>
            </div>
          )
        })}
      </div>
      {editing && <ExpenseSheet value={editing} rates={rates} onClose={() => setEditing(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------ converter */

function Converter({ rates, home, setHome }: { rates: Rates | null; home: Currency; setHome: (c: Currency) => void }) {
  const [amount, setAmount] = useState('100')
  const [from, setFrom] = useState<'CNY' | 'home'>('CNY')
  const perYuan = rates?.perYuan[home]
  const n = Number(amount.replace(',', '.'))
  const result = !perYuan || !Number.isFinite(n) ? null : from === 'CNY' ? n * perYuan : n / perYuan
  const [a, b] = from === 'CNY' ? ['CNY', home] : [home, 'CNY']

  return (
    <div className="card stack">
      <div className="row between">
        <h3>Converter</h3>
        <select aria-label="Your currency" className="mini" value={home} onChange={(e) => setHome(e.target.value as Currency)}>
          {HOME_CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
        </select>
      </div>
      <div className="conv">
        <label><span>{SYMBOL[a]} {a}</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} aria-label={`Amount in ${a}`} /></label>
        <button type="button" className="swap" onClick={() => { setFrom(from === 'CNY' ? 'home' : 'CNY'); if (result != null) setAmount(String(Math.round(result * 100) / 100)) }} aria-label="Swap currencies">⇄</button>
        <div><span>{SYMBOL[b]} {b}</span><output>{result == null ? '–' : result.toLocaleString('en', { maximumFractionDigits: 2 })}</output></div>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {perYuan
          ? `${SYMBOL[home]}1 = ¥${(1 / perYuan).toFixed(2)} · ¥100 = ${SYMBOL[home]}${(100 * perYuan).toFixed(2)} · rate of ${fmtShort(rates!.date)}`
          : 'The exchange rate appears when you have signal. After that it also works offline.'}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ add / edit */

function ExpenseSheet({ value, rates, onClose }: { value: Partial<Expense>; rates: Rates | null; onClose: () => void }) {
  const { data, session } = useStore()
  const toast = useToast()
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  const split = new Set(v.split_with ?? [])
  const toggle = (id: string) => { const s = new Set(split); if (s.has(id)) s.delete(id); else s.add(id); setV({ ...v, split_with: [...s] }) }
  const currency = v.currency ?? 'CNY'
  // An expense that keeps its currency keeps the rate it was saved with.
  const rate = value.id && currency === value.currency ? Number(value.rate ?? 1) : yuanPer(currency, rates)

  const save = async () => {
    if (!split.size) return toast('Pick at least one person to split with.')
    if (rate == null) return toast('No exchange rate yet. Enter the amount in yuan, or try again with signal.')
    setBusy(true)
    const row = { trip_id: session!.tripId, description: v.description, amount: Number(v.amount), currency, rate, paid_by: v.paid_by, split_with: [...split] }
    const { error } = v.id ? await supabase.from('expenses').update(row).eq('id', v.id) : await supabase.from('expenses').insert({ ...row, created_by: session!.memberId })
    setBusy(false)
    if (error) return toast(navigator.onLine ? 'Could not save. Try again.' : 'You are offline. Try again with signal.')
    toast(v.id ? 'Saved' : 'Expense added'); onClose()
  }
  const remove = async () => {
    const { error } = await supabase.from('expenses').delete().eq('id', v.id!)
    if (error) return toast('Could not delete.')
    toast('Removed'); onClose()
  }

  if (v.is_settlement) return (
    <Sheet title="Settle-up payment" onClose={onClose} onSubmit={remove} submitLabel="Undo payment">
      <p className="muted" style={{ margin: 0 }}>{money(Number(v.amount), 'CNY')} was marked as paid back. Undo it if that was a mistake.</p>
    </Sheet>
  )

  return (
    <Sheet title={v.id ? 'Edit expense' : 'Add an expense'} onClose={onClose} onSubmit={save} busy={busy}
      extra={v.id && <button type="button" className="icon-btn" onClick={remove}>Delete this expense</button>}>
      <Field label="What" id="eWhat"><input id="eWhat" required value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="e.g. Taxi to the Great Wall" /></Field>
      <div className="row">
        <Field label="Amount" id="eAmt"><input id="eAmt" type="number" min="0.01" step="0.01" inputMode="decimal" required value={v.amount ?? ''} onChange={(e) => setV({ ...v, amount: e.target.value as unknown as number })} /></Field>
        <Field label="Currency" id="eCur"><select id="eCur" value={currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>{['CNY', ...HOME_CURRENCIES].map((c) => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}</select></Field>
      </div>
      {currency !== 'CNY' && (
        <div className="muted" style={{ fontSize: 12 }}>
          {rate == null ? 'No exchange rate yet. It appears when you have signal.'
            : `Counted as ${money(Number(v.amount || 0) * rate, 'CNY')} (${SYMBOL[currency]}1 = ¥${rate.toFixed(2)}). The rate stays fixed for this expense.`}
        </div>
      )}
      <Field label="Paid by" id="ePaid"><select id="ePaid" value={v.paid_by} onChange={(e) => setV({ ...v, paid_by: e.target.value })}>{data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <div className="field">
        <div className="row between"><label>Split between ({split.size})</label>
          <div className="row"><button type="button" className="icon-btn" onClick={() => setV({ ...v, split_with: data.members.map((m) => m.id) })}>All</button><button type="button" className="icon-btn" onClick={() => setV({ ...v, split_with: [] })}>None</button></div>
        </div>
        <div className="filters" style={{ flexWrap: 'wrap' }}>
          {data.members.map((m) => <button type="button" key={m.id} aria-pressed={split.has(m.id)} onClick={() => toggle(m.id)}>{m.name}</button>)}
        </div>
      </div>
    </Sheet>
  )
}
