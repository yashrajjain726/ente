import { SocialPageMeta } from "components/SocialPageMeta";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { LoginScreen, loginBackground } from "screens/LoginScreen";
import { completeSocialLogin } from "services/socialLogin";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const [loginError, setLoginError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    return (
        <>
            <SocialPageMeta themeColor={loginBackground} />
            <LoginScreen
                errorMessage={loginError}
                isSubmitting={isSubmitting}
                onBack={() => void router.push(socialRoutes.onboarding)}
                onContinue={async (credentials) => {
                    setIsSubmitting(true);
                    setLoginError(undefined);
                    try {
                        await completeSocialLogin(credentials);
                        void router.push(socialRoutes.setupProfile("login"));
                    } catch (error) {
                        console.error("Social login failed", error);
                        setLoginError(
                            error instanceof Error
                                ? error.message
                                : "Couldn't sign in. Please try again.",
                        );
                        setIsSubmitting(false);
                    }
                }}
            />
        </>
    );
};

export default Page;
