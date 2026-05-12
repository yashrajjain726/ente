import { Box } from "@mui/material";
import { sampleFriends } from "data/friends";
import Head from "next/head";
import React, { useEffect, useState } from "react";
import {
    CreateAccountScreen,
    createAccountBackground,
} from "screens/CreateAccountScreen";
import { FriendsScreen, friendsBackground } from "screens/FriendsScreen";
import { HomeScreen, homeBackground } from "screens/HomeScreen";
import { LoginScreen, loginBackground } from "screens/LoginScreen";
import {
    OnboardingScreen,
    onboardingDescription,
    onboardingGreen,
} from "screens/OnboardingScreen";
import { ProfileScreen, profileBackground } from "screens/ProfileScreen";
import { PublicProfileScreen } from "screens/PublicProfileScreen";
import { SettingsScreen, settingsBackground } from "screens/SettingsScreen";
import {
    SetupProfileScreen,
    setupProfileBackground,
    type SetupProfile,
} from "screens/SetupProfileScreen";
import {
    ShareProfileLinkScreen,
    shareProfileLinkBackground,
} from "screens/ShareProfileLinkScreen";
import {
    VerifyEmailScreen,
    verifyEmailBackground,
} from "screens/VerifyEmailScreen";

type Screen =
    | "onboarding"
    | "create-account"
    | "login"
    | "verify-email"
    | "setup-profile"
    | "share-profile-link"
    | "home"
    | "profile"
    | "friends"
    | "friend-profile"
    | "settings";

type ProfileBackScreen = "login" | "verify-email";
type FriendProfileBackScreen = "friends" | "home";
type OnboardingEntrySource = "direct" | "add-friend-link";

const onboardingSourceSearchParam = "onboardingSource";
const addFriendLinkOnboardingSource: OnboardingEntrySource = "add-friend-link";
const showMockFriends =
    process.env.NEXT_PUBLIC_HIDE_SOCIAL_MOCK_FRIENDS != "true";

const samplePublicProfileData = {
    avatarUrl: "/images/sample-avatar.jpg",
    fullName: "Anand Baburajan",
    username: "anandbaburajan",
};

interface PublicProfileLink {
    token: string;
    username: string;
}

type RouteMode =
    | { kind: "checking" }
    | { kind: "app" }
    | ({ kind: "public-profile" } & PublicProfileLink);

const parsePublicProfileLink = (): PublicProfileLink | null => {
    const match = /^\/([^/]+)\/?$/.exec(window.location.pathname);
    const token = window.location.hash.slice(1);
    if (!match || !token) return null;

    try {
        const username = decodeURIComponent(match[1] ?? "").trim();
        return username ? { token, username } : null;
    } catch {
        return null;
    }
};

const parseOnboardingEntrySource = (): OnboardingEntrySource => {
    const params = new URLSearchParams(window.location.search);
    return params.get(onboardingSourceSearchParam) ==
        addFriendLinkOnboardingSource
        ? "add-friend-link"
        : "direct";
};

const removeOnboardingEntrySourceFromURL = () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(onboardingSourceSearchParam)) return;

    url.searchParams.delete(onboardingSourceSearchParam);
    window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
    );
};

const publicProfileFromLink = (): SetupProfile => ({
    avatarUrl: samplePublicProfileData.avatarUrl,
    fullName: samplePublicProfileData.fullName,
    username: samplePublicProfileData.username,
});

