import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { SpaceLoginCredentials } from "screens/LoginScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type { PendingSpacePasskeyVerification } from "services/spacePasskeyVerification";
import {
    loadExistingSpaceAvatar,
    loadExistingSpaceProfile,
} from "services/spaceProfile";
import {
    type OnboardingEntrySource,
    type SpaceAppState,
    SpaceAppStateContext,
    type SpaceProfileLoadStatus,
    initialFriends,
} from "state/spaceAppState";

export const SpaceAppStateProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [friends, setFriends] = useState(initialFriends);
    const [isLiveSignupVerification, setIsLiveSignupVerification] =
        useState(false);
    const [onboardingEntrySource, setOnboardingEntrySource] =
        useState<OnboardingEntrySource>("direct");
    const [pendingLoginCredentials, setPendingLoginCredentials] =
        useState<SpaceLoginCredentials | null>(null);
    const [pendingPasskeyVerification, setPendingPasskeyVerification] =
        useState<PendingSpacePasskeyVerification | null>(null);
    const [profile, setProfile] = useState<SetupProfile | null>(null);
    const [profileLoadStatus, setProfileLoadStatus] =
        useState<SpaceProfileLoadStatus>("loading");
    const [signupEmail, setSignupEmail] = useState("");
    const avatarURLRef = useRef<string | null>(null);
    const profileRef = useRef<SetupProfile | null>(null);
    const profileLoadGenerationRef = useRef(0);

    const applyProfile = useCallback((nextProfile: SetupProfile | null) => {
        const previousAvatarURL = avatarURLRef.current;
        if (previousAvatarURL && previousAvatarURL != nextProfile?.avatarUrl) {
            URL.revokeObjectURL(previousAvatarURL);
        }
        avatarURLRef.current = nextProfile?.avatarUrl?.startsWith("blob:")
            ? nextProfile.avatarUrl
            : null;
        profileRef.current = nextProfile;
        setProfile(nextProfile);
    }, []);

    const loadProfileAvatar = useCallback(
        async (profileToHydrate: SetupProfile | null, generation: number) => {
            if (
                !profileToHydrate?.avatarObjectKey ||
                profileToHydrate.avatarUrl
            ) {
                return;
            }

            try {
                const avatarUrl = await loadExistingSpaceAvatar(
                    profileToHydrate.spaceId,
                    profileToHydrate.avatarObjectKey,
                );
                if (!avatarUrl) return;

                const currentProfile = profileRef.current;
                if (
                    profileLoadGenerationRef.current != generation ||
                    !currentProfile ||
                    currentProfile.spaceId != profileToHydrate.spaceId ||
                    currentProfile.avatarObjectKey !=
                        profileToHydrate.avatarObjectKey
                ) {
                    URL.revokeObjectURL(avatarUrl);
                    return;
                }

                applyProfile({ ...currentProfile, avatarUrl });
            } catch (error) {
                console.warn("Failed to load space avatar", error);
            }
        },
        [applyProfile],
    );

    const refreshProfile = useCallback(async () => {
        const generation = ++profileLoadGenerationRef.current;
        setProfileLoadStatus("loading");

        try {
            const nextProfile = await loadExistingSpaceProfile();
            if (profileLoadGenerationRef.current == generation) {
                applyProfile(nextProfile);
                void loadProfileAvatar(nextProfile, generation);
            }
            return nextProfile;
        } catch (error) {
            console.error("Failed to load space profile", error);
            if (profileLoadGenerationRef.current == generation) {
                applyProfile(null);
            }
            return null;
        } finally {
            if (profileLoadGenerationRef.current == generation) {
                setProfileLoadStatus("ready");
            }
        }
    }, [applyProfile, loadProfileAvatar]);

    const resetAfterLogout = useCallback(() => {
        profileLoadGenerationRef.current += 1;
        applyProfile(null);
        setProfileLoadStatus("ready");
        setPendingLoginCredentials(null);
        setPendingPasskeyVerification(null);
        setOnboardingEntrySource("direct");
        setFriends(initialFriends());
    }, [applyProfile]);

    useEffect(() => {
        void refreshProfile();
    }, [refreshProfile]);

    const value = useMemo<SpaceAppState>(
        () => ({
            friends,
            isLiveSignupVerification,
            onboardingEntrySource,
            pendingLoginCredentials,
            pendingPasskeyVerification,
            profile,
            profileLoadStatus,
            refreshProfile,
            resetAfterLogout,
            setFriends,
            setIsLiveSignupVerification,
            setOnboardingEntrySource,
            setPendingLoginCredentials,
            setPendingPasskeyVerification,
            setProfile: applyProfile,
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
            profileLoadStatus,
            refreshProfile,
            resetAfterLogout,
            signupEmail,
            applyProfile,
        ],
    );

    return (
        <SpaceAppStateContext.Provider value={value}>
            {children}
        </SpaceAppStateContext.Provider>
    );
};
