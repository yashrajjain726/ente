import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    SetupProfileScreen,
    setupProfileBackground,
} from "screens/SetupProfileScreen";
import {
    clearPendingSocialInvite,
    clearPendingSocialInviteFriend,
    saveAcceptedSocialInviteFriend,
    savedPendingSocialInvite,
    savedPendingSocialInviteFriend,
} from "services/socialInvite";
import {
    saveSocialProfile,
    socialProfileErrorMessage,
    socialUsernameAvailability,
    socialUsernameValidationError,
} from "services/socialProfile";
import { joinSocialInvite } from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { setupProfileSourceFromQuery, socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        onboardingEntrySource,
        profile,
        profileLoadStatus,
        refreshProfile,
        setProfile,
    } = useSocialAppState();
    const backSource = setupProfileSourceFromQuery(router.query.from);
    const isAddFriendLinkOnboarding =
        onboardingEntrySource == "add-friend-link";
    const [setupError, setSetupError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [draftUsername, setDraftUsername] = useState("");
    const [usernameStatus, setUsernameStatus] = useState<
        "available" | "unavailable"
    >();
    const existingProfileRoute = useMemo(
        () =>
            isAddFriendLinkOnboarding || backSource == "login"
                ? socialRoutes.home
                : socialRoutes.invite,
        [backSource, isAddFriendLinkOnboarding],
    );

    const acceptPendingInvite = useCallback(async () => {
        const pendingInvite = savedPendingSocialInvite();
        if (!pendingInvite) return;

        const pendingFriend = savedPendingSocialInviteFriend() ?? {
            fullName: "",
            username: pendingInvite.wallUsername,
        };
        await joinSocialInvite(pendingInvite);
        clearPendingSocialInvite();
        clearPendingSocialInviteFriend();
        saveAcceptedSocialInviteFriend(pendingFriend);
    }, []);

    useEffect(() => {
        if (router.isReady) void refreshProfile();
    }, [refreshProfile, router.isReady]);

    useEffect(() => {
        if (profileLoadStatus == "ready" && profile) {
            void acceptPendingInvite()
                .catch((error: unknown) =>
                    console.error("Failed to accept pending invite", error),
                )
                .finally(() => void router.replace(existingProfileRoute));
        }
    }, [
        acceptPendingInvite,
        existingProfileRoute,
        profile,
        profileLoadStatus,
        router,
    ]);

    useEffect(() => {
        if (profileLoadStatus != "ready" || profile) return;

        const username = draftUsername.trim();
        if (!username) {
            setUsernameStatus(undefined);
            return;
        }

        const validationError = socialUsernameValidationError(username);
        if (validationError) {
            setUsernameStatus("unavailable");
            return;
        }

        setUsernameStatus(undefined);

        let cancelled = false;
        const timeout = window.setTimeout(() => {
            void socialUsernameAvailability(username)
                .then((availability) => {
                    if (cancelled) return;
                    setUsernameStatus(
                        availability == "taken" ? "unavailable" : "available",
                    );
                })
                .catch((error: unknown) => {
                    console.error("Username availability check failed", error);
                    if (!cancelled) {
                        setUsernameStatus(undefined);
                    }
                });
        }, 350);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [draftUsername, profile, profileLoadStatus]);

    if (profileLoadStatus == "loading" || profile) {
        return <SocialRouteFallback background={setupProfileBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={setupProfileBackground} />
            <SetupProfileScreen
                ctaLabel={isAddFriendLinkOnboarding ? "Done" : "Next"}
                errorMessage={setupError}
                isSubmitting={isSubmitting}
                onBack={() =>
                    void router.push(
                        backSource == "login"
                            ? socialRoutes.login
                            : socialRoutes.verify,
                    )
                }
                onContinue={async (nextProfile) => {
                    setIsSubmitting(true);
                    setSetupError(undefined);
                    try {
                        const savedProfile =
                            await saveSocialProfile(nextProfile);
                        await acceptPendingInvite();
                        setProfile(savedProfile);
                        void router.push(
                            isAddFriendLinkOnboarding
                                ? socialRoutes.home
                                : socialRoutes.invite,
                        );
                    } catch (error) {
                        console.error("Social profile setup failed", error);
                        setSetupError(socialProfileErrorMessage(error));
                        setIsSubmitting(false);
                    }
                }}
                onUsernameChange={setDraftUsername}
                usernameStatus={usernameStatus}
            />
        </>
    );
};

export default Page;
