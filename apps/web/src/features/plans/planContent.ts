import { SERVICE_CONFIG } from '../../config/commercial'
import type { InquiryPlan } from '../marketing/inquiryContext'

export function inquiryLink(plan: InquiryPlan) {
  const source = plan === 'undecided' ? 'help-decide' : plan === 'bulky' ? 'bulky' : `pricing-${plan}`
  return `/?${new URLSearchParams({ plan, source, context: plan === 'bulky' ? 'bulky' : 'general' })}#interest`
}

export function toteMixes(capacity: number) {
  const { large, xl } = SERVICE_CONFIG.toteSizes
  const mixes: string[] = []
  for (let xlCount = 0; xlCount * xl.credits <= capacity; xlCount++) {
    const largeCount = (capacity - xlCount * xl.credits) / large.credits
    if (!Number.isInteger(largeCount)) continue
    mixes.push([largeCount ? `${largeCount} Large` : '', xlCount ? `${xlCount} XL` : ''].filter(Boolean).join(' + '))
  }
  return mixes
}

export const planUseCases = {
  small: 'A few seasonal decorations or folded clothes that keep claiming the spare shelf.',
  medium: 'Seasonal clothing and spare bedding that could give a closet its job back.',
  big: 'A household’s off-season decorations, bedding and gear, with an eligible bagged bulky item if approved.',
} as const
