import {
  appDataFileSchema,
  uuidSchema,
  type AppDataFile,
  type DocumentKind,
} from '@nebenkosten/schema'
import { latestCalculationRun } from '@nebenkosten/validators'

export type IdFactory = () => string

export interface RecordGeneratedDocumentInput {
  readonly billingPeriodId: string
  readonly kind: DocumentKind
  readonly fileName: string
  readonly sha256: string
  readonly calculationRunId: string
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
  return recordGeneratedDocuments(data, [input], dependencies)
}

function validateInput(
  data: AppDataFile,
  input: RecordGeneratedDocumentInput,
): void {
  const billingPeriod = data.billingData.billingPeriods.find(
    ({ id }) => id === input.billingPeriodId,
  )
  if (
    !billingPeriod ||
    (billingPeriod.status !== 'READY_FOR_PDF' &&
      billingPeriod.status !== 'FINALIZED')
  )
    throw new Error(
      'Dokumente dürfen nur für ein PDF-bereites Abrechnungsjahr gespeichert werden.',
    )

  const latestRun = latestCalculationRun(
    data.billingData.calculationRuns,
    input.billingPeriodId,
  )
  const hasResult =
    latestRun !== undefined &&
    data.billingData.calculationResults.some(
      ({ calculationRunId }) => calculationRunId === latestRun.id,
    )
  if (!latestRun || !hasResult || latestRun.id !== input.calculationRunId)
    throw new Error('Das Dokument gehört nicht zum aktuellen Berechnungslauf.')

  if (input.kind === 'tenant_statement') {
    const occupancy = data.billingData.occupancyPeriods.find(
      ({ id }) => id === input.occupancyPeriodId,
    )
    if (
      !occupancy ||
      occupancy.billingPeriodId !== input.billingPeriodId ||
      occupancy.kind !== 'tenant'
    )
      throw new Error(
        'Der Nutzungszeitraum gehört nicht zu diesem Abrechnungsjahr.',
      )
  }
}

/** Zeichnet mehrere gemeinsam erzeugte Dokumente atomar auf. */
export function recordGeneratedDocuments(
  data: AppDataFile,
  inputs: readonly RecordGeneratedDocumentInput[],
  dependencies: PdfCommandDependencies = {},
): AppDataFile {
  const { createId, now } = { ...defaultDependencies(), ...dependencies }
  const parsed = appDataFileSchema.parse(data)
  inputs.forEach((input) => validateInput(parsed, input))
  const timestamp = now().toISOString()
  const records = inputs.map((input) => ({
    input,
    documentId: createId(),
    auditId: createId(),
  }))

  return appDataFileSchema.parse({
    ...parsed,
    billingData: {
      ...parsed.billingData,
      documents: [
        ...parsed.billingData.documents,
        ...records.map(({ input, documentId }) => ({
          id: documentId,
          billingPeriodId: input.billingPeriodId,
          kind: input.kind,
          createdAt: timestamp,
          calculationRunId: input.calculationRunId,
          occupancyPeriodId: input.occupancyPeriodId ?? null,
          fileName: input.fileName,
          sha256: input.sha256,
        })),
      ],
      auditEvents: [
        ...parsed.billingData.auditEvents,
        ...records.map(({ input, auditId }) => ({
          id: auditId,
          billingPeriodId: input.billingPeriodId,
          timestamp,
          action: 'document.generated',
          details: {
            kind: input.kind,
            fileName: input.fileName,
            calculationRunId: input.calculationRunId,
          },
        })),
      ],
    },
  })
}
