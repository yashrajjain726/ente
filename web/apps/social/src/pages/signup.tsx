import { SocialPageMeta } from "components/SocialPageMeta";
import { useRouter } from "next/router";
import React, { useState } from "react";
import {
    CreateAccountScreen,
    createAccountBackground,
    type CreateAccountInput,
} from "screens/CreateAccountScreen";
import {
    beginSocialSignup,
    socialSignupErrorMessage,
} from "services/socialSignup";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { setIsLiveSignupVerification, setSignupEmail } = useSocialAppState();
    const [signupError, setSignupError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createAccount = async (input: CreateAccountInput) => {
        setIsSubmitting(true);
        setSignupError(undefined);
        try {
            const { email } = await beginSocialSignup(input);
            setSignupEmail(email);
            setIsLiveSignupVerification(true);
            void router.push(socialRoutes.verify);
        } catch (error) {
            setSignupError(await socialSignupErrorMessage(error));
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <SocialPageMeta themeColor={createAccountBackground} />
            <CreateAccountScreen
                errorMessage={signupError}
                isSubmitting={isSubmitting}
                onBack={() => void router.push(socialRoutes.onboarding)}
                onCreateAccount={(input) => void createAccount(input)}
            />
        </>
    );
};

export default Page;
