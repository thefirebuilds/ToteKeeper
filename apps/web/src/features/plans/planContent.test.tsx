import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { inquiryLink, toteMixes } from './planContent'
import { PlanVisual } from './PlanVisual'
import { planImages } from './imageManifest'

describe('plan details', () => {
  it('lists every full-capacity mixed tote arrangement', () => {
    expect(toteMixes(2)).toEqual(['2 Large', '1 XL'])
    expect(toteMixes(4)).toEqual(['4 Large', '2 Large + 1 XL', '2 XL'])
    expect(toteMixes(10)).toEqual(['10 Large', '8 Large + 1 XL', '6 Large + 2 XL', '4 Large + 3 XL', '2 Large + 4 XL', '5 XL'])
  })
  it('uses the existing inquiry allowlist, without personal information', () => {
    expect(inquiryLink('medium')).toBe('/?plan=medium&source=pricing-medium&context=general#interest')
    expect(inquiryLink('undecided')).toContain('source=help-decide')
    expect(inquiryLink('bulky')).toContain('context=bulky')
  })
  it('reserves layout without inventing a missing image, and can render a reviewed replacement', () => {
    const placeholder = renderToStaticMarkup(<PlanVisual image={planImages.small} />)
    expect(placeholder).toContain('aspect-ratio:4 / 3')
    expect(placeholder).toContain('Image coming soon.')
    expect(placeholder).not.toContain('<img')
    const replacement = renderToStaticMarkup(<PlanVisual image={{ ...planImages.small, src: '/images/reviewed-example.webp', caption: 'Illustrative example; actual fit varies.', imageDisclosure: 'AI-generated illustration.' }} />)
    expect(replacement).toContain('<img')
    expect(replacement).toContain('alt="Illustrative seasonal belongings')
    expect(replacement).toContain('AI-generated illustration.')
    expect(replacement).toContain('aspect-ratio:4 / 3')
  })
})
