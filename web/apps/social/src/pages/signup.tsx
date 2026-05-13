import { SocialPageMeta } from "components/SocialPageMeta";
import { useRouter } from "next/router";
import React, { useState } from "react";
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
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createAccount = async (input: CreateAccountInput) => {
        setIsSubmitting(true);
        try {
            await beginSocialSignup(input);
            setSignupEmail(input.email);
            setIsLiveSignupVerification(true);
            void router.push(socialRoutes.verify);
        } catch (error) {
            console.error("Social signup failed", error);
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <SocialPageMeta themeColor={createAccountBackground} />
            <CreateAccountScreen
                isSubmitting={isSubmitting}
                onBack={() => void router.push(socialRoutes.onboarding)}
                onCreateAccount={(input) => void createAccount(input)}
            />
        </>
    );
};

export default Page;
