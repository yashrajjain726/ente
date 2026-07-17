import { accountLogout } from "ente-accounts-rs/services/logout";
import {
    clearSpaceBrowserSession,
    revokeSpaceBrowserSessions,
} from "services/spacePersistentSession";

export const spaceLogout = async () => {
    await revokeSpaceBrowserSessions();
    clearSpaceBrowserSession();
    await accountLogout();
};
