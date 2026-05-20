import { Box } from "@mui/material";
import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import {
    OnboardingScreen,
    addFriendOnboardingTitle,
    onboardingGreen,
} from "screens/OnboardingScreen";
import { profileBackground } from "screens/ProfileScreen";
import { PublicProfileScreen } from "screens/PublicProfileScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import {
    joinSpaceInvite,
    loadPublicSpaceInvite,
    type SpacePost,
} from "services/space";
import {
    clearPendingSpaceInvite,
    clearPendingSpaceInviteFriend,
    saveAcceptedSpaceInviteFriend,
    savePendingSpaceInvite,
    savePendingSpaceInviteFriend,
    savedPendingSpaceInvite,
    spaceInviteFromLocation,
    type PendingSpaceInvite,
} from "services/spaceInvite";
import {
    useSpaceAppState,
    type OnboardingEntrySource,
} from "state/spaceAppState";
import { profilePostGroupsFromPosts } from "utils/spacePostDisplay";
import { spaceRoutes } from "utils/spaceRoutes";

type RouteMode =
    | { kind: "checking" }
    | { kind: "app" }
    | ({ kind: "public-profile" } & PendingSpaceInvite);

const PublicProfileUnavailable: React.FC = () => (
    <Box
        className="green-bg"
        component="main"
        sx={{
            alignItems: "center",
            bgcolor: onboardingGreen,
            boxSizing: "border-box",
            color: "white",
            display: "grid",
            minHeight: "100svh",
            placeItems: "center",
            px: 3,
            textAlign: "center",
        }}
    >
        <Box sx={{ maxWidth: 314 }}>
            <Box
                component="h1"
                sx={{
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: 0,
                    lineHeight: "29px",
                    m: 0,
                    whiteSpace: "nowrap",
                }}
            >
                Profile unavailable
            </Box>
            <Box
                component="p"
                sx={{
                    color: "#AAFFB8",
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    fontWeight: 500,
                    lineHeight: "20px",
                    m: 0,
                    mt: "6px",
                }}
            >
                This profile link is invalid or expired.
            </Box>
        </Box>
    </Box>
);

const onboardingEntrySourceFromPendingInvite = (): OnboardingEntrySource =>
    savedPendingSpaceInvite() ? "add-friend-link" : "direct";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        onboardingEntrySource,
        profile,
        profileLoadStatus,
        setOnboardingEntrySource,
    } = useSpaceAppState();
    const [routeMode, setRouteMode] = useState<RouteMode>({ kind: "checking" });
    const [publicProfile, setPublicProfile] = useState<SetupProfile | null>(
        null,
    );
    const [publicFriendsCount, setPublicFriendsCount] = useState(0);
    const [publicPosts, setPublicPosts] = useState<SpacePost[]>([]);
    const [publicError, setPublicError] = useState<string>();
    const publicPostGroups = useMemo(
        () => profilePostGroupsFromPosts(publicPosts),
        [publicPosts],
    );

    useEffect(() => {
        const publicInvite = spaceInviteFromLocation();
        if (!publicInvite) {
            setOnboardingEntrySource(onboardingEntrySourceFromPendingInvite());
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
        void loadPublicSpaceInvite(routeMode)
            .then(({ posts, profile: nextProfile }) => {
                if (cancelled) return;
                setPublicProfile({
                    avatarUrl: nextProfile.avatarUrl ?? null,
                    fullName: nextProfile.fullName,
                    username: nextProfile.username,
                    spaceId: nextProfile.spaceId,
                    spaceSlug: nextProfile.spaceSlug,
                });
                setPublicFriendsCount(nextProfile.friendsCount);
                setPublicPosts(posts);
            })
            .catch((error: unknown) => {
                console.error("Failed to load public space invite", error);
                if (!cancelled)
                    setPublicError("This profile link is invalid or expired.");
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
            void router.replace(spaceRoutes.home);
        }
    }, [profile, profileLoadStatus, routeMode.kind, router]);

    if (
        routeMode.kind == "checking" ||
        (routeMode.kind == "app" &&
            (profileLoadStatus == "loading" || Boolean(profile)))
    ) {
        return <SpaceRouteFallback background={profileBackground} />;
    }

    if (routeMode.kind == "public-profile") {
        if (!publicProfile && !publicError) {
            return <SpaceRouteFallback background={profileBackground} />;
        }

        if (!publicProfile) {
            return (
                <>
                    <SpacePageMeta themeColor={profileBackground} />
                    <PublicProfileUnavailable />
                </>
            );
        }

        return (
            <>
                <SpacePageMeta themeColor={profileBackground} />
                <PublicProfileScreen
                    friendsCount={publicFriendsCount}
                    postGroups={publicPostGroups}
                    profile={publicProfile}
                    onAddFriend={() => {
                        const inviteFriend = {
                            fullName: publicProfile.fullName,
                            username: publicProfile.username,
                        };

                        savePendingSpaceInvite(routeMode);
                        savePendingSpaceInviteFriend(inviteFriend);
                        setOnboardingEntrySource("add-friend-link");
                        if (profile) {
                            void joinSpaceInvite(routeMode)
                                .then(() => {
                                    clearPendingSpaceInvite();
                                    clearPendingSpaceInviteFriend();
                                    saveAcceptedSpaceInviteFriend(inviteFriend);
                                    void router.push(spaceRoutes.home);
                                })
                                .catch((error: unknown) =>
                                    console.error(
                                        "Failed to join space invite",
                                        error,
                                    ),
                                );
                            return;
                        }
                        window.location.assign("/");
                    }}
                />
            </>
        );
    }

    const isAddFriendLinkOnboarding =
        onboardingEntrySource == "add-friend-link";

    return (
        <>
            <SpacePageMeta themeColor={onboardingGreen} />
            <OnboardingScreen
                onCreateAccount={() => void router.push(spaceRoutes.signup)}
                onLogin={() => void router.push(spaceRoutes.login)}
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
