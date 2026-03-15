// UGC Intent Controls — structured semantic context for UGC video generation

export type CreativeType = "recomendacion" | "testimonio" | "demo" | "problema_solucion" | "before_after" | "storytime";
export type VoiceMode = "dialogo_exacto" | "dialogo_guiado" | "sin_voz";
export type BodyTarget = "axilas" | "cara" | "manos" | "cuerpo" | "cabello" | "otra";
export type NarrativeStructure = "hook_solucion_cta" | "hook_demo_cta" | "story_producto_cta" | "demo_first";
export type ShotPattern = "one_take" | "3_cuts_ugc" | "selfie_closeup_cta" | "review_style";
export type ProductVisibility = "siempre_visible" | "demo_cierre" | "hero_final";
export type RealismLevel = "maximo" | "balanceado" | "pulido";
export type CtaMode = "carrito_naranja" | "comprar_ahora" | "descubrir_mas" | "ninguno";

export interface UgcIntent {
  creative_type: CreativeType;
  voice_mode: VoiceMode;
  body_target: BodyTarget;
  narrative_structure: NarrativeStructure;
  shot_pattern: ShotPattern;
  product_visibility: ProductVisibility;
  realism_level: RealismLevel;
  cta_mode: CtaMode;
  product_lock: boolean;
  character_lock: boolean;
  dialogue_lock: boolean;
}

export const DEFAULT_INTENT: UgcIntent = {
  creative_type: "recomendacion",
  voice_mode: "dialogo_guiado",
  body_target: "cara",
  narrative_structure: "hook_solucion_cta",
  shot_pattern: "3_cuts_ugc",
  product_visibility: "demo_cierre",
  realism_level: "maximo",
  cta_mode: "comprar_ahora",
  product_lock: true,
  character_lock: true,
  dialogue_lock: false,
};

export interface UgcPreset {
  id: string;
  label: string;
  emoji: string;
  intent: Partial<UgcIntent>;
}

export const UGC_PRESETS: UgcPreset[] = [
  {
    id: "recomendacion",
    label: "UGC Recomendación",
    emoji: "💬",
    intent: {
      creative_type: "recomendacion",
      voice_mode: "dialogo_guiado",
      narrative_structure: "hook_solucion_cta",
      shot_pattern: "3_cuts_ugc",
      product_visibility: "demo_cierre",
      realism_level: "maximo",
      product_lock: true,
      character_lock: true,
    },
  },
  {
    id: "problema_solucion",
    label: "Problema → Solución",
    emoji: "🔄",
    intent: {
      creative_type: "problema_solucion",
      voice_mode: "dialogo_guiado",
      narrative_structure: "hook_solucion_cta",
      shot_pattern: "3_cuts_ugc",
      product_visibility: "demo_cierre",
      realism_level: "maximo",
    },
  },
  {
    id: "review_cta",
    label: "Review con CTA",
    emoji: "⭐",
    intent: {
      creative_type: "testimonio",
      voice_mode: "dialogo_guiado",
      narrative_structure: "story_producto_cta",
      shot_pattern: "review_style",
      product_visibility: "siempre_visible",
      cta_mode: "carrito_naranja",
    },
  },
  {
    id: "demo_natural",
    label: "Demo Natural",
    emoji: "🎬",
    intent: {
      creative_type: "demo",
      voice_mode: "sin_voz",
      narrative_structure: "demo_first",
      shot_pattern: "selfie_closeup_cta",
      product_visibility: "siempre_visible",
      realism_level: "maximo",
    },
  },
];

// Labels for UI display
export const LABELS: Record<string, Record<string, string>> = {
  creative_type: {
    recomendacion: "Recomendación",
    testimonio: "Testimonio",
    demo: "Demo",
    problema_solucion: "Problema → Solución",
    before_after: "Before / After",
    storytime: "Storytime",
  },
  voice_mode: {
    dialogo_exacto: "Diálogo exacto",
    dialogo_guiado: "Diálogo guiado",
    sin_voz: "Sin voz",
  },
  body_target: {
    axilas: "Axilas",
    cara: "Cara",
    manos: "Manos",
    cuerpo: "Cuerpo",
    cabello: "Cabello",
    otra: "Otra",
  },
  narrative_structure: {
    hook_solucion_cta: "Hook → Solución → CTA",
    hook_demo_cta: "Hook → Demo → CTA",
    story_producto_cta: "Story → Producto → CTA",
    demo_first: "Demo-first",
  },
  shot_pattern: {
    one_take: "One take",
    "3_cuts_ugc": "3 cuts UGC",
    selfie_closeup_cta: "Selfie + close-up + CTA",
    review_style: "Review style",
  },
  product_visibility: {
    siempre_visible: "Siempre visible",
    demo_cierre: "Demo + cierre",
    hero_final: "Solo hero final",
  },
  realism_level: {
    maximo: "Máximo realismo",
    balanceado: "Balanceado",
    pulido: "Más pulido",
  },
  cta_mode: {
    carrito_naranja: "Carrito naranja",
    comprar_ahora: "Comprar ahora",
    descubrir_mas: "Descubrir más",
    ninguno: "Ninguno",
  },
};
