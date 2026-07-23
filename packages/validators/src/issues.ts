import type { ValidationIssue } from '@nebenkosten/schema'
import type { ValidationIssueWithKey } from './types'

export function issueKey(issue: ValidationIssue): string {
  const entity = issue.entity
    ? `${encodeURIComponent(issue.entity.type)}:${encodeURIComponent(issue.entity.id)}`
    : '-'
  const path = (issue.path ?? [])
    .map((part) => encodeURIComponent(String(part)))
    .join('/')
  return `${issue.code}|${entity}|${path}`
}

export function keyed(issue: ValidationIssue): ValidationIssueWithKey {
  return { ...issue, key: issueKey(issue) }
}

export function issue(
  severity: ValidationIssue['severity'],
  code: string,
  area: ValidationIssue['area'],
  title: string,
  options: Pick<ValidationIssue, 'detail' | 'path' | 'entity'> = {},
): ValidationIssue {
  return { severity, code, area, title, ...options }
}
