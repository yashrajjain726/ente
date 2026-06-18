import Head from "next/head";
import React from "react";
import { onboardingDescription } from "screens/OnboardingScreen";

const spacePreviewTitle = "Add me on Ente Space";

interface SpacePageMetaProps {
    themeColor: string;
    invitePreview?: boolean;
}

export const SpacePageMeta: React.FC<SpacePageMetaProps> = ({
    invitePreview,
    themeColor,
}) => (
    <Head>
        <meta name="theme-color" content={themeColor} />
        <meta name="robots" content="noindex,nofollow" />
        <meta name="description" content={onboardingDescription} />
        {invitePreview && (
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
