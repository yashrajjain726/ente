import { SocialPageMeta } from "components/SocialPageMeta";
import { useRouter } from "next/router";
import React from "react";
import { LoginScreen, loginBackground } from "screens/LoginScreen";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();

    return (
        <>
            <SocialPageMeta themeColor={loginBackground} />
            <LoginScreen
                onBack={() => void router.push(socialRoutes.onboarding)}
                onContinue={() =>
                    void router.push(socialRoutes.setupProfile("login"))
                }
                onSignup={() => void router.push(socialRoutes.signup)}
            />
        </>
    );
};

export default Page;
