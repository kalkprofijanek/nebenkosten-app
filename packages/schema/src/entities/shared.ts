/**
 * Gemeinsame Wertobjekte, die von mehreren Entitäten verwendet werden.
 */
import { z } from 'zod'
import { entityIdSchema } from '../primitives'

/**
 * Verlustfrei konservierte, unbekannte Legacy-Felder (docs/MIGRATION.md
 * Abschnitt 6). Jede persistierte Entität führt dieses Feld, damit der
 * Migrationsvertrag „kein stilles Verwerfen“ (Masterplan 9.2/25) im
 * Zielformat tatsächlich erfüllbar ist; die Migration listet die Pfade
 * zusätzlich in `report.unmappedFields`.
 */
export type JsonValue =
  boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface LegacyUnmappedEntry {
  path: (number | string)[]
  value: JsonValue
}

export type LegacyUnmapped = LegacyUnmappedEntry[]

const MAX_UNMAPPED_DEPTH = 32
const MAX_UNMAPPED_ENTRIES = 1_000
const MAX_UNMAPPED_NODES = 10_000
const MAX_UNMAPPED_STRING_CHARS = 1_000_000

interface JsonBudget {
  nodes: number
  seen: WeakSet<object>
  stringChars: number
}

function isDenseDataArray(value: unknown[]): boolean {
  if (Object.getPrototypeOf(value) !== Array.prototype) return false
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1 || !keys.includes('length')) return false
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor?.enumerable || !('value' in descriptor)) return false
  }
  return true
}

function isBoundedJsonValue(
  value: unknown,
  depth: number,
  budget: JsonBudget,
): boolean {
  budget.nodes += 1
  if (budget.nodes > MAX_UNMAPPED_NODES || depth > MAX_UNMAPPED_DEPTH)
    return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') {
    budget.stringChars += value.length
    return budget.stringChars <= MAX_UNMAPPED_STRING_CHARS
  }
  if (typeof value !== 'object' || budget.seen.has(value)) return false
  budget.seen.add(value)

  if (Array.isArray(value)) {
    if (value.length > MAX_UNMAPPED_NODES || !isDenseDataArray(value))
      return false
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))!
      if (!isBoundedJsonValue(descriptor.value, depth + 1, budget)) return false
    }
    return true
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string')) return false
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) return false
    budget.stringChars += key.length
    if (
      budget.stringChars > MAX_UNMAPPED_STRING_CHARS ||
      !isBoundedJsonValue(descriptor.value, depth + 1, budget)
    )
      return false
  }
  return true
}

function isLegacyUnmapped(value: unknown): value is LegacyUnmapped {
  try {
    if (
      !Array.isArray(value) ||
      value.length > MAX_UNMAPPED_ENTRIES ||
      !isDenseDataArray(value)
    )
      return false
    const budget: JsonBudget = {
      nodes: 0,
      seen: new WeakSet(),
      stringChars: 0,
    }
    for (let index = 0; index < value.length; index += 1) {
      const entryDescriptor = Object.getOwnPropertyDescriptor(
        value,
        String(index),
      )!
      const entry = entryDescriptor.value
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
        return false
      const prototype = Object.getPrototypeOf(entry)
      if (prototype !== Object.prototype && prototype !== null) return false
      const keys = Reflect.ownKeys(entry)
      if (
        keys.length !== 2 ||
        !keys.includes('path') ||
        !keys.includes('value')
      )
        return false
      const pathDescriptor = Object.getOwnPropertyDescriptor(entry, 'path')
      const valueDescriptor = Object.getOwnPropertyDescriptor(entry, 'value')
      if (
        !pathDescriptor?.enumerable ||
        !('value' in pathDescriptor) ||
        !valueDescriptor?.enumerable ||
        !('value' in valueDescriptor)
      )
        return false
      const path = pathDescriptor.value
      if (
        !Array.isArray(path) ||
        path.length < 1 ||
        path.length > 32 ||
        !isDenseDataArray(path)
      )
        return false
      for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
        const segment = Object.getOwnPropertyDescriptor(
          path,
          String(pathIndex),
        )!.value
        const validSegment =
          (typeof segment === 'string' &&
            segment.length > 0 &&
            segment.length <= 255) ||
          (Number.isSafeInteger(segment) && Number(segment) >= 0)
        if (!validSegment) return false
      }
      if (!isBoundedJsonValue(valueDescriptor.value, 0, budget)) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Unbekannte Legacy-Felder als Pfad-/Wert-Liste. Die Listenform erhält auch
 * Schlüssel wie `__proto__`, ohne sie als Merge-Schlüssel zu verwenden.
 */
export const legacyUnmappedSchema = z.custom<LegacyUnmapped>(isLegacyUnmapped, {
  message:
    'legacyUnmapped muss eine begrenzte, JSON-sichere Pfad-/Wert-Liste sein',
})

/**
 * Postanschrift. `postalCodeAndCity` wird bewusst als kombiniertes Feld
 * geführt, weil das Legacy-Format (`plz_ort`) nicht verlustfrei in PLZ und
 * Ort zerlegbar ist. Eine spätere Normalisierung ist eine eigene, bewusste
 * Datenpflege-Aufgabe, keine stille Migrationstransformation.
 */
export const addressSchema = z.strictObject({
  street: z.string().nullish(),
  postalCodeAndCity: z.string().nullish(),
})
export type Address = z.infer<typeof addressSchema>

/** Bankverbindung. IBAN-Formatprüfung ist Aufgabe der Validatoren (PR 10). */
export const bankAccountSchema = z.strictObject({
  iban: z.string().nullish(),
  bic: z.string().nullish(),
  accountHolder: z.string().nullish(),
  bankName: z.string().nullish(),
})
export type BankAccount = z.infer<typeof bankAccountSchema>

/** Anrede-Katalog (Legacy `ANREDE` ohne Leerwert; leer = nicht erfasst). */
export const salutationSchema = z.enum(['Herr', 'Frau', 'Familie', 'Firma'])
export type Salutation = z.infer<typeof salutationSchema>

/** Kontaktperson (Legacy `Firma.ansprechpartner`). */
export const contactPersonSchema = z.strictObject({
  salutation: salutationSchema.nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  phone: z.string().nullish(),
  mobile: z.string().nullish(),
  fax: z.string().nullish(),
  email: z.string().nullish(),
})
export type ContactPerson = z.infer<typeof contactPersonSchema>

/**
 * Kosten-/Nutzer-Geltungsbereich (Legacy `scope_key`, `kosten_scope`,
 * `grundsteuer_key`): entweder das ganze Objekt, ein Heizkreis-Gebäudeblock
 * (`building`, Legacy-Block-ID `B1`…) oder ein Haus-Schlüssel (`house`,
 * Legacy `hausKeyVonRef`-Ableitung aus der Mandatsreferenz).
 */
export const allocationScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('property') }),
  z.strictObject({ kind: z.literal('building'), buildingId: entityIdSchema }),
  z.strictObject({ kind: z.literal('house'), houseKey: z.string().min(1) }),
])
export type AllocationScope = z.infer<typeof allocationScopeSchema>

