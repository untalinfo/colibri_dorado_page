# Higgsfield Prompt Engineering & Quality Guide

To get consistent, high-end output from video and image diffusion models, prompts must follow a strict architectural structure rather than casual conversational descriptions.

---

## 1. The Anatomy of a High-Fidelity Video Prompt

A professional video generation prompt contains 6 distinct components:

```
[CAMERA & SHOT TYPE] + [SUBJECT & MICRO-ACTION] + [ENVIRONMENT & ATMOSPHERE] + [LIGHTING DYNAMICS] + [TEXTURE & RENDER FIDELITY] + [CONSTRAINTS / NEGATIVES]
```

### Component Breakdown:
1. **Camera & Shot Type**:
   - *Good*: "Locked-off tripod shot with subtle ambient breathing", "Slow forward dolly push-in at eye level", "Extreme close-up macro lens".
   - *Bad*: "Moving camera" (causes wild perspective warping).
2. **Subject & Micro-Action**:
   - Describe subtle, physically plausible movements. Diffusion models excel at organic drifts, wind fluttering, and micro-hovering, but struggle with sudden multi-step actions.
   - *Good*: "A tiny honeybee gently hovers between dew drops on a mossy branch".
   - *Bad*: "A bee flies to a flower, drinks nectar, turns around and flies into the hive".
3. **Environment & Atmosphere**:
   - Depth cues: "Misty Andean cloud forest, layered foreground ferns, soft volumetric fog".
4. **Lighting Dynamics**:
   - "Soft morning golden hour sunbeams, caustic reflections, warm rim light".
5. **Texture & Style**:
   - "Organic 4k botanical documentary texture, rich natural depth of field".
6. **Constraints (Negative Prompts)**:
   - "Constraints: no fast motion, no jump cuts, no camera shake, no morphing or unnatural warping, no cartoon 3D CGI rendering, no text, no watermarks".

---

## 2. Prompt Formula for Still Images

For isometric illustrations or marketing stills:

```
[STYLE PREAMBLE] + [BACKGROUND CONTEXT] + [COLOR PALETTE] + [CENTRAL SUBJECT] + [LIGHTING] + [CONSTRAINTS]
```

### Example:
> "Soft matte low-poly clay diorama, isometric view, tilt-shift miniature focus. Placed on a solid clean neutral background with a soft contact shadow. Warm honey, amber gold, and forest green tones. Subject: An artisanal honey jar with a wooden dipper resting on an aged wood slice surrounded by mountain wildflowers. Warm morning diffused light. No text, no logos, centered composition."

---

## 3. The 3 Prompt Variations Template (For when the user has no prompt)

When the user asks for suggestions, present 3 distinct styles:

### Option A — Cinematic Documentary
- Focus: Natural realism, subtle slow-motion, rich atmospheric lighting, botanical/physical textures.
- Tone: Calming, organic, premium.

### Option B — Commercial Studio / Editorial
- Focus: Controlled studio lighting, pristine clean backgrounds or elegant marble surfaces, razor-sharp focus on the hero object, gentle rotation or light sweep.
- Tone: Luxury, high-end commercial.

### Option C — Stylized / Minimalist Diorama
- Focus: Tactile miniature aesthetic, warm isometric lighting, soft shadows, playful yet refined composition.
- Tone: Friendly, accessible, modern craft.
