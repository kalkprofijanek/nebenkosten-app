import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiAssistPanel } from './AiAssistPanel'
import { AGENT_PROMPT, CHAT_INSTRUCTIONS, withYear } from './ai-prompts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Codeblock unter einer Überschrift der KI-Anleitung. */
function guideBlock(heading: string): string {
  const guide = readFileSync(
    resolve(process.cwd(), 'docs/KI-ANLEITUNG.md'),
    'utf8',
  ).replaceAll('\r\n', '\n')
  const start = guide.indexOf(`## ${heading}`)
  expect(start).toBeGreaterThan(-1)
  const match = /```text\n([\s\S]*?)\n```/u.exec(guide.slice(start))
  return match![1]!
}

describe('Mit KI arbeiten', () => {
  it('nutzt wörtlich die Texte der KI-Anleitung', () => {
    expect(AGENT_PROMPT).toBe(
      guideBlock('Auftrag für den KI-Agenten (Copy & Paste)'),
    )
    expect(CHAT_INSTRUCTIONS).toBe(
      guideBlock('Arbeitsanweisung für die KI (Copy & Paste)'),
    )
  })

  it('setzt das Abrechnungsjahr ein', () => {
    expect(withYear(AGENT_PROMPT, 2025)).toContain('Abrechnungsjahr 2025 vor')
    expect(withYear(AGENT_PROMPT, 2025)).not.toContain('<JAHR>')
    expect(withYear(AGENT_PROMPT, null)).toContain('<JAHR>')
  })

  it('kopiert den Auftrag in die Zwischenablage', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<AiAssistPanel year={2025} />)
    expect(
      screen.getByRole('heading', { name: 'Mit KI arbeiten' }),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Auftrag für KI-Agent kopieren' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'In die Zwischenablage kopiert.',
      ),
    )
    expect(writeText).toHaveBeenCalledWith(withYear(AGENT_PROMPT, 2025))
  })

  it('zeigt den Text zum Markieren, wenn die Zwischenablage fehlt', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('nein')) },
    })
    render(<AiAssistPanel compact />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Arbeitsanweisung für Chat-KI kopieren',
      }),
    )
    const text = await screen.findByLabelText(
      'Arbeitsanweisung für Chat-KI kopieren (Text)',
    )
    expect(text).toHaveValue(CHAT_INSTRUCTIONS)
    for (const link of screen
      .getAllByRole('link')
      .filter((item) => item.getAttribute('target') === '_blank'))
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