const Page: React.FC = () => {
    const [routeMode, setRouteMode] = useState<RouteMode>({ kind: "checking" });
    const [screen, setScreen] = useState<Screen>("onboarding");
    const [email, setEmail] = useState("example@example.com");
    const [friends, setFriends] = useState(() =>
        showMockFriends ? sampleFriends : [],
    );
    const [onboardingEntrySource, setOnboardingEntrySource] =
        useState<OnboardingEntrySource>("direct");
    const [profile, setProfile] = useState<SetupProfile | null>(null);
    const [profileBackScreen, setProfileBackScreen] =
        useState<ProfileBackScreen>("verify-email");
    const [friendProfileBackScreen, setFriendProfileBackScreen] =
        useState<FriendProfileBackScreen>("friends");
    const [selectedFriendID, setSelectedFriendID] = useState<string | null>(
        null,
    );

    const openSetupProfile = (backScreen: ProfileBackScreen) => {
        setProfileBackScreen(backScreen);
        setScreen("setup-profile");
    };

    const openFriendProfile = (
        friendID: string,
        backScreen: FriendProfileBackScreen,
    ) => {
        setSelectedFriendID(friendID);
        setFriendProfileBackScreen(backScreen);
        setScreen("friend-profile");
    };

    useEffect(() => {
        const publicProfileLink = parsePublicProfileLink();
        if (!publicProfileLink) {
            setOnboardingEntrySource(parseOnboardingEntrySource());
            removeOnboardingEntrySourceFromURL();
        }
        setRouteMode(
            publicProfileLink
                ? { kind: "public-profile", ...publicProfileLink }
                : { kind: "app" },
        );
    }, []);

    const selectedFriend = selectedFriendID
        ? (friends.find((friend) => friend.id == selectedFriendID) ??
          sampleFriends.find((friend) => friend.id == selectedFriendID))
        : undefined;
    const isAddFriendLinkOnboarding =
        onboardingEntrySource == "add-friend-link";

    const themeColor =
        routeMode.kind != "app"
            ? profileBackground
            : screen == "onboarding"
              ? onboardingGreen
              : screen == "verify-email"
                ? verifyEmailBackground
                : screen == "login"
                  ? loginBackground
                  : screen == "setup-profile"
                    ? setupProfileBackground
                    : screen == "share-profile-link"
                      ? shareProfileLinkBackground
                      : screen == "home"
                        ? homeBackground
                        : screen == "profile"
                          ? profileBackground
                          : screen == "friends" || screen == "friend-profile"
                            ? friendsBackground
                            : screen == "settings"
                              ? settingsBackground
                              : createAccountBackground;

    return (
        <>
            <Head>
                <meta name="theme-color" content={themeColor} />
                <meta name="description" content={onboardingDescription} />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Nunito:wght@800&display=swap"
                    rel="stylesheet"
                />
            </Head>
            {routeMode.kind == "checking" ? (
                <Box sx={{ bgcolor: profileBackground, minHeight: "100svh" }} />
            ) : routeMode.kind == "public-profile" ? (
                <PublicProfileScreen
                    profile={publicProfileFromLink()}
                    onAddFriend={() => {
                        window.location.assign(
                            `/?${onboardingSourceSearchParam}=${addFriendLinkOnboardingSource}`,
                        );
                    }}
                />
            ) : (
                <>
                    {screen == "onboarding" && (
                        <OnboardingScreen
                            onCreateAccount={() => setScreen("create-account")}
                            onLogin={() => setScreen("login")}
                        />
                    )}
                    {screen == "create-account" && (
                        <CreateAccountScreen
                            onBack={() => setScreen("onboarding")}
                            onCreateAccount={(nextEmail) => {
                                setEmail(nextEmail || "example@example.com");
                                setScreen("verify-email");
                            }}
                            onLogin={() => setScreen("login")}
                        />
                    )}
                    {screen == "login" && (
                        <LoginScreen
                            onBack={() => setScreen("onboarding")}
                            onContinue={() => openSetupProfile("login")}
                            onSignup={() => setScreen("create-account")}
                        />
                    )}
                    {screen == "verify-email" && (
                        <VerifyEmailScreen
                            email={email}
                            onBack={() => setScreen("create-account")}
                            onChangeEmail={() => setScreen("create-account")}
                            onVerify={() => openSetupProfile("verify-email")}
                        />
                    )}
                    {screen == "setup-profile" && (
                        <SetupProfileScreen
                            ctaLabel={
                                isAddFriendLinkOnboarding ? "Done" : "Next"
                            }
                            onBack={() => setScreen(profileBackScreen)}
                            onContinue={(nextProfile) => {
                                setProfile(nextProfile);
                                setScreen(
                                    isAddFriendLinkOnboarding
                                        ? "home"
                                        : "share-profile-link",
                                );
                            }}
                        />
                    )}
                    {screen == "share-profile-link" && profile && (
                        <ShareProfileLinkScreen
                            profile={profile}
                            onBack={() => setScreen("setup-profile")}
                            onDone={() => setScreen("home")}
                        />
                    )}
                    {screen == "home" && profile && (
                        <HomeScreen
                            friendsCount={friends.length}
                            profile={profile}
                            onOpenFriend={(friendID) =>
                                openFriendProfile(friendID, "home")
                            }
                            onOpenProfile={() => setScreen("profile")}
                        />
                    )}
                    {screen == "profile" && profile && (
                        <ProfileScreen
                            friendsCount={friends.length}
                            profile={profile}
                            onBack={() => setScreen("home")}
                            onOpenFriends={() => setScreen("friends")}
                            onOpenSettings={() => setScreen("settings")}
                        />
                    )}
                    {screen == "friends" && (
                        <FriendsScreen
                            friends={friends}
                            onBack={() => setScreen("profile")}
                            onOpenFriend={(friendID) =>
                                openFriendProfile(friendID, "friends")
                            }
                            onUnfriend={(friendID) =>
                                setFriends((currentFriends) =>
                                    currentFriends.filter(
                                        (friend) => friend.id != friendID,
                                    ),
                                )
                            }
                        />
                    )}
                    {screen == "friend-profile" && selectedFriend && (
                        <ProfileScreen
                            friendsCount={selectedFriend.friendsCount}
                            headerVariant="friend"
                            profile={{
                                avatarUrl: selectedFriend.avatarUrl,
                                fullName: selectedFriend.fullName,
                                username: selectedFriend.username,
                            }}
                            onBack={() => setScreen(friendProfileBackScreen)}
                        />
                    )}
                    {screen == "settings" && profile && (
                        <SettingsScreen
                            onBack={() => setScreen("profile")}
                            onLogout={() => {
                                setProfile(null);
                                setOnboardingEntrySource("direct");
                                setSelectedFriendID(null);
                                setFriends(
                                    showMockFriends ? sampleFriends : [],
                                );
                                setScreen("onboarding");
                            }}
                        />
                    )}
                </>
            )}
        </>
    );
};

export default Page;
