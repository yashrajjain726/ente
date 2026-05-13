import React, { useCallback, useMemo, useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
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
    const [profile, setProfile] = useState<SetupProfile | null>(null);
    const [signupEmail, setSignupEmail] = useState("");

    const resetAfterLogout = useCallback(() => {
        setProfile(null);
        setOnboardingEntrySource("direct");
        setFriends(initialFriends());
    }, []);

    const value = useMemo<SocialAppState>(
        () => ({
            friends,
            isLiveSignupVerification,
            onboardingEntrySource,
            profile,
            resetAfterLogout,
            setFriends,
            setIsLiveSignupVerification,
            setOnboardingEntrySource,
            setProfile,
            setSignupEmail,
            signupEmail,
        }),
        [
            friends,
            isLiveSignupVerification,
            onboardingEntrySource,
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
