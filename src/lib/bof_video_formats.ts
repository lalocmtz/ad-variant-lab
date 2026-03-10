export interface BofFormat {
  format_id: string;
  format_name: string;
  psychology: string;
  scene_plan: string[];
  script_rules: string[];
  camera_rules: string[];
  background_rules: string[];
  cta_style: string;
  duration_range: [number, number];
}

export const BOF_FORMATS: BofFormat[] = [
  {
    format_id: "01_LO_SIENTO_POR_LOS_QUE",
    format_name: "Lo siento por los que…",
    psychology: "Reverse exclusion + curiosity. Makes viewers feel they're missing out if they haven't tried the product.",
    scene_plan: [
      "Hook: creator close-up with empathetic/teasing expression",
      "Product reveal: handheld product showcase",
      "CTA: urgency close"
    ],
    script_rules: [
      "Open with 'Lo siento por los que…' or a variation",
      "Frame the product as something others are missing",
      "Keep tone playful, not aggressive",
      "End with urgency CTA"
    ],
    camera_rules: ["handheld", "phone aesthetic", "fast pacing", "close-up dominant"],
    background_rules: ["casual home setting", "natural clutter", "lived-in environment"],
    cta_style: "urgency",
    duration_range: [7, 10],
  },
  {
    format_id: "02_PROBLEM_SOLVER_DEMO",
    format_name: "Problem Solver Demo",
    psychology: "Pain point agitation → instant relief via product demonstration.",
    scene_plan: [
      "Hook: state the problem dramatically",
      "Demo: show product solving it in real-time",
      "Result: before/after or satisfaction moment",
      "CTA: buy now"
    ],
    script_rules: [
      "Open by naming a specific, relatable pain point",
      "Show the product in action solving it",
      "React genuinely to the result",
      "Close with simple purchase CTA"
    ],
    camera_rules: ["handheld", "POV or close-up", "quick cuts", "demo-focused framing"],
    background_rules: ["contextual to the problem", "bathroom/kitchen/desk", "real environment"],
    cta_style: "direct_purchase",
    duration_range: [8, 12],
  },
  {
    format_id: "03_SHOCK_VALUE_DISCOVERY",
    format_name: "Shock Value Discovery",
    psychology: "Pattern interrupt + discovery dopamine. Stops scrolling with unexpected reveal.",
    scene_plan: [
      "Hook: shocking statement or visual",
      "Reveal: product as the surprising answer",
      "Proof: quick demo or social proof",
      "CTA: limited availability"
    ],
    script_rules: [
      "Open with a bold, unexpected claim",
      "Reveal the product as the 'secret'",
      "Add a quick proof element",
      "End with scarcity or exclusivity CTA"
    ],
    camera_rules: ["handheld", "dramatic angle changes", "fast zoom-ins", "reaction shots"],
    background_rules: ["high contrast", "eye-catching setting", "can be dramatic"],
    cta_style: "scarcity",
    duration_range: [7, 10],
  },
  {
    format_id: "04_PRICE_DROP",
    format_name: "Price Drop",
    psychology: "Anchoring bias + deal urgency. Shows old price vs new price to trigger impulse buying.",
    scene_plan: [
      "Hook: mention original/high price",
      "Reveal: show the deal/discount",
      "Product showcase: quick feature highlight",
      "CTA: price expires soon"
    ],
    script_rules: [
      "Anchor with the old/high price first",
      "Reveal the current lower price with excitement",
      "Briefly highlight why the product is worth it",
      "Close with time-limited CTA"
    ],
    camera_rules: ["handheld", "product close-ups", "price gesture emphasis", "energetic pacing"],
    background_rules: ["simple background", "product-focused", "minimal distractions"],
    cta_style: "price_urgency",
    duration_range: [7, 10],
  },
  {
    format_id: "05_FOMO_RESTOCK",
    format_name: "FOMO / Restock",
    psychology: "Scarcity + social proof. Implies high demand and limited availability.",
    scene_plan: [
      "Hook: 'Finally back in stock' or 'Last units'",
      "Social proof: mention demand/sold out history",
      "Product showcase: unboxing or holding",
      "CTA: grab it before it's gone"
    ],
    script_rules: [
      "Open emphasizing scarcity or restock moment",
      "Add social proof (sold out X times, everyone asking)",
      "Quick product highlight",
      "End with 'don't miss it' CTA"
    ],
    camera_rules: ["handheld", "unboxing style", "excited energy", "package reveal"],
    background_rules: ["desk/table setup", "package visible", "casual home"],
    cta_style: "fomo",
    duration_range: [7, 12],
  },
];

export function getFormatById(id: string): BofFormat | undefined {
  return BOF_FORMATS.find(f => f.format_id === id);
}