/** Verknüpfung eines Belegs/einer Lieferung mit einer Kontobuchung. */
export const bookingLinkSchema = z.strictObject({
  bankBookingId: entityIdSchema,
  splitId: entityIdSchema.nullish(),
})
export type BookingLink = z.infer<typeof bookingLinkSchema>

/** Manuelle Bestätigung „extern bezahlt“ statt Buchungsverknüpfung. */
export const externalPaymentSchema = z.strictObject({
  confirmed: z.boolean(),
  reason: z.string().nullish(),
})
export type ExternalPayment = z.infer<typeof externalPaymentSchema>

/** Manuell übernommener Schätzwert inklusive Begründung. */
export const estimateSchema = z.strictObject({
  isEstimated: z.boolean(),
  reason: z.string().nullish(),
})
export type Estimate = z.infer<typeof estimateSchema>

/**
 * Angehängte Beleg-Datei als Base64-Data-URL. Entspricht den Legacy-Grenzen:
 * PDF/JPEG/PNG/WEBP, sicherer Dateiname und höchstens 4 MB dekodiert.
 * Eine Magic-Byte-/Inhaltsprüfung folgt an der Importgrenze.
 */
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
const MAX_ATTACHMENT_DATA_URL_CHARS = 5_600_000

export const attachmentMimeTypeSchema = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const safeFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (name) =>
      !name.includes('/') &&
      !name.includes('\\') &&
      !name.includes(':') &&
      Array.from(name).every((character) => {
        const codePoint = character.codePointAt(0)!
        return codePoint >= 32 && codePoint !== 127
      }),
    { message: 'Dateiname enthält unzulässige Zeichen' },
  )
  .refine((name) => name !== '.' && name !== '..', {
    message: 'Ungültiger Dateiname',
  })
  .refine((name) => !/[. ]$/u.test(name), {
    message: 'Dateiname darf nicht mit Punkt oder Leerzeichen enden',
  })
  .refine(
    (name) => {
      const baseName = name.split('.')[0]!.toLocaleUpperCase('en-US')
      return !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(baseName)
    },
    { message: 'Reservierter Windows-Dateiname' },
  )

const base64PayloadPattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

export const fileAttachmentSchema = z
  .strictObject({
    fileName: safeFileNameSchema,
    mimeType: attachmentMimeTypeSchema,
    dataBase64: z.string().min(1).max(MAX_ATTACHMENT_DATA_URL_CHARS),
  })
  .superRefine((attachment, context) => {
    const match = /^data:([^;,]+);base64,(.+)$/u.exec(attachment.dataBase64)
    if (
      !match ||
      match[1] !== attachment.mimeType ||
      !base64PayloadPattern.test(match[2]!)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Ungültiger oder nicht passender Base64-Data-URL',
        path: ['dataBase64'],
      })
      return
    }
    const payload = match[2]!
    const extensionsByMime = {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    } as const
    const lowerName = attachment.fileName.toLocaleLowerCase('en-US')
    if (
      !extensionsByMime[attachment.mimeType].some((extension) =>
        lowerName.endsWith(extension),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Dateiendung passt nicht zum MIME-Typ',
        path: ['fileName'],
      })
    }
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
    const decodedBytes = (payload.length / 4) * 3 - padding
    if (decodedBytes > MAX_ATTACHMENT_BYTES) {
      context.addIssue({
        code: 'too_big',
        maximum: MAX_ATTACHMENT_BYTES,
        origin: 'string',
        message: 'Anhang darf dekodiert höchstens 4 MB groß sein',
        path: ['dataBase64'],
      })
    }
  })
export type FileAttachment = z.infer<typeof fileAttachmentSchema>
