# Legal documents

These four documents are the customer-facing terms for FLUX. They are written to match what the
software actually does (checked against `main.py`), but **they are a draft and not legal advice.**
A qualified lawyer in each country where you sell should review them before you launch.

| Document | Purpose | Shown in app as |
|---|---|---|
| `terms-of-service.md` | The contract between you and the customer | Profile → Terms of service |
| `refund-policy.md` | When and how money goes back | Profile → Refund policy |
| `privacy-policy.md` | What personal data is collected and why | Profile → Privacy policy |
| `supplier-disclosure.md` | Where the products come from | Profile → Supplier disclosure |

## Filling in the placeholders

Each document uses placeholders in double braces. Fill them in once, in `src/lib/legal.ts`:

- `{{COMPANY_NAME}}` - the legal name of the business operating FLUX
- `{{SUPPORT_CONTACT}}` - the support handle or email customers should use
- `{{JURISDICTION}}` - the country or state whose laws govern the terms
- `{{EFFECTIVE_DATE}}` - the date the current version takes effect
- `{{REFUND_RESPONSE_DAYS}}` - how many business days refund requests take to answer
- `{{DATA_RETENTION}}` - how long you keep order and support records

Until these are filled in, the app shows the placeholder text in square brackets, so an unfinished
document is easy to spot before customers see it.

## Keeping them current

- Change the effective date whenever you change a document.
- Tell existing customers about material changes through the bot before they take effect.
- Keep the old versions in git history; never edit a published version silently.

## Decisions to confirm before launch

The drafts state some commercial choices that the software does not enforce by itself. Confirm each
one, or change the document to match your real practice:

1. **Deposit refunds:** unused deposits can be refunded within 7 days, to the original payment method,
   minus network costs. Refunds of this kind are handled by an admin manually, not automatically.
2. **Wallet balances cannot be withdrawn as cash.** FLUX has no cash-out feature. Confirm this is
   how you want it, because some countries treat stored value rules differently.
3. **Order refunds return to the FLUX wallet**, not to the bank or Telegram Wallet that paid.
4. **Review timings** in the refund policy ("we reply within N business days") and the 15-minute
   wait before an order with no supplier record is flagged. The flag timing is set in code by
   `OPS_STUCK_MINUTES` and the 15-minute rule in `reconcile_unclear_orders`.
5. **Age requirement** in the Terms (old enough to contract, or guardian permission). Some countries
   set a different minimum for digital purchases.
6. **Retention period** (`{{DATA_RETENTION}}`). Choose a period you can actually enforce.
