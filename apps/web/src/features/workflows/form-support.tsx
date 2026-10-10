import type { ReactNode } from 'react'

export function WorkflowField({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  disabled,
}: {
  readonly label: string
  readonly name: string
  readonly type?: string
  readonly required?: boolean
  readonly defaultValue?: string | number
  readonly disabled?: boolean
}) {
  return (
    <label>
      <span>{label}</span>
      <input {...{ name, type, required, defaultValue, disabled }} />
    </label>
  )
}

export function ExistingEntries({
  empty,
  children,
}: {
  readonly empty: string
  readonly children: ReactNode
}) {
  return (
    <section aria-label="Vorhandene Einträge">
      <h2>Vorhandene Einträge</h2>
      {children || <p>{empty}</p>}
    </section>
  )
}
