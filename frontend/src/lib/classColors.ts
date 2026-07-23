/**
 * Single source of truth for surface-class colors, shared by Map Explorer and
 * Areas so the palette is UNIFORM across the app. Plastic gets the salient brand
 * teal; Algae is a distinct lime (deliberately NOT near plastic's teal, so a
 * scan dominated by algae never reads as plastic). Kept in one place after the
 * two pages drifted to different algae greens (#10B981 vs #84CC16).
 */
export const CLASS_COLORS: Record<string, string> = {
  Plastic: '#0D9488',   // teal — the signal
  Algae: '#84CC16',     // lime — clearly not teal
  Sea_Foam: '#38BDF8',  // sky
  Water: '#94A3B8',     // slate grey
};

export const CLASS_ORDER = ['Plastic', 'Algae', 'Sea_Foam', 'Water'];
