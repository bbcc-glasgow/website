/**
 * Project card variants: named colour presets for the project content model.
 *
 * Editors pick a named variant in Decap CMS instead of typing raw CSS colour
 * values, so a project card can never be left with an invalid colour. The
 * variant-to-colour mapping lives here, in code.
 *
 * The set is derived from the colour combinations the five original project
 * files used (teal, pink, amber). A project without a variant, or with an
 * unknown one, resolves to the default variant rather than broken styling.
 */

export const PROJECT_VARIANTS = ["teal", "pink", "amber"] as const;
export type ProjectVariant = (typeof PROJECT_VARIANTS)[number];

export interface ProjectVariantColours {
  tagColour: string;
  tagBgColour: string;
  borderColour: string;
}

/** Default variant used when a project has no (or an unknown) variant. */
export const DEFAULT_PROJECT_VARIANT: ProjectVariant = "teal";

const projectVariantColours: Record<ProjectVariant, ProjectVariantColours> = {
  teal: {
    tagColour: "var(--teal-dark)",
    tagBgColour: "rgba(0,168,150,0.1)",
    borderColour: "var(--teal)",
  },
  pink: {
    tagColour: "var(--pink)",
    tagBgColour: "rgba(220,26,132,0.1)",
    borderColour: "var(--pink)",
  },
  amber: {
    tagColour: "#8a5f00",
    tagBgColour: "rgba(244,161,0,0.12)",
    borderColour: "var(--amber)",
  },
};

export function isProjectVariant(value: unknown): value is ProjectVariant {
  return (PROJECT_VARIANTS as readonly string[]).includes(value as string);
}

/** Resolve a project's card colours, falling back to the default variant. */
export function resolveProjectVariantColours(
  variant: unknown,
): ProjectVariantColours {
  return isProjectVariant(variant)
    ? projectVariantColours[variant]
    : projectVariantColours[DEFAULT_PROJECT_VARIANT];
}

// The CTA icon names used to live here, when only project cards had buttons.
// They now belong to the whole site along with the rest of the CTA model, in
// src/lib/cta.ts.
