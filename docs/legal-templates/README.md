# Policy pages for Razorpay

Razorpay asks for these pages on your website before it switches on live payments. You don't edit these files: put your name, city, state and email in `legal.json` (repo root) – every build then makes `/legal/privacy.html`, `terms.html`, `refunds.html` and `contact.html` from these templates and links them from the start screen and the Pro window. Until `legal.json` is filled in, no pages are published and no links are shown.

- `terms.md` – Terms of use
- `privacy.md` – Privacy policy
- `refunds.md` – Cancellation & refund policy
- `contact.md` – Contact us

These are plain-language starting points, not legal advice. Have them checked if you're unsure.
