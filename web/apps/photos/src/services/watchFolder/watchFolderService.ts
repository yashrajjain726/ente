import { ensureElectron } from "@/next/electron";
import log from "@/next/log";
import { UPLOAD_RESULT, UPLOAD_STRATEGY } from "constants/upload";
import debounce from "debounce";
import uploadManager from "services/upload/uploadManager";
import { Collection } from "types/collection";
import { EncryptedEnteFile } from "types/file";
import { ElectronFile, FileWithCollection } from "types/upload";
import {
    EventQueueItem,
    WatchMapping,
    WatchMappingSyncedFile,
} from "types/watchFolder";
import { groupFilesBasedOnCollectionID } from "utils/file";
import { getValidFilesToUpload } from "utils/watch";
import { removeFromCollection } from "../collectionService";
import { getLocalFiles } from "../fileService";
import {
    diskFileAddedCallback,
    diskFileRemovedCallback,
    diskFolderRemovedCallback,
} from "./watchFolderEventHandlers";

class watchFolderService {
    private eventQueue: EventQueueItem[] = [];
    private currentEvent: EventQueueItem;
    private currentlySyncedMapping: WatchMapping;
    private trashingDirQueue: string[] = [];
    private isEventRunning: boolean = false;
    private uploadRunning: boolean = false;
    private filePathToUploadedFileIDMap = new Map<string, EncryptedEnteFile>();
    private unUploadableFilePaths = new Set<string>();
    private isPaused = false;
    private setElectronFiles: (files: ElectronFile[]) => void;
    private setCollectionName: (collectionName: string) => void;
    private syncWithRemote: () => void;
    private setWatchFolderServiceIsRunning: (isRunning: boolean) => void;
    private debouncedRunNextEvent: () => void;

    constructor() {
        this.debouncedRunNextEvent = debounce(() => this.runNextEvent(), 1000);
    }

    isUploadRunning() {
        return this.uploadRunning;
    }

    isSyncPaused() {
        return this.isPaused;
    }

    async init(
        setElectronFiles: (files: ElectronFile[]) => void,
        setCollectionName: (collectionName: string) => void,
        syncWithRemote: () => void,
        setWatchFolderServiceIsRunning: (isRunning: boolean) => void,
    ) {
        try {
            this.setElectronFiles = setElectronFiles;
            this.setCollectionName = setCollectionName;
            this.syncWithRemote = syncWithRemote;
            this.setWatchFolderServiceIsRunning =
                setWatchFolderServiceIsRunning;
            this.setupWatcherFunctions();
            await this.getAndSyncDiffOfFiles();
        } catch (e) {
            log.error("error while initializing watch service", e);
        }
    }

    async getAndSyncDiffOfFiles() {
        try {
            let mappings = await this.getWatchMappings();

            if (!mappings?.length) {
                return;
            }

            mappings = await this.filterOutDeletedMappings(mappings);

            this.eventQueue = [];

            for (const mapping of mappings) {
                const filesOnDisk: ElectronFile[] =
                    await ensureElectron().getDirFiles(mapping.folderPath);

                this.uploadDiffOfFiles(mapping, filesOnDisk);
                this.trashDiffOfFiles(mapping, filesOnDisk);
            }
        } catch (e) {
            log.error("error while getting and syncing diff of files", e);
        }
    }

    isMappingSyncInProgress(mapping: WatchMapping) {
        return this.currentEvent?.folderPath === mapping.folderPath;
    }

    private uploadDiffOfFiles(
        mapping: WatchMapping,
        filesOnDisk: ElectronFile[],
    ) {
        const filesToUpload = getValidFilesToUpload(filesOnDisk, mapping);

        if (filesToUpload.length > 0) {
            for (const file of filesToUpload) {
                const event: EventQueueItem = {
                    type: "upload",
                    collectionName: this.getCollectionNameForMapping(
                        mapping,
                        file.path,
                    ),
                    folderPath: mapping.folderPath,
                    files: [file],
                };
                this.pushEvent(event);
            }
        }
    }

