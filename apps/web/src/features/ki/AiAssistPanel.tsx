import { useState } from 'react'
import {
  AGENT_PROMPT,
  AI_DOCS,
  CHAT_INSTRUCTIONS,
  withYear,
} from './ai-prompts'

type PromptKind = 'agent' | 'chat'

const PROMPTS: Record<
  PromptKind,
  { title: string; text: string; hint: string }
> = {
  agent: {
    title: 'Auftrag für KI-Agent kopieren',
    text: AGENT_PROMPT,
    hint: 'Für Claude Code o. Ä. mit lokaler Kopie des Repositorys: Die KI liest Belege, holt Klimafaktor und Vergleichswerte selbst, rechnet mit `pnpm abrechnung` und legt Unplausibles zur Entscheidung vor.',
  },
  chat: {
    title: 'Arbeitsanweisung für Chat-KI kopieren',
    text: CHAT_INSTRUCTIONS,
    hint: 'Für Claude, ChatGPT o. Ä. im Browser: Belege hochladen, Ergebnis als Erfassungsliste (CSV) unter „Kosten“ importieren.',
  },
}

/**
 * „Mit KI arbeiten“ auf Übersicht und Jahresabrechnung: kopierbare
 * Arbeitsaufträge und Links zur Anleitung. Die App selbst bleibt ohne
 * Netzverbindung; kopiert wird nur ein Text ohne Daten.
 */
export function AiAssistPanel({
  year,
  compact = false,
}: {
  readonly year?: number | null
  readonly compact?: boolean
}) {
  const [copied, setCopied] = useState<PromptKind | null>(null)
  const [fallback, setFallback] = useState<PromptKind | null>(null)

  async function copy(kind: PromptKind) {
    const text = withYear(PROMPTS[kind].text, year)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setFallback(null)
    } catch {
      // Ohne Zwischenablage: Text zum manuellen Markieren anzeigen.
      setCopied(null)
      setFallback(kind)
    }
  }

  const body = (
    <>
      <p>
        Am schnellsten geht die Abrechnung mit einem KI-Assistenten: Er liest
        Rechnungen, Kontoauszüge und Ablesebögen, ruft Referenzwerte (DWD,
        Heizspiegel) selbst ab und prüft auf Unplausibles. Die App rechnet und
        bleibt dabei ohne Netzverbindung. Für die KI unter{' '}
        <a href="#/sicherung">Sicherung</a> eine Sicherung herunterladen.
      </p>
      <div className="ai-assist__actions">
        {(Object.keys(PROMPTS) as PromptKind[]).map((kind) => (
          <div key={kind} className="ai-assist__action">
            <button
              className="button"
              type="button"
              onClick={() => void copy(kind)}
            >
              {PROMPTS[kind].title}
            </button>
            <small>{PROMPTS[kind].hint}</small>
            {copied === kind ? (
              <span role="status">In die Zwischenablage kopiert.</span>
            ) : null}
            {fallback === kind ? (
              <textarea
                aria-label={`${PROMPTS[kind].title} (Text)`}
                readOnly
                rows={8}
                value={withYear(PROMPTS[kind].text, year)}
                onFocus={(event) => event.currentTarget.select()}
              />
            ) : null}
          </div>
        ))}
      </div>
      <p className="privacy-note">
        Echte Daten nur an KI-Dienste geben, deren Datenschutz geklärt ist. Mehr
        dazu:{' '}
        <a href={AI_DOCS.guide} target="_blank" rel="noopener noreferrer">
          KI-Anleitung
        </a>
        {' · '}
        <a href={AI_DOCS.dataSources} target="_blank" rel="noopener noreferrer">
          Datenquellen
        </a>
        {' · '}
        <a
          href={AI_DOCS.firstBilling}
          target="_blank"
          rel="noopener noreferrer"
        >
          Erste Abrechnung in 60 Minuten
        </a>
        {' · '}
        <a href={AI_DOCS.example} target="_blank" rel="noopener noreferrer">
          Beispielobjekt
        </a>
      </p>
    </>
  )

  if (compact)
    return (
      <details className="ai-assist ai-assist--compact">
        <summary>Mit KI arbeiten</summary>
        {body}
      </details>
    )
  return (
    <section
      className="welcome-panel ai-assist"
      aria-labelledby="ai-assist-title"
    >
      <div>
        <p className="section-kicker">Empfohlen</p>
        <h2 id="ai-assist-title">Mit KI arbeiten</h2>
        {body}
      </div>
    </section>
  )
}
