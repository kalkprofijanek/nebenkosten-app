import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReferenceSourceHint } from './ReferenceSourceHint'
import { DWD_CLIMATE_FACTORS, HEIZSPIEGEL } from './reference-sources'

afterEach(cleanup)

describe('Quellenhinweise für Referenzwerte (PR-36)', () => {
  it.each([DWD_CLIMATE_FACTORS, HEIZSPIEGEL])(
    'verlinkt $label in neuem Fenster ohne Referrer',
    (source) => {
      render(<ReferenceSourceHint source={source} />)
      const link = screen.getByRole('link', { name: source.label })
      expect(link).toHaveAttribute('href', source.href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(source.href.startsWith('https://')).toBe(true)
    },
  )
})
