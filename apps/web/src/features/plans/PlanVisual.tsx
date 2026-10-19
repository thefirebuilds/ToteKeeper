import { useState } from 'react'
import type { PlanImage } from './imageManifest'

export function PlanVisual({ image }: { image: PlanImage }) {
  const [failedSrc, setFailedSrc] = useState<string>()
  const installed = image.src && image.src !== failedSrc
  return <figure className="plan-visual" data-asset-key={image.key}>
    <div className="plan-visual-frame" style={{ aspectRatio: image.aspectRatio }}>
      {installed ? <img src={image.src} alt={image.alt} loading="lazy" onError={() => setFailedSrc(image.src)} /> : <div className="plan-visual-placeholder"><span aria-hidden="true">▱</span><strong>Image coming soon.</strong><p>{image.description}</p></div>}
    </div>
    <figcaption>{image.caption}{installed && image.imageDisclosure && <span> {image.imageDisclosure}</span>}</figcaption>
  </figure>
}
