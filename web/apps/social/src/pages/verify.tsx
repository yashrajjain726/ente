import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import {
    VerifyEmailScreen,
    verifyEmailBackground,
} from "screens/VerifyEmailScreen";
import {
    completeSocialSignup,
    resendSocialSignupCode,
} from "services/socialSignup";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        isLiveSignupVerification,
        setIsLiveSignupVerification,
        signupEmail,
    } = useSocialAppState();

    useEffect(() => {
        if (!signupEmail) void router.replace(socialRoutes.signup);
    }, [router, signupEmail]);

    const verifySignupEmail = async (code: string) => {
        if (!isLiveSignupVerification) {
            void router.push(socialRoutes.setupProfile("verify"));
            return;
        }

        try {
            await completeSocialSignup(signupEmail, code);
            setIsLiveSignupVerification(false);
            void router.push(socialRoutes.setupProfile("verify"));
        } catch (error) {
            console.error("Social signup verification failed", error);
        }
    };

    if (!signupEmail) {
        return <SocialRouteFallback background={verifyEmailBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={verifyEmailBackground} />
            <VerifyEmailScreen
                email={signupEmail}
                initialCode={isLiveSignupVerification ? "" : undefined}
                onBack={() => void router.push(socialRoutes.signup)}
                onChangeEmail={() => void router.push(socialRoutes.signup)}
                onResendCode={
                    isLiveSignupVerification
                        ? () => void resendSocialSignupCode(signupEmail)
                        : undefined
                }
                onVerify={(code) => void verifySignupEmail(code)}
            />
        </>
    );
};

export default Page;
