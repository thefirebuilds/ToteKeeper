import type { BulkyRecord, ConsentRecord, DemoAudit, PackageRecord, ReviewCase } from './domain/operations'

export type ToteStatus = 'At home' | 'In storage'
export type ToteSizeId = 'large' | 'xl'
export type RequestKind = 'Collection' | 'Return delivery'
export type RequestStatus = 'Awaiting confirmation' | 'Confirmed' | 'Cancelled' | 'Completed'

export interface ToteMovement {
  date: string
  label: string
  detail: string
  operator?: string
  sealNumber?: string
  exteriorCondition?: string
  photoStatus?: string
}

export interface Tote {
  id: string
  size: ToteSizeId
  packageId?: string
  assignmentReviewRequired?: boolean
  emptyLocation?: 'Customer' | 'Company'
  nickname: string
  category: string
  description: string
  combinedContentsValue?: number
  contentsAcknowledged?: boolean
  status: ToteStatus
  currentSealNumber?: string
  priorSealNumbers?: string[]
  exteriorCondition?: string
  exteriorPhotoStatus?: string
  history: ToteMovement[]
}

export interface ServiceRequest {
  id: string
  kind: RequestKind
  toteIds: string[]
  preferredDate: string
  preferredWindow: string
  address: string
  instructions: string
  status: RequestStatus
  createdAt: string
  confirmedAppointment?: string
  packageId?: string
  cycleId?: string
  legId?: string
  purpose?: 'Packed belongings' | 'Empty totes' | 'Final return'
  packingPreference?: string
  unattended?: { requested: boolean; location: string; authorized: boolean; agreedByOwner: boolean; authorizedAt?: string; riskAcknowledged: boolean }
}

export interface DemoProfile {
  name: string
  email: string
  address: string
  city: string
  zip: string
  planId: string
  planCreditAllowance: number
}

export interface DemoData {
  profile: DemoProfile
  totes: Tote[]
  requests: ServiceRequest[]
  packages: PackageRecord[]
  bulkyItems: BulkyRecord[]
  audit: DemoAudit[]
  consents?: ConsentRecord
  cases: ReviewCase[]
  agreements: { version: string; acceptedAt: string; mode: 'Fictional preview' }[]
}

export interface CreateRequestInput {
  kind: RequestKind
  toteIds: string[]
  preferredDate: string
  preferredWindow: string
  address: string
  instructions: string
  packageId?: string
  cycleId?: string
  purpose?: 'Packed belongings' | 'Empty totes' | 'Final return'
  emptyAction?: 'Collection' | 'Redelivery' | 'Initial delivery'
  emptyConfirmed?: boolean
  packingPreference?: string
  unattended?: ServiceRequest['unattended']
  toteAcknowledgements?: Array<{
    toteId: string
    contentsDescription: string
    combinedContentsValue: number
    acknowledged: boolean
  }>
}

export interface SaveToteInput {
  nickname: string
  description: string
  combinedContentsValue?: number
  contentsAcknowledged?: boolean
}

export interface AddDemoToteInput extends SaveToteInput {
  packageId?: string
  size: ToteSizeId
  category: string
  status: ToteStatus
  tieNumber?: string
}
