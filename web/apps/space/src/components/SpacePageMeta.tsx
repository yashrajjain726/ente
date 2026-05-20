import Head from "next/head";
import React from "react";
import { onboardingDescription } from "screens/OnboardingScreen";

interface SpacePageMetaProps {
    themeColor: string;
}

export const SpacePageMeta: React.FC<SpacePageMetaProps> = ({ themeColor }) => (
    <Head>
        <meta name="theme-color" content={themeColor} />
        <meta name="description" content={onboardingDescription} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
        />
        <link
            href="https://fonts.googleapis.com/css2?family=Nunito:wght@800&display=swap"
            rel="stylesheet"
        />
    </Head>
);
