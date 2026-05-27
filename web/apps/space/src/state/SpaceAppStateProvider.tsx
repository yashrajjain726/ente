import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { SpaceLoginCredentials } from "screens/LoginScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import {
    clearSpaceFriendsCache,
    clearSpaceMediaURLCache,
} from "services/space";
import type { PendingSpacePasskeyVerification } from "services/spacePasskeyVerification";
import {
    clearCurrentSpaceContext,
    loadExistingSpaceAvatar,
    loadExistingSpaceCover,
    loadExistingSpaceProfile,
} from "services/spaceProfile";
import {
    type LocalSpaceFeedPost,
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
    const [localFeedPosts, setLocalFeedPosts] = useState<LocalSpaceFeedPost[]>(
        [],
    );
    const [onboardingEntrySource, setOnboardingEntrySource] =
        useState<OnboardingEntrySource>("direct");
    const [pendingLoginCredentials, setPendingLoginCredentials] =
        useState<SpaceLoginCredentials | null>(null);
    const [pendingPasskeyVerification, setPendingPasskeyVerification] =
        useState<PendingSpacePasskeyVerification | null>(null);
    const [pendingProfileAvatarFile, setPendingProfileAvatarFile] =
        useState<File | null>(null);
    const [pendingProfileCoverFile, setPendingProfileCoverFile] =
        useState<File | null>(null);
    const [profile, setProfile] = useState<SetupProfile | null>(null);
    const [profileLoadError, setProfileLoadError] = useState<string>();
    const [profileLoadStatus, setProfileLoadStatus] =
        useState<SpaceProfileLoadStatus>("loading");
    const [signupEmail, setSignupEmail] = useState("");
    const avatarURLRef = useRef<string | null>(null);
    const coverURLRef = useRef<string | null>(null);
    const localFeedPostURLRef = useRef<Set<string>>(new Set());
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
        const previousCoverURL = coverURLRef.current;
        if (previousCoverURL && previousCoverURL != nextProfile?.coverUrl) {
            URL.revokeObjectURL(previousCoverURL);
        }
        coverURLRef.current = nextProfile?.coverUrl?.startsWith("blob:")
            ? nextProfile.coverUrl
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

    const loadProfileCover = useCallback(
        async (profileToHydrate: SetupProfile | null, generation: number) => {
            if (
                !profileToHydrate?.coverObjectKey ||
                profileToHydrate.coverUrl
            ) {
                return;
            }

            try {
                const coverUrl = await loadExistingSpaceCover(
                    profileToHydrate.spaceId,
                    profileToHydrate.coverObjectKey,
                );
                if (!coverUrl) return;

                const currentProfile = profileRef.current;
                if (
                    profileLoadGenerationRef.current != generation ||
                    !currentProfile ||
                    currentProfile.spaceId != profileToHydrate.spaceId ||
                    currentProfile.coverObjectKey !=
                        profileToHydrate.coverObjectKey
                ) {
                    URL.revokeObjectURL(coverUrl);
                    return;
                }

                applyProfile({ ...currentProfile, coverUrl });
            } catch (error) {
                console.warn("Failed to load space cover", error);
            }
        },
        [applyProfile],
    );

    const profileErrorMessage = (error: unknown) =>
        error instanceof Error
            ? error.message
            : "Couldn't load this page. Please try again later or contact support.";

    const refreshProfile = useCallback(async () => {
        const generation = ++profileLoadGenerationRef.current;
        setProfileLoadError(undefined);
        setProfileLoadStatus("loading");

        try {
            const nextProfile = await loadExistingSpaceProfile();
            if (profileLoadGenerationRef.current == generation) {
                setProfileLoadError(undefined);
                applyProfile(nextProfile);
                void loadProfileAvatar(nextProfile, generation);
                void loadProfileCover(nextProfile, generation);
                setProfileLoadStatus("ready");
            }
            return nextProfile;
        } catch (error) {
            console.error("Failed to load space profile", error);
            if (profileLoadGenerationRef.current == generation) {
                setProfileLoadError(profileErrorMessage(error));
                setProfileLoadStatus("error");
            }
            return null;
        }
    }, [applyProfile, loadProfileAvatar, loadProfileCover]);

    const resetAfterLogout = useCallback(() => {
        profileLoadGenerationRef.current += 1;
        clearCurrentSpaceContext();
        clearSpaceFriendsCache();
        clearSpaceMediaURLCache();
        applyProfile(null);
        setProfileLoadError(undefined);
        setProfileLoadStatus("ready");
        setPendingLoginCredentials(null);
        setPendingPasskeyVerification(null);
        setPendingProfileAvatarFile(null);
        setPendingProfileCoverFile(null);
        setOnboardingEntrySource("direct");
        setLocalFeedPosts([]);
        setFriends(initialFriends());
    }, [applyProfile]);

    useEffect(() => {
        void refreshProfile();
    }, [refreshProfile]);

    useEffect(() => {
        const nextURLs = new Set(
            localFeedPosts
                .filter(
                    (
                        post,
                    ): post is Extract<
                        LocalSpaceFeedPost,
                        { status: "failed" | "pending" }
                    > => post.status == "pending" || post.status == "failed",
                )
                .map((post) => post.imageUrl)
                .filter((url) => url.startsWith("blob:")),
        );

        for (const url of localFeedPostURLRef.current) {
            if (!nextURLs.has(url)) URL.revokeObjectURL(url);
        }
        localFeedPostURLRef.current = nextURLs;
    }, [localFeedPosts]);

    useEffect(
        () => () => {
            for (const url of localFeedPostURLRef.current) {
                URL.revokeObjectURL(url);
            }
            localFeedPostURLRef.current.clear();
        },
        [],
    );

    const value = useMemo<SpaceAppState>(
        () => ({
            friends,
            isLiveSignupVerification,
            localFeedPosts,
            onboardingEntrySource,
            pendingLoginCredentials,
            pendingPasskeyVerification,
            pendingProfileAvatarFile,
            pendingProfileCoverFile,
            profile,
            profileLoadError,
            profileLoadStatus,
            refreshProfile,
            resetAfterLogout,
            setFriends,
            setIsLiveSignupVerification,
            setLocalFeedPosts,
            setOnboardingEntrySource,
            setPendingLoginCredentials,
            setPendingPasskeyVerification,
            setPendingProfileAvatarFile,
            setPendingProfileCoverFile,
            setProfile: applyProfile,
            setSignupEmail,
            signupEmail,
        }),
        [
            friends,
            isLiveSignupVerification,
            localFeedPosts,
            onboardingEntrySource,
            pendingLoginCredentials,
            pendingPasskeyVerification,
            pendingProfileAvatarFile,
            pendingProfileCoverFile,
            profile,
            profileLoadError,
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
