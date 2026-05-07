import Head from "next/head";
import React, { useState } from "react";
import {
    CreateAccountScreen,
    createAccountBackground,
} from "screens/CreateAccountScreen";
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
} from "screens/SetupProfileScreen";
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
    | "setup-profile";

type ProfileBackScreen = "login" | "recovery-key";

const Page: React.FC = () => {
    const [screen, setScreen] = useState<Screen>("onboarding");
    const [email, setEmail] = useState("example@example.com");
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
                    onContinue={() => undefined}
                />
            )}
        </>
    );
};

export default Page;
