// Shared field validators for customer (and future contact) forms. Used by both
// the client drawer (inline feedback) and the server actions (authoritative
// check), so the two can never drift. Each validator treats an empty value as
// valid — required-ness is enforced separately.

// Reasonably strict single-address email: no spaces, one @, a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Indian GSTIN: 2-digit state code, 10-char PAN, entity digit, Z, checksum char.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function validateEmail(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return EMAIL_RE.test(v) ? null : "Enter a valid email address.";
}

export function validatePhone(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  // Allow digits plus the usual separators; letters are not a phone number.
  if (!/^[+()\d\s-]+$/.test(v)) return "Phone can only contain digits and + ( ) - spaces.";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "Enter a valid phone number.";
  return null;
}

export function validateGstin(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toUpperCase();
  if (!v) return null;
  return GSTIN_RE.test(v) ? null : "GSTIN must look like 27AAAAA0000A1Z5.";
}

// Runs every customer-field validator, returning the first error (or null).
export function validateCustomerFields(input: {
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
}): string | null {
  return (
    validateEmail(input.email) ??
    validatePhone(input.phone) ??
    validateGstin(input.gstin)
  );
}
