export type ToteStatus = 'At home' | 'In storage'
export type RequestKind = 'Collection' | 'Return delivery'
export type RequestStatus = 'Awaiting confirmation' | 'Confirmed' | 'Cancelled'

export interface ToteMovement {
  date: string
  label: string
  detail: string
}

export interface Tote {
  id: string
  nickname: string
  category: string
  description: string
  combinedContentsValue?: number
  contentsAcknowledged?: boolean
  status: ToteStatus
  tieNumber?: string
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
  plan: string
  toteAllowance: number
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