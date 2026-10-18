export type ToteStatus = 'At home' | 'In storage'
export type ToteSizeId = 'large' | 'xl'
export type RequestKind = 'Collection' | 'Return delivery'
export type RequestStatus = 'Awaiting confirmation' | 'Confirmed' | 'Cancelled'

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
}

export interface CreateRequestInput {
  kind: RequestKind
  toteIds: string[]
  preferredDate: string
  preferredWindow: string
  address: string
  instructions: string
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
  size: ToteSizeId
  category: string
  status: ToteStatus
  tieNumber?: string
}