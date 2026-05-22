import type { FriendProfile } from "data/friends";
import React, { createContext, useContext } from "react";
import type { SpaceLoginCredentials } from "screens/LoginScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type { PendingSpacePasskeyVerification } from "services/spacePasskeyVerification";

export type OnboardingEntrySource = "direct" | "add-friend-link";
export type SpaceProfileLoadStatus = "error" | "loading" | "ready";

export interface SpaceAppState {
    friends: FriendProfile[];
    isLiveSignupVerification: boolean;
    onboardingEntrySource: OnboardingEntrySource;
    pendingLoginCredentials: SpaceLoginCredentials | null;
    pendingPasskeyVerification: PendingSpacePasskeyVerification | null;
    pendingProfileAvatarFile: File | null;
    profile: SetupProfile | null;
    profileLoadError?: string;
    profileLoadStatus: SpaceProfileLoadStatus;
    signupEmail: string;
    refreshProfile: () => Promise<SetupProfile | null>;
    resetAfterLogout: () => void;
    setFriends: React.Dispatch<React.SetStateAction<FriendProfile[]>>;
    setIsLiveSignupVerification: React.Dispatch<React.SetStateAction<boolean>>;
    setOnboardingEntrySource: React.Dispatch<
        React.SetStateAction<OnboardingEntrySource>
    >;
    setPendingLoginCredentials: React.Dispatch<
        React.SetStateAction<SpaceLoginCredentials | null>
    >;
    setPendingPasskeyVerification: React.Dispatch<
        React.SetStateAction<PendingSpacePasskeyVerification | null>
    >;
    setPendingProfileAvatarFile: React.Dispatch<
        React.SetStateAction<File | null>
    >;
    setProfile: (profile: SetupProfile | null) => void;
    setSignupEmail: React.Dispatch<React.SetStateAction<string>>;
}

export const initialFriends = (): FriendProfile[] => [];

export const SpaceAppStateContext = createContext<SpaceAppState | null>(null);

export const useSpaceAppState = () => {
    const context = useContext(SpaceAppStateContext);
    if (!context) {
        throw new Error(
            "useSpaceAppState must be used within SpaceAppStateProvider",
        );
    }
    return context;
};
