

## Problem Analysis

The `prompt_text` built in `buildAnimationPromptPackage` (Index.tsx lines 240-270) is mostly **visual/structural instructions** followed by a raw JSON dump. The script (hook, body, CTA, full_script) is buried inside the JSON under `guion_variante_para_esta_imagen` — but if `animation_prompt_json` comes back empty from the AI (which happens when the response is truncated), the entire JSON is a generic fallback with empty strings for the script fields. Sora receives no dialogue instructions, which likely contributes to generation failures.

Additionally:
- The "Ocultar detalles" collapsible section duplicates info already in the prompt
- The KlingAnimationPanel at the bottom is no longer needed

## Plan

### 1. Rebuild `prompt_text` to explicitly include the script as first-class content

In `src/pages/Index.tsx`, rewrite `buildAnimationPromptPackage` so the **prompt_text** has three clear sections:
1. **Visual direction** — actor description, scene, camera, lighting (short)
2. **Script/Dialogue** — the full spoken script (hook → body → CTA) written out as plain text, not buried in JSON
3. **Execution JSON** — the complete blueprint as a single JSON block containing ALL data (visual + script + timeline + constraints)

The JSON will include `guion_variante_para_esta_imagen` with the actual script text populated from `variant.script_variant`.

### 2. Remove "Ocultar detalles" section from VariantCard

In `src/components/VariantCard.tsx`, delete lines 479-511 (the collapsible details button, the `showDetails` state, and the `Detail` components). Remove unused imports (`ChevronDown`, `ChevronUp`) and the `showDetails` state.

### 3. Remove KlingAnimationPanel from ResultsView

In `src/components/ResultsView.tsx`, remove the conditional render of `KlingAnimationPanel` (lines 64-71) and its import.

### Files to modify

| File | Change |
|---|---|
| `src/pages/Index.tsx` | Rewrite `buildAnimationPromptPackage` — put script text explicitly in prompt_text AND in the JSON |
| `src/components/VariantCard.tsx` | Remove "Ocultar detalles" collapsible section and related state/imports |
| `src/components/ResultsView.tsx` | Remove KlingAnimationPanel import and render block |

