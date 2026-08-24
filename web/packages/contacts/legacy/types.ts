export type {
    LegacyContactRecord,
    LegacyContactState,
    LegacyInfo,
    LegacyRecoverySession,
    LegacyRecoveryStatus,
    LegacyUser,
} from "../types";

export interface LegacySuggestedUser {
    id?: number;
    email: string;
}
