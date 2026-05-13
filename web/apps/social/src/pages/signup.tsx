import { SocialPageMeta } from "components/SocialPageMeta";
import { useRouter } from "next/router";
import React from "react";
import {
    CreateAccountScreen,
    createAccountBackground,
    type CreateAccountInput,
} from "screens/CreateAccountScreen";
import { beginSocialSignup } from "services/socialSignup";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { setIsLiveSignupVerification, setSignupEmail } = useSocialAppState();

    const createAccount = async (input: CreateAccountInput) => {
        try {
            await beginSocialSignup(input);
            setSignupEmail(input.email);
            setIsLiveSignupVerification(true);
            void router.push(socialRoutes.verify);
        } catch (error) {
            console.error("Social signup failed", error);
        }
    };

    return (
        <>
            <SocialPageMeta themeColor={createAccountBackground} />
            <CreateAccountScreen
                onBack={() => void router.push(socialRoutes.onboarding)}
                onCreateAccount={(input) => void createAccount(input)}
                onLogin={() => void router.push(socialRoutes.login)}
            />
        </>
    );
};

export default Page;
