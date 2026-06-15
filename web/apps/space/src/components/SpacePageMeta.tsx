import Head from "next/head";
import React from "react";
import { onboardingDescription } from "screens/OnboardingScreen";

interface SpacePageMetaProps {
    themeColor: string;
}

export const SpacePageMeta: React.FC<SpacePageMetaProps> = ({ themeColor }) => (
    <Head>
        <meta name="theme-color" content={themeColor} />
        <meta name="robots" content="noindex,nofollow" />
        <meta name="description" content={onboardingDescription} />
    </Head>
);
