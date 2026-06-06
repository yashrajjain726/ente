import { accountLogout } from "ente-accounts-rs/services/logout";
import { revokeSpaceBrowserSession } from "services/spacePersistentSession";

export const spaceLogout = async () => {
    await revokeSpaceBrowserSession();
    await accountLogout();
};
