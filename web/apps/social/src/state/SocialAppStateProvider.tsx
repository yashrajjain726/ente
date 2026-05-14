import React, { useCallback, useMemo, useState } from "react";
import type { SocialLoginCredentials } from "screens/LoginScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type { PendingSocialPasskeyVerification } from "services/socialPasskeyVerification";
import {
    type OnboardingEntrySource,
    type SocialAppState,
    SocialAppStateContext,
    initialFriends,
} from "state/socialAppState";

export const SocialAppStateProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [friends, setFriends] = useState(initialFriends);
    const [isLiveSignupVerification, setIsLiveSignupVerification] =
        useState(false);
    const [onboardingEntrySource, setOnboardingEntrySource] =
        useState<OnboardingEntrySource>("direct");
    const [pendingLoginCredentials, setPendingLoginCredentials] =
        useState<SocialLoginCredentials | null>(null);
    const [pendingPasskeyVerification, setPendingPasskeyVerification] =
        useState<PendingSocialPasskeyVerification | null>(null);
    const [profile, setProfile] = useState<SetupProfile | null>(null);
    const [signupEmail, setSignupEmail] = useState("");

    const resetAfterLogout = useCallback(() => {
        setProfile(null);
        setPendingLoginCredentials(null);
        setPendingPasskeyVerification(null);
        setOnboardingEntrySource("direct");
        setFriends(initialFriends());
    }, []);

    const value = useMemo<SocialAppState>(
        () => ({
            friends,
            isLiveSignupVerification,
            onboardingEntrySource,
            pendingLoginCredentials,
            pendingPasskeyVerification,
            profile,
            resetAfterLogout,
            setFriends,
            setIsLiveSignupVerification,
            setOnboardingEntrySource,
            setPendingLoginCredentials,
            setPendingPasskeyVerification,
            setProfile,
            setSignupEmail,
            signupEmail,
        }),
        [
            friends,
            isLiveSignupVerification,
            onboardingEntrySource,
            pendingLoginCredentials,
            pendingPasskeyVerification,
            profile,
            resetAfterLogout,
            signupEmail,
        ],
    );

    return (
        <SocialAppStateContext.Provider value={value}>
            {children}
        </SocialAppStateContext.Provider>
    );
};
