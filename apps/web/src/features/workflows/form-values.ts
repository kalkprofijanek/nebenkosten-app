export const formText = (form: FormData, name: string) =>
  String(form.get(name) ?? '').trim()

export const formOptionalText = (form: FormData, name: string) =>
  formText(form, name) || undefined
