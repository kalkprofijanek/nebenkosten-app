const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatCostCents(value: number): string {
  return euro.format(value / 100)
}

export function editCostAmount(value: number): string {
  return (value / 100).toFixed(2).replace('.', ',')
}
