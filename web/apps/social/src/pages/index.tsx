import Head from "next/head";
import React, { useState } from "react";
import {
    CreateAccountScreen,
    createAccountBackground,
} from "screens/CreateAccountScreen";
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
    VerifyEmailScreen,
    verifyEmailBackground,
} from "screens/VerifyEmailScreen";

type Screen = "onboarding" | "create-account" | "verify-email" | "recovery-key";

const Page: React.FC = () => {
    const [screen, setScreen] = useState<Screen>("onboarding");
    const [email, setEmail] = useState("example@example.com");

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
                />
            )}
            {screen == "create-account" && (
                <CreateAccountScreen
                    onBack={() => setScreen("onboarding")}
                    onCreateAccount={(nextEmail) => {
                        setEmail(nextEmail || "example@example.com");
                        setScreen("verify-email");
                    }}
                    onLogin={() => setScreen("onboarding")}
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
                    onNext={() => undefined}
                />
            )}
        </>
    );
};

export default Page;
