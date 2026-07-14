import { beforeEach, describe, expect, it, vi } from 'vitest'

const render = vi.fn()

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render }),
}))

describe('web bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    render.mockClear()
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('renders the application into the root element', async () => {
    await import('./main')

    expect(render).toHaveBeenCalledOnce()
  })

  it('fails clearly when the root element is missing', async () => {
    document.body.innerHTML = ''

    await expect(import('./main')).rejects.toThrow(
      'Application root element is missing.',
    )
  })
})
