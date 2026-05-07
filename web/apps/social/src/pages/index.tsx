import Head from "next/head";
import React, { useState } from "react";
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
import {
    RecoveryKeyScreen,
    recoveryKeyBackground,
} from "screens/RecoveryKeyScreen";
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
    | "recovery-key"
    | "setup-profile"
    | "share-profile-link"
    | "home";

type ProfileBackScreen = "login" | "recovery-key";

const Page: React.FC = () => {
    const [screen, setScreen] = useState<Screen>("onboarding");
    const [email, setEmail] = useState("example@example.com");
    const [profile, setProfile] = useState<SetupProfile | null>(null);
    const [profileBackScreen, setProfileBackScreen] =
        useState<ProfileBackScreen>("recovery-key");

    const openSetupProfile = (backScreen: ProfileBackScreen) => {
        setProfileBackScreen(backScreen);
        setScreen("setup-profile");
    };

    return (
        <>
            <Head>
                <meta
                    name="theme-color"
                    content={
                        screen == "onboarding"
                            ? onboardingGreen
                            : screen == "verify-email"
                              ? verifyEmailBackground
                              : screen == "recovery-key"
                                ? recoveryKeyBackground
                                : screen == "login"
                                  ? loginBackground
                                  : screen == "setup-profile"
                                    ? setupProfileBackground
                                    : screen == "share-profile-link"
                                      ? shareProfileLinkBackground
                                      : screen == "home"
                                        ? homeBackground
                                        : createAccountBackground
                    }
                />
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
                    onVerify={() => setScreen("recovery-key")}
                />
            )}
            {screen == "recovery-key" && (
                <RecoveryKeyScreen
                    onBack={() => setScreen("verify-email")}
                    onNext={() => openSetupProfile("recovery-key")}
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
            {screen == "home" && profile && <HomeScreen profile={profile} />}
        </>
    );
};

export default Page;
