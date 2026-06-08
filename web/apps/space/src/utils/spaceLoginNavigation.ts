import type { NextRouter } from "next/router";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { acceptPendingSpaceInvite } from "utils/spacePendingInvite";
import { spaceRoutes } from "utils/spaceRoutes";

type RefreshProfile = () => Promise<SetupProfile | null>;

export const routeAfterCompletedLogin = async (
    router: NextRouter,
    refreshProfile: RefreshProfile,
    mode: "push" | "replace" = "push",
) => {
    const profile = await refreshProfile();
    if (profile) {
        await acceptPendingSpaceInvite().catch((error: unknown) =>
            console.error("Failed to accept pending invite", error),
        );
        if (mode == "replace") {
            await router.replace(spaceRoutes.home);
            return;
        }
        await router.push(spaceRoutes.home);
        return;
    }

    if (mode == "replace") {
        await router.replace(spaceRoutes.setupProfile("login"));
        return;
    }
    await router.push(spaceRoutes.setupProfile("login"));
};
