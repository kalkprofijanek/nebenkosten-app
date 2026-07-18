import type { ValidationIssue } from '../../entities/validation'
import type { MigrationDroppedField, MigrationFieldChange } from '../report'
import type { MigrationOptions } from '../migrate-v3-to-current'
import { deterministicUuid } from './ids'

export type JsonPath = (number | string)[]

export function pathToString(path: JsonPath): string {
  return path.reduce<string>(
    (result, segment) =>
      typeof segment === 'number'
        ? `${result}[${segment}]`
        : result.length === 0
          ? segment
          : `${result}.${segment}`,
    '',
  )
}

export class MigrationContext {
  readonly changedFields: MigrationFieldChange[] = []
  readonly droppedFields: MigrationDroppedField[] = []
  readonly issues: ValidationIssue[] = []
  readonly unmappedFields: string[] = []
  private readonly unmappedFieldSet = new Set<string>()

  constructor(readonly options: MigrationOptions) {}

  id(path: JsonPath): string {
    return deterministicUuid(this.options.sourceSha256, pathToString(path))
  }

  change(sourcePath: JsonPath, targetPath: JsonPath, rule: string): void {
    this.changedFields.push({
      sourcePath: pathToString(sourcePath),
      targetPath: pathToString(targetPath),
      rule,
    })
  }

  issue(
    severity: ValidationIssue['severity'],
    code: string,
    title: string,
    path?: JsonPath,
    entity?: ValidationIssue['entity'],
  ): void {
    this.issues.push({ severity, code, area: 'migration', title, path, entity })
  }

  drop(path: JsonPath, reason: string, value: unknown): void {
    this.droppedFields.push({
      sourcePath: pathToString(path),
      reason,
      valueType: value === null ? 'null' : typeof value,
    })
  }

  unmapped(path: JsonPath): void {
    const formatted = pathToString(path)
    if (!this.unmappedFieldSet.has(formatted)) {
      this.unmappedFieldSet.add(formatted)
      this.unmappedFields.push(formatted)
    }
  }
}