    private trashDiffOfFiles(
        mapping: WatchMapping,
        filesOnDisk: ElectronFile[],
    ) {
        const filesToRemove = mapping.syncedFiles.filter((file) => {
            return !filesOnDisk.find(
                (electronFile) => electronFile.path === file.path,
            );
        });

        if (filesToRemove.length > 0) {
            for (const file of filesToRemove) {
                const event: EventQueueItem = {
                    type: "trash",
                    collectionName: this.getCollectionNameForMapping(
                        mapping,
                        file.path,
                    ),
                    folderPath: mapping.folderPath,
                    paths: [file.path],
                };
                this.pushEvent(event);
            }
        }
    }

    private async filterOutDeletedMappings(
        mappings: WatchMapping[],
    ): Promise<WatchMapping[]> {
        const notDeletedMappings = [];
        for (const mapping of mappings) {
            const mappingExists = await ensureElectron().isFolder(
                mapping.folderPath,
            );
            if (!mappingExists) {
                ensureElectron().removeWatchMapping(mapping.folderPath);
            } else {
                notDeletedMappings.push(mapping);
            }
        }
        return notDeletedMappings;
    }

    pushEvent(event: EventQueueItem) {
        this.eventQueue.push(event);
        this.debouncedRunNextEvent();
    }

    async pushTrashedDir(path: string) {
        this.trashingDirQueue.push(path);
    }

    private setupWatcherFunctions() {
        ensureElectron().registerWatcherFunctions(
            diskFileAddedCallback,
            diskFileRemovedCallback,
            diskFolderRemovedCallback,
        );
    }

    async addWatchMapping(
        rootFolderName: string,
        folderPath: string,
        uploadStrategy: UPLOAD_STRATEGY,
    ) {
        try {
            await ensureElectron().addWatchMapping(
                rootFolderName,
                folderPath,
                uploadStrategy,
            );
            this.getAndSyncDiffOfFiles();
        } catch (e) {
            log.error("error while adding watch mapping", e);
        }
    }

    async removeWatchMapping(folderPath: string) {
        try {
            await ensureElectron().removeWatchMapping(folderPath);
        } catch (e) {
            log.error("error while removing watch mapping", e);
        }
    }

    async getWatchMappings(): Promise<WatchMapping[]> {
        try {
            return (await ensureElectron().getWatchMappings()) ?? [];
        } catch (e) {
            log.error("error while getting watch mappings", e);
            return [];
        }
    }

    private setIsEventRunning(isEventRunning: boolean) {
        this.isEventRunning = isEventRunning;
        this.setWatchFolderServiceIsRunning(isEventRunning);
    }

    private async runNextEvent() {
        try {
            if (
                this.eventQueue.length === 0 ||
                this.isEventRunning ||
                this.isPaused
            ) {
                return;
            }

            const event = this.clubSameCollectionEvents();
            log.info(
                `running event type:${event.type} collectionName:${event.collectionName} folderPath:${event.folderPath} , fileCount:${event.files?.length} pathsCount: ${event.paths?.length}`,
            );
            const mappings = await this.getWatchMappings();
            const mapping = mappings.find(
                (mapping) => mapping.folderPath === event.folderPath,
            );
            if (!mapping) {
                throw Error("no Mapping found for event");
            }
            log.info(
                `mapping for event rootFolder: ${mapping.rootFolderName} folderPath: ${mapping.folderPath} uploadStrategy: ${mapping.uploadStrategy} syncedFilesCount: ${mapping.syncedFiles.length} ignoredFilesCount ${mapping.ignoredFiles.length}`,
            );
            if (event.type === "upload") {
                event.files = getValidFilesToUpload(event.files, mapping);
                log.info(`valid files count: ${event.files?.length}`);
                if (event.files.length === 0) {
                    return;
                }
            }
            this.currentEvent = event;
            this.currentlySyncedMapping = mapping;

            this.setIsEventRunning(true);
            if (event.type === "upload") {
                this.processUploadEvent();
            } else {
                await this.processTrashEvent();
                this.setIsEventRunning(false);
                setTimeout(() => this.runNextEvent(), 0);
            }
        } catch (e) {
            log.error("runNextEvent failed", e);
        }
    }

