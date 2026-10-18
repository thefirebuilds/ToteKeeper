import largeToteImage from '../assets/images/large_tote.jpeg'
import xlToteImage from '../assets/images/XL_tote.jpeg'
import { SERVICE_CONFIG as COMMERCIAL } from './commercial'
export * from './commercial'

export const SERVICE_CONFIG = {
  ...COMMERCIAL,
  toteSizes: {
    large: { ...COMMERCIAL.toteSizes.large, image: largeToteImage, imageAlt: 'Blue Large storage tote with attached flip-top lids open' },
    xl: { ...COMMERCIAL.toteSizes.xl, image: xlToteImage, imageAlt: 'Blue XL storage tote with attached interlocking lids closed' },
  },
} as const
