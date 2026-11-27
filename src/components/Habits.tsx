import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MyDate, myDates, saveMyDates, streak, todaysIdea, upcoming, whenText } from '../festivals'
import { pickAndMake } from '../makeit'
import { setUi } from '../store'
import { useT } from '../i18n'

const useTick = (ev: string) => {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((n) => n + 1)
    window.addEventListener(ev, f)
    return () => window.removeEventListener(ev, f)
  }, [ev])
}

/** Festivals and your birthdays/anniversaries coming up – one tap to make the wish video. */
export function ComingUp({ onMake }: { onMake?: () => void }) {
  const t = useT()
  useTick('cf:dates')
  const [edit, setEdit] = useState(false)
  const list = upcoming(30).slice(0, 6)
  return (
    <section className="cu">
      <div className="cu-h"><b>🎉 {t('Coming up')}</b><button className="link" onClick={() => setEdit(true)}>＋ {t('Add a birthday')}</button></div>
      {list.length === 0 ? (
        <div className="hint">{t('No festivals in the next 30 days. Add birthdays and anniversaries so you never miss one.')}</div>
      ) : (
        <div className="cu-row">
          {list.map((o) => (
            <button key={o.id} className={'cu-card' + (o.days <= 3 ? ' soon' : '')} onClick={() => pickAndMake(o.template, o.texts, onMake)}>
              <span className="cu-em">{o.emoji}</span>
              <b>{o.name}</b>
              <small>{t(whenText(o.days))}</small>
              <i>{t('Make wish video')} →</i>
            </button>
          ))}
        </div>
      )}
      {edit && <MyDatesDialog onClose={() => setEdit(false)} />}
    </section>
  )
}

function MyDatesDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [list, setList] = useState<MyDate[]>(myDates)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<MyDate['kind']>('birthday')
  const save = (l: MyDate[]) => { setList(l); saveMyDates(l) }
  return createPortal(
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>🎂 {t('Birthdays & anniversaries')}</h3>
        <div className="hint">{t('Saved only on this phone. They show under “Coming up” 30 days before, every year.')}</div>
        <div className="md-add">
          <div className="seg">
            <button className={kind === 'birthday' ? 'on' : ''} onClick={() => setKind('birthday')}>🎂 {t('Birthday')}</button>
            <button className={kind === 'anniversary' ? 'on' : ''} onClick={() => setKind('anniversary')}>💞 {t('Anniversary')}</button>
          </div>
          <input placeholder={kind === 'birthday' ? t('Name (e.g. Maa, Rahul)') : t('Names (e.g. Mummy & Papa)')} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <button className="btn primary" disabled={!name.trim() || !date} onClick={() => {
            save([...list, { id: 'd' + Date.now(), name: name.trim(), kind, md: date.slice(5) }])
            setName('')
            setDate('')
            setUi({ toast: 'Saved – you’ll see it under Coming up' })
          }}>{t('Save')}</button>
        </div>
        {list.map((d) => (
          <div key={d.id} className="md-row">
            <span>{d.kind === 'birthday' ? '🎂' : '💞'} <b>{d.name}</b> · {new Date(2000, +d.md.slice(0, 2) - 1, +d.md.slice(3)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</span>
            <button className="btn sm" onClick={() => save(list.filter((x) => x.id !== d.id))} aria-label={`Remove ${d.name}`}>✕</button>
          </div>
        ))}
        <div className="modal-actions"><button className="btn" onClick={onClose}>{t('Done')}</button></div>
      </div>
    </div>,
    document.body,
  )
}

/** One reel idea a day, with the matching template. */
export function TodayIdea({ onMake }: { onMake?: () => void }) {
  const t = useT()
  const i = todaysIdea()
  return (
    <button className="idea" onClick={() => pickAndMake(i.template, undefined, onMake)}>
      <span className="idea-ic">💡</span>
      <span><small>{t('Today’s idea')}</small><b>{i.title}</b><em>{i.how}</em></span>
      <i>{t('Make it')} →</i>
    </button>
  )
}

/** Posting streak + 30-day challenge (a saved video counts). */
export function Streak() {
  const t = useT()
  useTick('cf:streak')
  const s = streak()
  const done = s.last30.filter(Boolean).length
  return (
    <div className="streak">
      <div className="streak-h">
        <b>🔥 {s.days} {t(s.days === 1 ? 'day streak' : 'days streak')}</b>
        <small>{t('30-day challenge')}: {done}/30</small>
      </div>
      <div className="streak-dots" aria-label={`${done} of the last 30 days`}>
        {s.last30.map((on, i) => <i key={i} className={on ? 'on' : i === 29 ? 'today' : ''} />)}
      </div>
      <small className="hint">{s.today ? t('Posted today – see you tomorrow! 💪') : s.days ? t('Save a video today to keep your streak.') : t('Save a video every day – creators who post daily grow fastest.')}</small>
    </div>
  )
}

/** Once a day: a gentle reminder when a festival or birthday is 0–2 days away. */
export function useOccasionReminder() {
  useEffect(() => {
    const k = 'clipforge-reminded'
    const day = new Date().toDateString()
    if (localStorage.getItem(k) === day) return
    const o = upcoming(2)[0]
    if (!o) return
    localStorage.setItem(k, day)
    setTimeout(() => setUi({ toast: `${o.emoji} ${o.name} is ${whenText(o.days).toLowerCase()} – tap “Make wish video” on the home screen.` }), 2500)
  }, [])
}
