import { haveMasterKeyInSession } from "ente-base/session";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { stashRedirect } from "../../services/redirect";

export const useRedirectIfNeedsCredentials = (currentPageSlug: string) => {
    const router = useRouter();

    useEffect(() => {
        if (!haveMasterKeyInSession()) {
            stashRedirect(currentPageSlug);
            void router.push("/");
        }
    }, [router]);
};
