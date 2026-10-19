export type InquiryPlan = 'undecided' | 'small' | 'medium' | 'big' | 'bulky'
export type InquiryContext = 'general' | 'summer' | 'bulky' | 'service-area'
export type InquirySource = 'header' | 'hero' | 'pricing-small' | 'pricing-medium' | 'pricing-big' | 'final' | 'help-decide' | 'summer' | 'bulky' | 'service-area' | 'tote-mix' | 'legacy-enroll'
export interface InquirySelection { plan: InquiryPlan; source: InquirySource; context: InquiryContext }
const plans: InquiryPlan[] = ['undecided', 'small', 'medium', 'big', 'bulky']
const contexts: InquiryContext[] = ['general', 'summer', 'bulky', 'service-area']
const sources: InquirySource[] = ['header', 'hero', 'pricing-small', 'pricing-medium', 'pricing-big', 'final', 'help-decide', 'summer', 'bulky', 'service-area', 'tote-mix', 'legacy-enroll']
export function selectionFromSearch(search: string): InquirySelection {
  const query = new URLSearchParams(search)
  const plan = (query.get('plan') || '').toLowerCase() as InquiryPlan
  const context = query.get('context') as InquiryContext
  const source = query.get('source') as InquirySource
  return { plan: plans.includes(plan) ? plan : 'undecided', context: contexts.includes(context) ? context : 'general', source: sources.includes(source) ? source : 'final' }
}
export function legacyInquiryTarget(search: string) {
  const selection = selectionFromSearch(search)
  return `/?${new URLSearchParams({ plan: selection.plan, source: 'legacy-enroll', context: selection.context })}#interest`
}
