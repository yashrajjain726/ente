import { UserAdd02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React, { useEffect, useState } from "react";
import {
    OnboardingScreen,
    addFriendOnboardingTitle,
    onboardingGreen,
} from "screens/OnboardingScreen";
import { profileBackground } from "screens/ProfileScreen";
import {
    joinSpaceInvite,
    loadPublicSpaceIdentity,
    type PublicSpaceIdentity,
} from "services/space";
import {
    clearPendingSpaceInvite,
    clearPendingSpaceInviteFriend,
    savePendingSpaceInvite,
    savePendingSpaceInviteFriend,
    saveSentSpaceInviteFriend,
    savedPendingSpaceInvite,
    spaceInviteFromLocation,
    type PendingSpaceInvite,
} from "services/spaceInvite";
import {
    useSpaceAppState,
    type OnboardingEntrySource,
} from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

type RouteMode =
    | { kind: "checking" }
    | { kind: "app" }
    | ({ kind: "public-profile" } & PendingSpaceInvite);

interface PageProps {
    invitePreview?: boolean;
}

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
        </Box>
    </Box>
);

const onboardingEntrySourceFromPendingInvite = (): OnboardingEntrySource =>
    savedPendingSpaceInvite() ? "add-friend-link" : "direct";

interface PublicFriendRequestScreenProps {
    identity: PublicSpaceIdentity;
    onAddFriend: () => void;
}

const PublicFriendRequestScreen: React.FC<PublicFriendRequestScreenProps> = ({
    identity,
    onAddFriend,
}) => (
    <Box
        component="main"
        sx={{
            bgcolor: "white",
            boxSizing: "border-box",
            display: "grid",
            minHeight: "100svh",
            p: { xs: 1, sm: 0 },
            placeItems: "stretch",
        }}
    >
        <Box
            className="green-bg"
            sx={{
                alignItems: "center",
                bgcolor: onboardingGreen,
                borderRadius: { xs: "24px", sm: 0 },
                boxSizing: "border-box",
                color: "white",
                display: "flex",
                flexDirection: "column",
                minHeight: { xs: "calc(100svh - 16px)", sm: "100svh" },
                overflow: "hidden",
                textAlign: "center",
                width: "100%",
            }}
        >
            <Box
                component="header"
                sx={{
                    alignItems: "center",
                    display: "grid",
                    flexShrink: 0,
                    gridTemplateColumns: "40px 1fr 40px",
                    height: 40,
                    maxWidth: 390,
                    mt: "clamp(24px, 5.5svh, 44px)",
                    mx: "auto",
                    px: 3,
                    width: "100%",
                }}
            >
                <Box />
                <Box
                    component="a"
                    href="/"
                    aria-label="Go to Space"
                    sx={{
                        display: "block",
                        justifySelf: "center",
                        lineHeight: 0,
                        textDecoration: "none",
                        width: 101,
                    }}
                >
                    <Box
                        component="img"
                        alt=""
                        src="/images/space.svg"
                        sx={{ display: "block", height: 30, width: 101 }}
                    />
                </Box>
                <Box />
            </Box>
            <Box
                sx={{
                    alignItems: "center",
                    display: "flex",
                    flex: "1 1 auto",
                    flexDirection: "column",
                    justifyContent: "center",
                    maxWidth: 390,
                    minHeight: 0,
                    px: 3,
                    width: "100%",
                }}
            >
                <Box
                    component="h1"
                    sx={{
                        fontFamily: "Nunito, sans-serif",
                        fontSize: 28,
                        fontWeight: 800,
                        letterSpacing: 0,
                        lineHeight: "34px",
                        m: 0,
                        maxWidth: "100%",
                        overflowWrap: "anywhere",
                    }}
                >
                    @{identity.username} invited you!
                </Box>
                <Box
                    component="p"
                    sx={{
                        color: "#AAFFB8",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 15,
                        fontWeight: 600,
                        lineHeight: "22px",
                        m: 0,
                        mt: "10px",
                        maxWidth: 300,
                    }}
                >
                    Add @{identity.username} as a friend to see what
                    they&apos;re up to on Ente Space.
                </Box>
            </Box>
            <Box
                sx={{
                    boxSizing: "border-box",
                    flexShrink: 0,
                    maxWidth: 390,
                    mx: "auto",
                    pb: "calc(env(safe-area-inset-bottom) + 24px)",
                    px: 3,
                    pt: 3,
                    width: "100%",
                }}
            >
                <Box
                    component="button"
                    type="button"
                    onClick={onAddFriend}
                    sx={{
                        alignItems: "center",
                        appearance: "none",
                        bgcolor: "black",
                        border: 0,
                        borderRadius: "20px",
                        color: "white",
                        cursor: "pointer",
                        display: "flex",
                        gap: "8px",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        fontWeight: 500,
                        height: 48,
                        justifyContent: "center",
                        lineHeight: "20px",
                        p: "14px 24px",
                        width: "100%",
                        "&:hover": { bgcolor: "#121212" },
                        "&:focus-visible": {
                            outline: "2px solid rgba(255 255 255 / 0.88)",
                            outlineOffset: 3,
                        },
                    }}
                >
                    <HugeiconsIcon
                        icon={UserAdd02Icon}
                        size={18}
                        strokeWidth={1.8}
                    />
                    Add friend
                </Box>
            </Box>
        </Box>
    </Box>
);

