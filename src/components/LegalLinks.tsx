import { LEGAL_PAGES, legalHref, legalReady } from '../legal'

/** Terms · Privacy · Refunds · Contact – shown once the policy pages are published. */
export function LegalLinks({ className = '' }: { className?: string }) {
  if (!legalReady) return null
  return (
    <nav className={'legal-links ' + className} aria-label="Policies">
      {LEGAL_PAGES.map(([id, name], i) => (
        <span key={id}>
          {i > 0 && ' · '}
          <a href={legalHref(id)} target="_blank" rel="noopener">{name}</a>
        </span>
      ))}
    </nav>
  )
}
