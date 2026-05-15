const baseConfig = require("ente-base/next.config.base.js");

module.exports = {
    ...baseConfig,
    transpilePackages: Array.from(
        new Set([...(baseConfig.transpilePackages || []), "ente-media"]),
    ),
    // Static deployments serve arbitrary profile links through index.html.
    // In development, mirror that behavior with a fallback rewrite.
    ...(process.env.NODE_ENV === "development" && {
        output: undefined,
        async rewrites() {
            return {
                fallback: [
                    {
                        source: "/:path((?!_next|images|favicon.ico).*)",
                        destination: "/",
                    },
                ],
            };
        },
    }),
};