    private async processUploadEvent() {
        try {
            this.uploadRunning = true;

            this.setCollectionName(this.currentEvent.collectionName);
            this.setElectronFiles(this.currentEvent.files);
        } catch (e) {
            log.error("error while running next upload", e);
        }
    }

    async onFileUpload(
        fileUploadResult: UPLOAD_RESULT,
        fileWithCollection: FileWithCollection,
        file: EncryptedEnteFile,
    ) {
        log.debug(() => `onFileUpload called`);
        if (!this.isUploadRunning()) {
            return;
        }
        if (
            [
                UPLOAD_RESULT.ADDED_SYMLINK,
                UPLOAD_RESULT.UPLOADED,
                UPLOAD_RESULT.UPLOADED_WITH_STATIC_THUMBNAIL,
                UPLOAD_RESULT.ALREADY_UPLOADED,
            ].includes(fileUploadResult)
        ) {
            if (fileWithCollection.isLivePhoto) {
                this.filePathToUploadedFileIDMap.set(
                    (fileWithCollection.livePhotoAssets.image as ElectronFile)
                        .path,
                    file,
                );
                this.filePathToUploadedFileIDMap.set(
                    (fileWithCollection.livePhotoAssets.video as ElectronFile)
                        .path,
                    file,
                );
            } else {
                this.filePathToUploadedFileIDMap.set(
                    (fileWithCollection.file as ElectronFile).path,
                    file,
                );
            }
        } else if (
            [UPLOAD_RESULT.UNSUPPORTED, UPLOAD_RESULT.TOO_LARGE].includes(
                fileUploadResult,
            )
        ) {
            if (fileWithCollection.isLivePhoto) {
                this.unUploadableFilePaths.add(
                    (fileWithCollection.livePhotoAssets.image as ElectronFile)
                        .path,
                );
                this.unUploadableFilePaths.add(
                    (fileWithCollection.livePhotoAssets.video as ElectronFile)
                        .path,
                );
            } else {
                this.unUploadableFilePaths.add(
                    (fileWithCollection.file as ElectronFile).path,
                );
            }
        }
    }

    async allFileUploadsDone(
        filesWithCollection: FileWithCollection[],
        collections: Collection[],
    ) {
        try {
            log.debug(
                () =>
                    `allFileUploadsDone,${JSON.stringify(
                        filesWithCollection,
                    )} ${JSON.stringify(collections)}`,
            );
            const collection = collections.find(
                (collection) =>
                    collection.id === filesWithCollection[0].collectionID,
            );
            log.debug(() => `got collection ${!!collection}`);
            log.debug(
                () =>
                    `${this.isEventRunning} ${this.currentEvent.collectionName} ${collection?.name}`,
            );
            if (
                !this.isEventRunning ||
                this.currentEvent.collectionName !== collection?.name
            ) {
                return;
            }

            const syncedFiles: WatchMapping["syncedFiles"] = [];
            const ignoredFiles: WatchMapping["ignoredFiles"] = [];

            for (const fileWithCollection of filesWithCollection) {
                this.handleUploadedFile(
                    fileWithCollection,
                    syncedFiles,
                    ignoredFiles,
                );
            }

            log.debug(() => `syncedFiles ${JSON.stringify(syncedFiles)}`);
            log.debug(() => `ignoredFiles ${JSON.stringify(ignoredFiles)}`);

            if (syncedFiles.length > 0) {
                this.currentlySyncedMapping.syncedFiles = [
                    ...this.currentlySyncedMapping.syncedFiles,
                    ...syncedFiles,
                ];
                await ensureElectron().updateWatchMappingSyncedFiles(
                    this.currentlySyncedMapping.folderPath,
                    this.currentlySyncedMapping.syncedFiles,
                );
            }
            if (ignoredFiles.length > 0) {
                this.currentlySyncedMapping.ignoredFiles = [
                    ...this.currentlySyncedMapping.ignoredFiles,
                    ...ignoredFiles,
                ];
                await ensureElectron().updateWatchMappingIgnoredFiles(
                    this.currentlySyncedMapping.folderPath,
                    this.currentlySyncedMapping.ignoredFiles,
                );
            }

            this.runPostUploadsAction();
        } catch (e) {
            log.error("error while running all file uploads done", e);
        }
    }

