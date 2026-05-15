import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
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
    clearPendingSocialInvite,
    savePendingSocialInvite,
    socialInviteFromLocation,
    type PendingSocialInvite,
} from "services/socialInvite";
import {
    joinSocialInvite,
    loadPublicSocialInvite,
    type SocialWallPost,
} from "services/socialWall";
import {
    type OnboardingEntrySource,
    useSocialAppState,
} from "state/socialAppState";
import {
    addFriendLinkOnboardingSource,
    onboardingSourceSearchParam,
    socialRoutes,
} from "utils/socialRoutes";
import { profilePostGroupsFromPosts } from "utils/socialWallDisplay";

type RouteMode =
    | { kind: "checking" }
    | { kind: "app" }
    | ({ kind: "public-profile" } & PendingSocialInvite);

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

const Page: React.FC = () => {
    const router = useRouter();
    const {
        onboardingEntrySource,
        profile,
        profileLoadStatus,
        setOnboardingEntrySource,
    } = useSocialAppState();
    const [routeMode, setRouteMode] = useState<RouteMode>({ kind: "checking" });
    const [publicProfile, setPublicProfile] = useState<SetupProfile | null>(
        null,
    );
    const [publicFriendsCount, setPublicFriendsCount] = useState(0);
    const [publicPosts, setPublicPosts] = useState<SocialWallPost[]>([]);
    const [publicError, setPublicError] = useState<string>();
    const publicPostGroups = useMemo(
        () => profilePostGroupsFromPosts(publicPosts),
        [publicPosts],
    );

    useEffect(() => {
        const publicInvite = socialInviteFromLocation();
        if (!publicInvite) {
            setOnboardingEntrySource(parseOnboardingEntrySource());
            removeOnboardingEntrySourceFromURL();
        }
        setRouteMode(
            publicInvite
                ? { kind: "public-profile", ...publicInvite }
                : { kind: "app" },
        );
    }, [setOnboardingEntrySource]);

    useEffect(() => {
        if (routeMode.kind != "public-profile") return;

        let cancelled = false;
        setPublicError(undefined);
        void loadPublicSocialInvite(routeMode)
            .then(({ posts, profile: nextProfile }) => {
                if (cancelled) return;
                setPublicProfile({
                    avatarUrl: nextProfile.avatarUrl ?? null,
                    fullName: nextProfile.fullName,
                    username: nextProfile.username,
                    wallId: nextProfile.wallId,
                    wallSlug: nextProfile.wallSlug,
                });
                setPublicFriendsCount(nextProfile.friendsCount);
                setPublicPosts(posts);
            })
            .catch((error: unknown) => {
                console.error("Failed to load public social invite", error);
                if (!cancelled) setPublicError("This invite link is invalid or expired.");
            });

        return () => {
            cancelled = true;
        };
    }, [routeMode]);

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
        if (!publicProfile && !publicError) {
            return <SocialRouteFallback background={profileBackground} />;
        }

        if (!publicProfile) {
            return (
                <>
                    <SocialPageMeta themeColor={profileBackground} />
                    <OnboardingScreen
                        description={publicError}
                        onCreateAccount={() => void router.push(socialRoutes.signup)}
                        onLogin={() => void router.push(socialRoutes.login)}
                        title="Invite unavailable"
                    />
                </>
            );
        }

        return (
            <>
                <SocialPageMeta themeColor={profileBackground} />
                <PublicProfileScreen
                    friendsCount={publicFriendsCount}
                    postGroups={publicPostGroups}
                    profile={publicProfile}
                    onAddFriend={() => {
                        savePendingSocialInvite(routeMode);
                        setOnboardingEntrySource("add-friend-link");
                        if (profile) {
                            void joinSocialInvite(routeMode)
                                .then(() => {
                                    clearPendingSocialInvite();
                                    void router.push(socialRoutes.home);
                                })
                                .catch((error: unknown) =>
                                    console.error(
                                        "Failed to join social invite",
                                        error,
                                    ),
                                );
                            return;
                        }
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
