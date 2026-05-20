import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    SetupProfileScreen,
    setupProfileBackground,
} from "screens/SetupProfileScreen";
import { joinSpaceInvite } from "services/space";
import {
    clearPendingSpaceInvite,
    clearPendingSpaceInviteFriend,
    saveAcceptedSpaceInviteFriend,
    savedPendingSpaceInvite,
    savedPendingSpaceInviteFriend,
} from "services/spaceInvite";
import {
    saveSpaceProfile,
    spaceProfileErrorMessage,
    spaceUsernameAvailability,
    spaceUsernameValidationError,
} from "services/spaceProfile";
import { useSpaceAppState } from "state/spaceAppState";
import { setupProfileSourceFromQuery, spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        onboardingEntrySource,
        profile,
        profileLoadStatus,
        refreshProfile,
        setProfile,
    } = useSpaceAppState();
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
                ? spaceRoutes.home
                : spaceRoutes.invite,
        [backSource, isAddFriendLinkOnboarding],
    );

    const acceptPendingInvite = useCallback(async () => {
        const pendingInvite = savedPendingSpaceInvite();
        if (!pendingInvite) return;

        const pendingFriend = savedPendingSpaceInviteFriend() ?? {
            fullName: "",
            username: pendingInvite.spaceUsername,
        };
        await joinSpaceInvite(pendingInvite);
        clearPendingSpaceInvite();
        clearPendingSpaceInviteFriend();
        saveAcceptedSpaceInviteFriend(pendingFriend);
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

        const validationError = spaceUsernameValidationError(username);
        if (validationError) {
            setUsernameStatus("unavailable");
            return;
        }

        setUsernameStatus(undefined);

        let cancelled = false;
        const timeout = window.setTimeout(() => {
            void spaceUsernameAvailability(username)
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
        return <SpaceRouteFallback background={setupProfileBackground} />;
    }

    return (
        <>
            <SpacePageMeta themeColor={setupProfileBackground} />
            <SetupProfileScreen
                ctaLabel={isAddFriendLinkOnboarding ? "Done" : "Next"}
                errorMessage={setupError}
                isSubmitting={isSubmitting}
                onBack={() =>
                    void router.push(
                        backSource == "login"
                            ? spaceRoutes.login
                            : spaceRoutes.verify,
                    )
                }
                onContinue={async (nextProfile) => {
                    setIsSubmitting(true);
                    setSetupError(undefined);
                    try {
                        const savedProfile =
                            await saveSpaceProfile(nextProfile);
                        await acceptPendingInvite();
                        setProfile(savedProfile);
                        void router.push(
                            isAddFriendLinkOnboarding
                                ? spaceRoutes.home
                                : spaceRoutes.invite,
                        );
                    } catch (error) {
                        console.error("Space profile setup failed", error);
                        setSetupError(spaceProfileErrorMessage(error));
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
