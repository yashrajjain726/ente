import { t } from "i18next";

const units = ["b", "kb", "mb", "gb", "tb"];

export const bytesInGB = (bytes: number, precision = 0): string =>
    (bytes / (1024 * 1024 * 1024)).toFixed(precision);

export function formattedByteSize(bytes: number, precision = 2): string {
    if (bytes <= 0) return `0 ${t("storage_unit.mb")}`;

    const i = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    const quantity = bytes / Math.pow(1024, i);
    const unit = units[i];

    return `${quantity.toFixed(precision)} ${t(`storage_unit.${unit}`)}`;
}

interface FormattedStorageByteSizeOptions {
    /**
     * If `true` then round up the fractional quantity we obtain when dividing
     * the number of bytes by the number of bytes in the unit that got chosen.
     *
     * The default behaviour is to take the ceiling.
     */
    round?: boolean;
}

export const formattedStorageByteSize = (
    bytes: number,
    options?: FormattedStorageByteSizeOptions,
): string => {
    if (bytes <= 0) return `0 ${t("storage_unit.mb")}`;

    const i = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );

    let quantity = bytes / Math.pow(1024, i);
    let unit = units[i];

    // Prefer 0.1 of the next unit over values above 100.
    if (quantity > 100 && i < units.length - 2) {
        quantity /= 1024;
        unit = units[i + 1];
    }

    quantity = Number(quantity.toFixed(1));

    // Storage displays above 10 GB omit fractional precision.
    if (bytes >= 10 * 1024 * 1024 * 1024) {
        if (options?.round) {
            quantity = Math.ceil(quantity);
        } else {
            quantity = Math.round(quantity);
        }
    }

    return `${quantity} ${t(`storage_unit.${unit}`)}`;
};
