export const socialWallMessageTextMaxLength = 1000;

export const clampSocialWallMessageText = (text: string) =>
    Array.from(text).slice(0, socialWallMessageTextMaxLength).join("");

export const normalizeSocialWallMessageText = (text: string) => {
    const trimmed = text.trim();
    if (Array.from(trimmed).length > socialWallMessageTextMaxLength) {
        throw new Error(
            `Message must be ${socialWallMessageTextMaxLength} characters or less.`,
        );
    }
    return trimmed;
};
