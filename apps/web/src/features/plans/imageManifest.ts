/** Supply a reviewed src to replace a placeholder; never relabel illustrative work as verified photography. */
export interface PlanImage {
  key: string
  filename: string
  aspectRatio: `${number} / ${number}`
  description: string
  brief: string
  caption: string
  alt: string
  src?: string
  imageDisclosure?: string
}

export const planImages = {
  toteComparison: {
    key: 'tote-size-comparison', filename: 'tote-size-comparison.webp', aspectRatio: '4 / 3',
    description: 'Large and XL totes, side by side',
    brief: 'Side-by-side view of the actual Large and XL blue attached-lid tote models used by My Tote Keeper, on the same level surface, at accurate relative scale. Neutral background and consistent camera angle. Use verified product dimensions in commercial.ts: Large ATL21159 exterior 21.875 × 15.25 × 9.6875 inches; XL XLT271712 exterior 27 × 17 × 12 inches. Do not invent dimensions or exaggerate capacity.',
    caption: 'Planned image: our two tote sizes side by side, showing their relative size. Refer to the listed dimensions when checking whether your belongings will fit.',
    alt: 'Large and XL blue attached-lid totes shown side by side at the same scale.',
  },
  small: {
    key: 'small-plan-packing', filename: 'small-plan-packing-example.webp', aspectRatio: '4 / 3',
    description: 'A Small-plan seasonal packing example',
    brief: 'An illustrative everyday seasonal-storage load beside the actual totes included in Small: 2 Large or 1 XL. Show belongings unpacked and the corresponding packed arrangement in a clear two-panel composition. Avoid expensive valuables, prohibited items, visible batteries and unsupported claims about how many items fit. Verify current Small capacity in commercial.ts before production.',
    caption: 'Planned image: an example of the belongings a Small plan could hold. Final capacity depends on item size, shape, and packing.',
    alt: 'Illustrative seasonal belongings beside a Small-plan tote arrangement; not tested packing capacity.',
  },
  medium: {
    key: 'medium-plan-packing', filename: 'medium-plan-packing-example.webp', aspectRatio: '4 / 3',
    description: 'A Medium-plan closet-clearing example',
    brief: 'An illustrative closet-clearing load of seasonal clothing, spare bedding or household decorations beside actual Medium totes: 4 Large, 2 Large plus 1 XL, or 2 XL. Keep scale and quantity consistent with commercial.ts. Use a plausible assortment without presenting generated packing as verified capacity.',
    caption: 'Planned image: a Medium-plan packing example to help you picture the space. Your belongings may pack differently.',
    alt: 'Illustrative seasonal clothing and bedding beside a Medium-plan tote arrangement; not tested packing capacity.',
  },
  big: {
    key: 'big-plan-packing', filename: 'big-plan-packing-example.webp', aspectRatio: '4 / 3',
    description: 'Big-plan totes and one eligible bagged item',
    brief: 'An illustrative organized grouping of actual Big totes: up to 10 Large or 5 XL, or a mix within the current allowance. Include one eligible bagged bulky item only while annual Big includes it. Show a believable seasonal household collection at accurate scale. Do not imply every bulky item qualifies or that packing was physically verified. Recheck commercial.ts before production.',
    caption: 'Planned image: the Big plan’s tote capacity and, where included, one eligible bulky item. Bulky items require approval.',
    alt: 'Illustrative Big-plan tote arrangement with one bagged bulky item, subject to approval.',
  },
  reclaimedSpace: {
    key: 'reclaimed-space', filename: 'reclaimed-space-before-after.webp', aspectRatio: '16 / 9',
    description: 'The same corner, with a little room back',
    brief: 'A matched before-and-after view of the exact same modest Central Texas garage corner. Before: an ordinary, manageable cluster of seasonal boxes, decorations and occasional-use belongings, not hoarding or a hazardous scene. After: remove only the selected belongings. Preserve architecture, camera position, lighting and everything else. No renovation or exaggerated transformation; do not imply more volume than a featured plan can hold.',
    caption: 'Planned illustration: the same corner before and after occasional-use belongings move into storage. Results depend on what you store.',
    alt: 'Illustration of the same household corner before and after seasonal belongings are removed.',
  },
  crowdedGarage: {
    key: 'crowded-garage-corner', filename: 'crowded-garage-corner.webp', aspectRatio: '16 / 9',
    description: 'Seasonal boxes borrowing a corner of the garage',
    brief: 'A realistic household garage corner occupied by seasonal boxes, decorations and occasional-use belongings. Show an ordinary manageable storage problem, not hoarding, a hazardous scene or an enormous volume that the featured plan could not plausibly accommodate. Match the reclaimed-garage-corner camera position, architecture and lighting. No actual customer or premises claim.',
    caption: 'Planned illustration: seasonal belongings taking up a useful corner of the garage.',
    alt: 'Illustration of seasonal belongings occupying a modest household garage corner.',
  },
  reclaimedGarage: {
    key: 'reclaimed-garage-corner', filename: 'reclaimed-garage-corner.webp', aspectRatio: '16 / 9',
    description: 'The same garage corner, with space back',
    brief: 'The exact same garage corner, camera position, architecture and lighting as crowded-garage-corner, with the selected stored belongings removed. Preserve everything else. Show usable space without renovation or an unrealistic transformation. No actual customer or premises claim.',
    caption: 'Planned illustration: the same corner with occasional-use belongings moved into storage. Space reclaimed depends on what you store.',
    alt: 'Illustration of the same garage corner after selected seasonal belongings are removed.',
  },
  attic: {
    key: 'attic-storage-hassle', filename: 'attic-storage-hassle.webp', aspectRatio: '16 / 9',
    description: 'The seasonal attic shuffle',
    brief: 'Seasonal boxes stored in a recognizable residential attic, viewed from a safe, stationary perspective. Communicate awkward access without depicting someone carrying boxes on a ladder or modeling unsafe lifting. The service does not retrieve belongings inside homes; packed belongings are brought outside by the customer.',
    caption: 'Planned illustration: the seasonal attic shuffle our doorstep service can help you avoid. We collect packed belongings outside your home.',
    alt: 'Illustration of seasonal boxes in an attic, viewed from a stationary perspective with no ladder carrying.',
  },
  handoff: {
    key: 'doorstep-handoff', filename: 'doorstep-tote-handoff.webp', aspectRatio: '3 / 2',
    description: 'A scheduled outdoor tote handoff',
    brief: 'An illustrative collection of closed blue attached-lid totes at an ordinary residential doorstep or driveway. Communicate an outdoor handoff with no home entry. Do not imply unattended pickup is automatically allowed. Do not invent an identifiable employee, branded vehicle or real customer.',
    caption: 'Planned illustration: a scheduled doorstep or driveway handoff. We confirm appointments and do not enter your home.',
    alt: 'Illustration of closed blue attached-lid totes ready for a confirmed outdoor handoff.',
  },
} satisfies Record<string, PlanImage>
