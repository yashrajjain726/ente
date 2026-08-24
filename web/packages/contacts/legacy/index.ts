export { LegacyDrawerContent } from "./components/LegacyDrawerContent";
export {
    legacyAddContact,
    legacyChangePassword,
    legacyGetInfo,
    legacyPublicKey,
    legacyRejectRecovery,
    legacyStartRecovery,
    legacyStopRecovery,
    legacyUpdateContact,
    legacyUpdateRecoveryNotice,
    legacyVerificationID,
} from "./service";
export { mergeLegacySuggestedUsers } from "./suggestions";
export type {
    LegacyContactRecord,
    LegacyContactState,
    LegacyInfo,
    LegacyRecoverySession,
    LegacyRecoveryStatus,
    LegacySuggestedUser,
    LegacyUser,
} from "./types";
