import type { NextRouter } from "next/router";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { spaceRoutes } from "utils/spaceRoutes";

type RefreshProfile = () => Promise<SetupProfile | null>;

export const routeAfterCompletedLogin = async (
    router: NextRouter,
    refreshProfile: RefreshProfile,
    mode: "push" | "replace" = "push",
) => {
    await refreshProfile();
    if (mode == "replace") {
        await router.replace(spaceRoutes.setupProfile("login"));
        return;
    }
    await router.push(spaceRoutes.setupProfile("login"));
};
