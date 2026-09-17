export type {
    LegacyContactRecord,
    LegacyInfo,
    LegacyRecoverySession,
} from "ente-legacy-wasm/authenticated";

export interface LegacySuggestedUser {
    id?: number;
    email: string;
}
