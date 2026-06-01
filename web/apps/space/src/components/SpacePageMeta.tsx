import Head from "next/head";
import React from "react";
import { onboardingDescription } from "screens/OnboardingScreen";

interface SpacePageMetaProps {
    themeColor: string;
    title?: string;
}

export const SpacePageMeta: React.FC<SpacePageMetaProps> = ({
    themeColor,
    title,
}) => (
    <Head>
        {title && <title>{title}</title>}
        <meta name="theme-color" content={themeColor} />
        <meta name="robots" content="noindex,nofollow" />
        <meta name="description" content={onboardingDescription} />
    </Head>
);
