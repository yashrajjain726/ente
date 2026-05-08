const profileSecret = "5d2a9WhmD2NU";

export const profileLinkForUsername = (username: string) =>
    `https://ente.gg/${encodeURIComponent(username || "anandbaburajan")}#${profileSecret}`;
