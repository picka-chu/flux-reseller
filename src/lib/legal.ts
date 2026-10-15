import termsOfService from "../../docs/legal/terms-of-service.md?raw";
import refundPolicy from "../../docs/legal/refund-policy.md?raw";
import privacyPolicy from "../../docs/legal/privacy-policy.md?raw";
import supplierDisclosure from "../../docs/legal/supplier-disclosure.md?raw";

/**
 * Business details used in the legal documents. Fill these in before launch.
 * Until then, the app shows the square-bracket text, so an unfinished document is easy to spot.
 */
export const LEGAL = {
  COMPANY_NAME: "[Your company name]",
  SUPPORT_CONTACT: "[Support contact: Telegram handle or email]",
  JURISDICTION: "[Country or state whose laws apply]",
  EFFECTIVE_DATE: "[Effective date]",
  REFUND_RESPONSE_DAYS: "[number]",
  DATA_RETENTION: "[retention period]",
};

export interface LegalDoc { slug: string; title: string; summary: string; source: string }

export const LEGAL_DOCS: LegalDoc[] = [
  { slug: "terms-of-service", title: "Terms of service", summary: "Your agreement with FLUX", source: termsOfService },
  { slug: "refund-policy", title: "Refund policy", summary: "When and how money goes back", source: refundPolicy },
  { slug: "privacy-policy", title: "Privacy policy", summary: "What data we keep and why", source: privacyPolicy },
  { slug: "supplier-disclosure", title: "Supplier disclosure", summary: "Where our products come from", source: supplierDisclosure },
];

export const legalDoc = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);

/** Replace {{KEY}} placeholders with the business details above. Unknown keys are left visible. */
export function fillPlaceholders(text: string): string {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => (key in LEGAL ? LEGAL[key as keyof typeof LEGAL] : match));
}
