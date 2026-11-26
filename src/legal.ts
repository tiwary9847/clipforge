// Policy pages (Terms, Privacy, Refunds, Contact) – published from legal.json at build time.
import info from '../legal.json'

export const legalReady = ['name', 'city', 'state', 'email'].every((k) => String((info as Record<string, string>)[k] || '').trim())
export const LEGAL_PAGES: [string, string][] = [
  ['terms', 'Terms'],
  ['privacy', 'Privacy'],
  ['refunds', 'Refunds'],
  ['contact', 'Contact'],
]
export const legalHref = (id: string) => `./legal/${id}.html`
