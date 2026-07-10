import Head from "next/head";
import React from "react";
import { onboardingDescription } from "screens/OnboardingScreen";

const spacePreviewTitle = "Add me on Ente Space";
const previewImages = {
    home: "https://ente.space/images/meta.jpg",
    invite: "https://ente.space/images/meta-invite.jpg",
} as const;

interface SpacePageMetaProps {
    preview?: keyof typeof previewImages;
    themeColor: string;
}

export const SpacePageMeta: React.FC<SpacePageMetaProps> = ({
    preview,
    themeColor,
}) => {
    const previewImage = preview && previewImages[preview];

    return (
        <Head>
            <meta name="theme-color" content={themeColor} />
            <meta name="robots" content="noindex,nofollow" />
            <meta name="description" content={onboardingDescription} />
            {previewImage && (
                <>
                    <meta property="og:image" content={previewImage} />
                    <meta property="og:image:type" content="image/jpeg" />
                    <meta property="og:image:width" content="1200" />
                    <meta property="og:image:height" content="630" />
                    <meta name="twitter:card" content="summary_large_image" />
                    <meta name="twitter:image" content={previewImage} />
                </>
            )}
            {preview == "invite" && (
                <>
                    <meta property="og:title" content={spacePreviewTitle} />
                    <meta
                        property="og:description"
                        content={onboardingDescription}
                    />
                    <meta name="twitter:title" content={spacePreviewTitle} />
                    <meta
                        name="twitter:description"
                        content={onboardingDescription}
                    />
                </>
            )}
        </Head>
    );
};
