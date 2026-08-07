import { expose } from "comlink";
import { logUnhandledErrorsAndRejectionsInWorker } from "ente-base/log-web";
import { wait } from "ente-utils/promise";
import HeicConvert from "heic-convert";

export class HEICConvertWorker {
    async heicToJPEG(heicBlob: Blob) {
        const output = await heicToJPEG(heicBlob);
        // I'm told this library used to have big memory spikes, and adding
        // pauses to get GC to run helped. This might just be superstition tho.
        await wait(10 /* ms */);
        return output;
    }
}

expose(HEICConvertWorker);

logUnhandledErrorsAndRejectionsInWorker();

const heicToJPEG = async (heicBlob: Blob): Promise<Blob> => {
    const buffer = new Uint8Array(await heicBlob.arrayBuffer());
    // TypeScript versions after 5.6.3 report a type error here, possibly fixed
    // by newer Node.js types.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const result = await HeicConvert({ buffer, format: "JPEG" });
    const convertedData = new Uint8Array(result);
    return new Blob([convertedData], { type: "image/jpeg" });
};
