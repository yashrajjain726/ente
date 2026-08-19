/**
 * The auth palette, exposed as CSS variables.
 *
 * Declared globally by {@link PhotosAuthShell} (via MUI's GlobalStyles) while
 * an auth screen is mounted, so the `var(--photos-auth-*)` consumers in this
 * directory resolve anywhere in the document — including MUI portals
 * (dialogs, menus, snackbars), which mount outside the shell's DOM subtree.
 *
 * Both selectors have zero specificity, so source order alone lets the dark
 * block win whenever the color scheme class (`colorSchemeSelector: "class"`
 * in the app theme) is present on an ancestor.
 */
export const authColorVariables = {
    ":where(:root)": {
        "--photos-auth-primary": "#08c225",
        "--photos-auth-primary-hover": "#069d1e",
        "--photos-auth-primary-active": "#057c18",
        "--photos-auth-success": "#069d1e",
        "--photos-auth-warning": "#f63a3a",
        "--photos-auth-caution": "#f08a1e",
        "--photos-auth-text": "#000",
        "--photos-auth-text-muted": "#666",
        "--photos-auth-text-faint": "#969696",
        "--photos-auth-text-disabled": "#d6d6d6",
        "--photos-auth-field": "#fff",
        "--photos-auth-fill": "#eaeaea",
        "--photos-auth-fill-hover": "#dedede",
        "--photos-auth-fill-active": "#d2d2d2",
        "--photos-auth-stroke": "#e0e0e0",
    },
    "*:where(.dark)": {
        "--photos-auth-success": "#08c225",
        "--photos-auth-text": "#fff",
        "--photos-auth-text-muted": "#999",
        "--photos-auth-text-disabled": "#4d4d4d",
        "--photos-auth-field": "#1a1a1a",
        "--photos-auth-fill": "#0a0a0a",
        "--photos-auth-fill-hover": "#1a1a1a",
        "--photos-auth-fill-active": "#292929",
        "--photos-auth-stroke": "#3e3e3e",
    },
};

/**
 * The auth layout's mobile cutoff.
 *
 * Both queries derive from the same constant. The 0.05px epsilon (the same
 * one MUI's breakpoint helpers use) keeps fractional viewport widths from
 * falling between the two queries.
 */
const authMobileCutoffPx = 640;
export const authMobileMediaQuery = `@media (max-width: ${authMobileCutoffPx - 0.05}px)`;
export const authAboveMobileMediaQuery = `@media (min-width: ${authMobileCutoffPx}px)`;

/**
 * styled() options that keep `$`-prefixed transient props off the DOM.
 *
 * All transient props in this directory use the `$` prefix, so every
 * styled() call with transient props can share this filter.
 */
export const authTransientProps = {
    shouldForwardProp: (prop: string) => !prop.startsWith("$"),
};

/** The display font used for headlines and the OTP digits. */
export const authDisplayFontFamily = '"Outfit Variable", sans-serif';

/** The keyboard focus indicator shared by the interactive components. */
export const authFocusRing = {
    outline: "1px solid var(--photos-auth-primary)",
    outlineOffset: "2px",
};

export const authBodyTypography = {
    fontSize: "14px",
    fontWeight: 500,
    lineHeight: "20px",
};

export const authMiniTypography = {
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: "16px",
};
