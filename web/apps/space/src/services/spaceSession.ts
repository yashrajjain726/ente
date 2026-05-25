import {
    savedKeyAttributes,
    savedPartialLocalUser,
} from "ente-accounts-rs/services/accounts-db";
import { masterKeyFromSession } from "ente-accounts-rs/services/session-storage";
import { savedAuthToken } from "ente-base/token";

export const savedSpaceUnlockEmail = async () => {
    try {
        const user = savedPartialLocalUser();
        if (!user?.email || !savedKeyAttributes()) return undefined;
        if (await masterKeyFromSession()) return undefined;

        const authToken = user.token ?? (await savedAuthToken());
        return authToken ? user.email : undefined;
    } catch {
        return undefined;
    }
};
