import {
  appDataFileSchema,
  uuidSchema,
  type AppDataFile,
  type DocumentKind,
} from '@nebenkosten/schema'

export type IdFactory = () => string

export interface RecordGeneratedDocumentInput {
  readonly billingPeriodId: string
  readonly kind: DocumentKind
  readonly fileName: string
  readonly sha256: string
  readonly calculationRunId?: string
  readonly occupancyPeriodId?: string
}

export interface PdfCommandDependencies {
  readonly createId?: IdFactory
  readonly now?: () => Date
}

const defaultDependencies = (): Required<PdfCommandDependencies> => ({
  createId: () => uuidSchema.parse(crypto.randomUUID()),
  now: () => new Date(),
})

/**
 * Hängt einen Dokument-Metadaten-Eintrag (kein PDF-Inhalt, nur Kind/Datei-
 * name/Hash) sowie einen Audit-Eintrag an — reine, seiteneffektfreie
 * Transformation, analog zu den übrigen `commands.ts`-Modulen. Das eigent-
 * liche Rendern der PDF-/ZIP-Bytes erfolgt vorher in `features/pdf/render.ts`.
 */
export function recordGeneratedDocument(
  data: AppDataFile,
  input: RecordGeneratedDocumentInput,
  dependencies: PdfCommandDependencies = {},
): AppDataFile {
  const { createId, now } = { ...defaultDependencies(), ...dependencies }
  const documentId = createId()
  const auditId = createId()
  const timestamp = now().toISOString()

  return appDataFileSchema.parse({
    ...data,
    billingData: {
      ...data.billingData,
      documents: [
        ...data.billingData.documents,
        {
          id: documentId,
          billingPeriodId: input.billingPeriodId,
          kind: input.kind,
          createdAt: timestamp,
          calculationRunId: input.calculationRunId ?? null,
          occupancyPeriodId: input.occupancyPeriodId ?? null,
          fileName: input.fileName,
          sha256: input.sha256,
        },
      ],
      auditEvents: [
        ...data.billingData.auditEvents,
        {
          id: auditId,
          billingPeriodId: input.billingPeriodId,
          timestamp,
          action: 'document.generated',
          details: { kind: input.kind, fileName: input.fileName },
        },
      ],
    },
  })
}