    private runPostUploadsAction() {
        this.setIsEventRunning(false);
        this.uploadRunning = false;
        this.runNextEvent();
    }

    private handleUploadedFile(
        fileWithCollection: FileWithCollection,
        syncedFiles: WatchMapping["syncedFiles"],
        ignoredFiles: WatchMapping["ignoredFiles"],
    ) {
        if (fileWithCollection.isLivePhoto) {
            const imagePath = (
                fileWithCollection.livePhotoAssets.image as ElectronFile
            ).path;
            const videoPath = (
                fileWithCollection.livePhotoAssets.video as ElectronFile
            ).path;

            if (
                this.filePathToUploadedFileIDMap.has(imagePath) &&
                this.filePathToUploadedFileIDMap.has(videoPath)
            ) {
                const imageFile = {
                    path: imagePath,
                    uploadedFileID:
                        this.filePathToUploadedFileIDMap.get(imagePath).id,
                    collectionID:
                        this.filePathToUploadedFileIDMap.get(imagePath)
                            .collectionID,
                };
                const videoFile = {
                    path: videoPath,
                    uploadedFileID:
                        this.filePathToUploadedFileIDMap.get(videoPath).id,
                    collectionID:
                        this.filePathToUploadedFileIDMap.get(videoPath)
                            .collectionID,
                };
                syncedFiles.push(imageFile);
                syncedFiles.push(videoFile);
                log.debug(
                    () =>
                        `added image ${JSON.stringify(
                            imageFile,
                        )} and video file ${JSON.stringify(
                            videoFile,
                        )} to uploadedFiles`,
                );
            } else if (
                this.unUploadableFilePaths.has(imagePath) &&
                this.unUploadableFilePaths.has(videoPath)
            ) {
                ignoredFiles.push(imagePath);
                ignoredFiles.push(videoPath);
                log.debug(
                    () =>
                        `added image ${imagePath} and video file ${videoPath} to rejectedFiles`,
                );
            }
            this.filePathToUploadedFileIDMap.delete(imagePath);
            this.filePathToUploadedFileIDMap.delete(videoPath);
        } else {
            const filePath = (fileWithCollection.file as ElectronFile).path;

            if (this.filePathToUploadedFileIDMap.has(filePath)) {
                const file = {
                    path: filePath,
                    uploadedFileID:
                        this.filePathToUploadedFileIDMap.get(filePath).id,
                    collectionID:
                        this.filePathToUploadedFileIDMap.get(filePath)
                            .collectionID,
                };
                syncedFiles.push(file);
                log.debug(() => `added file ${JSON.stringify(file)}`);
            } else if (this.unUploadableFilePaths.has(filePath)) {
                ignoredFiles.push(filePath);
                log.debug(() => `added file ${filePath} to rejectedFiles`);
            }
            this.filePathToUploadedFileIDMap.delete(filePath);
        }
    }

    private async processTrashEvent() {
        try {
            if (this.checkAndIgnoreIfFileEventsFromTrashedDir()) {
                return;
            }

            const { paths } = this.currentEvent;
            const filePathsToRemove = new Set(paths);

            const files = this.currentlySyncedMapping.syncedFiles.filter(
                (file) => filePathsToRemove.has(file.path),
            );

            await this.trashByIDs(files);

            this.currentlySyncedMapping.syncedFiles =
                this.currentlySyncedMapping.syncedFiles.filter(
                    (file) => !filePathsToRemove.has(file.path),
                );
            await ensureElectron().updateWatchMappingSyncedFiles(
                this.currentlySyncedMapping.folderPath,
                this.currentlySyncedMapping.syncedFiles,
            );
        } catch (e) {
            log.error("error while running next trash", e);
        }
    }

