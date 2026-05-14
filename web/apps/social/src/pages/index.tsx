import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import {
    OnboardingScreen,
    addFriendOnboardingDescription,
    addFriendOnboardingTitle,
    onboardingGreen,
} from "screens/OnboardingScreen";
import { profileBackground } from "screens/ProfileScreen";
import { PublicProfileScreen } from "screens/PublicProfileScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import {
    type OnboardingEntrySource,
    useSocialAppState,
} from "state/socialAppState";
import {
    addFriendLinkOnboardingSource,
    onboardingSourceSearchParam,
    socialRoutes,
} from "utils/socialRoutes";

const samplePublicProfileData = {
    avatarUrl: "/images/sample-avatar.jpg",
    fullName: "Anand Baburajan",
    username: "anandbaburajan",
};

interface PublicProfileLink {
    token: string;
    username: string;
}

type RouteMode =
    | { kind: "checking" }
    | { kind: "app" }
    | ({ kind: "public-profile" } & PublicProfileLink);

const parsePublicProfileLink = (): PublicProfileLink | null => {
    const match = /^\/([^/]+)\/?$/.exec(window.location.pathname);
    const token = window.location.hash.slice(1);
    if (!match || !token) return null;

    try {
        const username = decodeURIComponent(match[1] ?? "").trim();
        return username ? { token, username } : null;
    } catch {
        return null;
    }
};

const parseOnboardingEntrySource = (): OnboardingEntrySource => {
    const params = new URLSearchParams(window.location.search);
    return params.get(onboardingSourceSearchParam) ==
        addFriendLinkOnboardingSource
        ? "add-friend-link"
        : "direct";
};

const removeOnboardingEntrySourceFromURL = () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(onboardingSourceSearchParam)) return;

    url.searchParams.delete(onboardingSourceSearchParam);
    window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
    );
};

const publicProfileFromLink = (): SetupProfile => ({
    avatarUrl: samplePublicProfileData.avatarUrl,
    fullName: samplePublicProfileData.fullName,
    username: samplePublicProfileData.username,
});

const Page: React.FC = () => {
    const router = useRouter();
    const {
        onboardingEntrySource,
        profile,
        profileLoadStatus,
        setOnboardingEntrySource,
    } = useSocialAppState();
    const [routeMode, setRouteMode] = useState<RouteMode>({ kind: "checking" });

    useEffect(() => {
        const publicProfileLink = parsePublicProfileLink();
        if (!publicProfileLink) {
            setOnboardingEntrySource(parseOnboardingEntrySource());
            removeOnboardingEntrySourceFromURL();
        }
        setRouteMode(
            publicProfileLink
                ? { kind: "public-profile", ...publicProfileLink }
                : { kind: "app" },
        );
    }, [setOnboardingEntrySource]);

    useEffect(() => {
        if (
            routeMode.kind == "app" &&
            profileLoadStatus == "ready" &&
            profile
        ) {
            void router.replace(socialRoutes.home);
        }
    }, [profile, profileLoadStatus, routeMode.kind, router]);

    if (
        routeMode.kind == "checking" ||
        (routeMode.kind == "app" &&
            (profileLoadStatus == "loading" || Boolean(profile)))
    ) {
        return <SocialRouteFallback background={profileBackground} />;
    }

    if (routeMode.kind == "public-profile") {
        return (
            <>
                <SocialPageMeta themeColor={profileBackground} />
                <PublicProfileScreen
                    profile={publicProfileFromLink()}
                    onAddFriend={() => {
                        setOnboardingEntrySource("add-friend-link");
                        window.location.assign(
                            `/?${onboardingSourceSearchParam}=${addFriendLinkOnboardingSource}`,
                        );
                    }}
                />
            </>
        );
    }

    const isAddFriendLinkOnboarding =
        onboardingEntrySource == "add-friend-link";

    return (
        <>
            <SocialPageMeta themeColor={onboardingGreen} />
            <OnboardingScreen
                description={
                    isAddFriendLinkOnboarding
                        ? addFriendOnboardingDescription
                        : undefined
                }
                onCreateAccount={() => void router.push(socialRoutes.signup)}
                onLogin={() => void router.push(socialRoutes.login)}
                title={
                    isAddFriendLinkOnboarding
                        ? addFriendOnboardingTitle
                        : undefined
                }
            />
        </>
    );
};

export default Page;
