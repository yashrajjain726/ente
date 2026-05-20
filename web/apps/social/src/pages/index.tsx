import { Box } from "@mui/material";
import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
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
    clearPendingSocialInvite,
    clearPendingSocialInviteFriend,
    saveAcceptedSocialInviteFriend,
    savePendingSocialInvite,
    savePendingSocialInviteFriend,
    savedPendingSocialInvite,
    socialInviteFromLocation,
    type PendingSocialInvite,
} from "services/socialInvite";
import {
    joinSocialInvite,
    loadPublicSocialInvite,
    type SocialWallPost,
} from "services/socialWall";
import {
    useSocialAppState,
    type OnboardingEntrySource,
} from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";
import { profilePostGroupsFromPosts } from "utils/socialWallDisplay";

type RouteMode =
    | { kind: "checking" }
    | { kind: "app" }
    | ({ kind: "public-profile" } & PendingSocialInvite);

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
    savedPendingSocialInvite() ? "add-friend-link" : "direct";

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
                    <PublicProfileUnavailable />
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
                        const inviteFriend = {
                            fullName: publicProfile.fullName,
                            username: publicProfile.username,
                        };

                        savePendingSocialInvite(routeMode);
                        savePendingSocialInviteFriend(inviteFriend);
                        setOnboardingEntrySource("add-friend-link");
                        if (profile) {
                            void joinSocialInvite(routeMode)
                                .then(() => {
                                    clearPendingSocialInvite();
                                    clearPendingSocialInviteFriend();
                                    saveAcceptedSocialInviteFriend(
                                        inviteFriend,
                                    );
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
            <SocialPageMeta themeColor={onboardingGreen} />
            <OnboardingScreen
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