    private async trashByIDs(toTrashFiles: WatchMapping["syncedFiles"]) {
        try {
            const files = await getLocalFiles();
            const toTrashFilesMap = new Map<number, WatchMappingSyncedFile>();
            for (const file of toTrashFiles) {
                toTrashFilesMap.set(file.uploadedFileID, file);
            }
            const filesToTrash = files.filter((file) => {
                if (toTrashFilesMap.has(file.id)) {
                    const fileToTrash = toTrashFilesMap.get(file.id);
                    if (fileToTrash.collectionID === file.collectionID) {
                        return true;
                    }
                }
            });
            const groupFilesByCollectionId =
                groupFilesBasedOnCollectionID(filesToTrash);

            for (const [
                collectionID,
                filesToTrash,
            ] of groupFilesByCollectionId.entries()) {
                await removeFromCollection(collectionID, filesToTrash);
            }
            this.syncWithRemote();
        } catch (e) {
            log.error("error while trashing by IDs", e);
        }
    }

    private checkAndIgnoreIfFileEventsFromTrashedDir() {
        if (this.trashingDirQueue.length !== 0) {
            this.ignoreFileEventsFromTrashedDir(this.trashingDirQueue[0]);
            this.trashingDirQueue.shift();
            return true;
        }
        return false;
    }

    private ignoreFileEventsFromTrashedDir(trashingDir: string) {
        this.eventQueue = this.eventQueue.filter((event) =>
            event.paths.every((path) => !path.startsWith(trashingDir)),
        );
    }

    async getCollectionNameAndFolderPath(filePath: string) {
        try {
            const mappings = await this.getWatchMappings();

            const mapping = mappings.find(
                (mapping) =>
                    filePath.length > mapping.folderPath.length &&
                    filePath.startsWith(mapping.folderPath) &&
                    filePath[mapping.folderPath.length] === "/",
            );

            if (!mapping) {
                throw Error(`no mapping found`);
            }

            return {
                collectionName: this.getCollectionNameForMapping(
                    mapping,
                    filePath,
                ),
                folderPath: mapping.folderPath,
            };
        } catch (e) {
            log.error("error while getting collection name", e);
        }
    }

    private getCollectionNameForMapping(
        mapping: WatchMapping,
        filePath: string,
    ) {
        return mapping.uploadStrategy === UPLOAD_STRATEGY.COLLECTION_PER_FOLDER
            ? getParentFolderName(filePath)
            : mapping.rootFolderName;
    }

    async selectFolder(): Promise<string> {
        try {
            const folderPath = await ensureElectron().selectDirectory();
            return folderPath;
        } catch (e) {
            log.error("error while selecting folder", e);
        }
    }

    // Batches all the files to be uploaded (or trashed) from the
    // event queue of same collection as the next event
    private clubSameCollectionEvents(): EventQueueItem {
        const event = this.eventQueue.shift();
        while (
            this.eventQueue.length > 0 &&
            event.collectionName === this.eventQueue[0].collectionName &&
            event.type === this.eventQueue[0].type
        ) {
            if (event.type === "trash") {
                event.paths = [...event.paths, ...this.eventQueue[0].paths];
            } else {
                event.files = [...event.files, ...this.eventQueue[0].files];
            }
            this.eventQueue.shift();
        }
        return event;
    }

    async isFolder(folderPath: string) {
        try {
            const isFolder = await ensureElectron().isFolder(folderPath);
            return isFolder;
        } catch (e) {
            log.error("error while checking if folder exists", e);
        }
    }

    pauseRunningSync() {
        this.isPaused = true;
        uploadManager.cancelRunningUpload();
    }

    resumePausedSync() {
        this.isPaused = false;
        this.getAndSyncDiffOfFiles();
    }
}

export default new watchFolderService();

export const getParentFolderName = (filePath: string) => {
    const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
    const folderName = folderPath.substring(folderPath.lastIndexOf("/") + 1);
    return folderName;
};
