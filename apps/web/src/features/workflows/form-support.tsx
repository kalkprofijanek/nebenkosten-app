import type { ReactNode } from 'react'

export const formText = (form: FormData, name: string) =>
  String(form.get(name) ?? '').trim()

export const formOptionalText = (form: FormData, name: string) =>
  formText(form, name) || undefined

export function WorkflowField({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
}: {
  readonly label: string
  readonly name: string
  readonly type?: string
  readonly required?: boolean
  readonly defaultValue?: string | number
}) {
  return (
    <label>
      <span>{label}</span>
      <input {...{ name, type, required, defaultValue }} />
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
