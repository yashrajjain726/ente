import { sampleFriends, type FriendProfile } from "data/friends";
import React, { createContext, useContext } from "react";
import type { SocialLoginCredentials } from "screens/LoginScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type { PendingSocialPasskeyVerification } from "services/socialPasskeyVerification";

export type OnboardingEntrySource = "direct" | "add-friend-link";
export type SocialProfileLoadStatus = "loading" | "ready";

export interface SocialAppState {
    friends: FriendProfile[];
    isLiveSignupVerification: boolean;
    onboardingEntrySource: OnboardingEntrySource;
    pendingLoginCredentials: SocialLoginCredentials | null;
    pendingPasskeyVerification: PendingSocialPasskeyVerification | null;
    profile: SetupProfile | null;
    profileLoadStatus: SocialProfileLoadStatus;
    signupEmail: string;
    refreshProfile: () => Promise<SetupProfile | null>;
    resetAfterLogout: () => void;
    setFriends: React.Dispatch<React.SetStateAction<FriendProfile[]>>;
    setIsLiveSignupVerification: React.Dispatch<React.SetStateAction<boolean>>;
    setOnboardingEntrySource: React.Dispatch<
        React.SetStateAction<OnboardingEntrySource>
    >;
    setPendingLoginCredentials: React.Dispatch<
        React.SetStateAction<SocialLoginCredentials | null>
    >;
    setPendingPasskeyVerification: React.Dispatch<
        React.SetStateAction<PendingSocialPasskeyVerification | null>
    >;
    setProfile: (profile: SetupProfile | null) => void;
    setSignupEmail: React.Dispatch<React.SetStateAction<string>>;
}

export const showMockFriends =
    process.env.NEXT_PUBLIC_HIDE_SOCIAL_MOCK_FRIENDS != "true";

export const initialFriends = () => (showMockFriends ? sampleFriends : []);

export const SocialAppStateContext = createContext<SocialAppState | null>(null);

export const useSocialAppState = () => {
    const context = useContext(SocialAppStateContext);
    if (!context) {
        throw new Error(
            "useSocialAppState must be used within SocialAppStateProvider",
        );
    }
    return context;
};