export const Page: React.FC<PageProps> = ({ invitePreview }) => {
    const router = useSpaceRouter();
    const {
        onboardingEntrySource,
        profile,
        profileLoadError,
        profileLoadStatus,
        setOnboardingEntrySource,
    } = useSpaceAppState();
    const [routeMode, setRouteMode] = useState<RouteMode>({ kind: "checking" });
    const [publicIdentity, setPublicIdentity] =
        useState<PublicSpaceIdentity | null>(null);
    const [publicError, setPublicError] = useState<string>();

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
        setPublicIdentity(null);
        void loadPublicSpaceIdentity(routeMode.spaceUsername)
            .then((identity) => {
                if (!cancelled) setPublicIdentity(identity);
            })
            .catch(() => {
                if (!cancelled) setPublicError("This profile is unavailable.");
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

    const hasProfileLoadError =
        routeMode.kind == "app" && profileLoadStatus == "error";

    if (hasProfileLoadError) {
        return (
            <SpaceRouteFallback
                background={profileBackground}
                message={profileLoadError}
            />
        );
    }

    if (
        routeMode.kind == "checking" ||
        (routeMode.kind == "app" &&
            (profileLoadStatus == "loading" || Boolean(profile)))
    ) {
        return (
            <SpaceRouteFallback
                background={profileBackground}
                preview={invitePreview ? "invite" : "home"}
            />
        );
    }

    if (routeMode.kind == "public-profile") {
        if (!publicIdentity && !publicError) {
            return <SpaceRouteFallback background={profileBackground} />;
        }

        if (!publicIdentity) {
            return (
                <>
                    <SpacePageMeta
                        themeColor={profileBackground}
                        preview="invite"
                    />
                    <PublicProfileUnavailable />
                </>
            );
        }

        const inviteFriend = {
            fullName: "",
            username: publicIdentity.username,
        };
        const addFriend = () => {
            const invite = { spaceUsername: publicIdentity.username };
            savePendingSpaceInvite(invite);
            savePendingSpaceInviteFriend(inviteFriend);
            setOnboardingEntrySource("add-friend-link");
            if (profile) {
                void joinSpaceInvite(invite)
                    .then((status) => {
                        clearPendingSpaceInvite();
                        clearPendingSpaceInviteFriend();
                        if (status == "requested") {
                            saveSentSpaceInviteFriend(inviteFriend);
                        }
                        void router.push(spaceRoutes.home);
                    })
                    .catch((error: unknown) =>
                        console.error("Failed to send friend request", error),
                    );
                return;
            }
            window.location.assign("/");
        };

        return (
            <>
                <SpacePageMeta themeColor={onboardingGreen} preview="invite" />
                <PublicFriendRequestScreen
                    identity={publicIdentity}
                    onAddFriend={addFriend}
                />
            </>
        );
    }

    const isAddFriendLinkOnboarding =
        onboardingEntrySource == "add-friend-link";

    return (
        <>
            <SpacePageMeta themeColor={onboardingGreen} preview="home" />
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
