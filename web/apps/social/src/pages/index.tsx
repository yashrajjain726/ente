import { Box } from "@mui/material";
import Head from "next/head";
import React, { useEffect, useState } from "react";
import {
    CreateAccountScreen,
    createAccountBackground,
} from "screens/CreateAccountScreen";
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
    | "settings";

type ProfileBackScreen = "login" | "verify-email";

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

const publicProfileFromLink = (): SetupProfile => ({
    avatarUrl: samplePublicProfileData.avatarUrl,
    fullName: samplePublicProfileData.fullName,
    username: samplePublicProfileData.username,
});

const Page: React.FC = () => {
    const [routeMode, setRouteMode] = useState<RouteMode>({ kind: "checking" });
    const [screen, setScreen] = useState<Screen>("onboarding");
    const [email, setEmail] = useState("example@example.com");
    const [profile, setProfile] = useState<SetupProfile | null>(null);
    const [profileBackScreen, setProfileBackScreen] =
        useState<ProfileBackScreen>("verify-email");

    const openSetupProfile = (backScreen: ProfileBackScreen) => {
        setProfileBackScreen(backScreen);
        setScreen("setup-profile");
    };

    useEffect(() => {
        const publicProfileLink = parsePublicProfileLink();
        setRouteMode(
            publicProfileLink
                ? { kind: "public-profile", ...publicProfileLink }
                : { kind: "app" },
        );
    }, []);

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
                <PublicProfileScreen profile={publicProfileFromLink()} />
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
                            onBack={() => setScreen(profileBackScreen)}
                            onContinue={(nextProfile) => {
                                setProfile(nextProfile);
                                setScreen("share-profile-link");
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
                            profile={profile}
                            onOpenProfile={() => setScreen("profile")}
                        />
                    )}
                    {screen == "profile" && profile && (
                        <ProfileScreen
                            profile={profile}
                            onBack={() => setScreen("home")}
                            onOpenSettings={() => setScreen("settings")}
                        />
                    )}
                    {screen == "settings" && profile && (
                        <SettingsScreen
                            email={email}
                            profile={profile}
                            onBack={() => setScreen("profile")}
                        />
                    )}
                </>
            )}
        </>
    );
};

export default Page;
