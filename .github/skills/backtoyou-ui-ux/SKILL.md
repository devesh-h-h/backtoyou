---
name: backtoyou-ui-ux
description: Design and refine BackToYou interfaces with a premium, dark, cinematic, accessible lost-and-found product visual language.
---

# BackToYou UI/UX

Use this skill for visual design, layout, interaction, responsive behavior, and frontend polish in BackToYou.

## Product direction

The old temporary blue theme is completely discarded. Do not use generic blue dashboard templates. BackToYou should feel like a real modern startup/product: premium, dark, minimal, cinematic, modern, spacious, typographically strong, and responsive.

Use the actual BackToYou logo as the primary branding reference. Derive accents intentionally from its palette: deep purple, blue, violet, pink/coral, white, near-black, and muted gray/lavender. Do not force all of these colors into every surface.

Avoid generic dashboards, excessive gradients, excessive glassmorphism, excessive shadows, excessive rounded cards, visual clutter, fake metrics, and unnecessary animation.

## Layout and visual system

- Establish a clear visual hierarchy through type scale, contrast, alignment, and intentional whitespace.
- Use strong typography, restrained borders, refined surfaces, and purposeful composition.
- Give each major page an appropriate layout rather than repeating one card grid:
  - Home: brand-led, editorial/product introduction.
  - Browse Items: catalogue/search and filtering surface.
  - Report Lost and Report Found: focused, reassuring form experiences.
  - Possible Matches: comparison and confidence/results layout.
  - My Reports: personal workspace/timeline or grouped status view.
  - Admin Portal: operational console with clear permissions and dense-but-readable data.
  - Profile/Settings: calm settings and preference layout.
  - Authentication: focused, trustworthy entry experience.
- Use consistent spacing, alignment, status language, and responsive breakpoints.
- Prefer meaningful content hierarchy over decorative UI.

## Interaction and states

- Use subtle, smooth, purposeful, performant motion only.
- Respect `prefers-reduced-motion`; never make essential information depend on animation.
- Design intentional hover, focus, pressed, disabled, and keyboard states.
- Provide clear loading, empty, validation-error, server-error, success, claimed, returned, pending, approved, and rejected states.
- Do not manufacture metrics, counts, testimonials, or content to fill empty space.
- The logo may be a dynamic brand element with subtle animation, but it must remain recognizable and accessible.

## Accessibility and responsive design

- Use semantic HTML, accessible names, labels, focus order, and visible focus indicators.
- Maintain usable contrast and readable line lengths.
- Do not rely on color alone for status or validation.
- Make forms, dialogs, menus, images, and status changes usable with keyboard and assistive technology.
- Design mobile-first behavior for narrow screens, touch targets, long text, image previews, and stacked layouts.
- Test responsive layouts and mobile behavior rather than assuming desktop CSS will collapse correctly.

Before changing existing UI, inspect the current component and its behavior, preserve functionality, and make the smallest coherent visual change.
