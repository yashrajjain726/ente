import { reloadWindow, sendNotification, showOnTray } from './api/common';
import {
    showUploadDirsDialog,
    showUploadFilesDialog,
    showUploadZipDialog,
    getElectronFile,
    getPendingUploads,
    setToUploadFiles,
    getElectronFilesFromGoogleZip,
    setToUploadCollection,
} from './api/upload';
import { getEncryptionKey, setEncryptionKey } from './utils/safeStorage';
import { clearElectronStore } from './utils/electronStore';
import { openDiskCache, deleteDiskCache } from './utils/cache';
import {
    checkExistsAndCreateCollectionDir,
    checkExistsAndRename,
    saveStreamToDisk,
    saveFileToDisk,
    registerResumeExportListener,
    registerStopExportListener,
    registerPauseExportListener,
    registerRetryFailedExportListener,
    getExportRecord,
    setExportRecord,
    exists,
    selectRootDirectory,
} from './api/export';
import { fixHotReloadNext12 } from './utils/preload';

fixHotReloadNext12();

const windowObject: any = window;

windowObject['ElectronAPIs'] = {
    exists,
    checkExistsAndCreateCollectionDir,
    checkExistsAndRename,
    saveStreamToDisk,
    saveFileToDisk,
    selectRootDirectory,
    sendNotification,
    showOnTray,
    reloadWindow,
    registerResumeExportListener,
    registerStopExportListener,
    registerPauseExportListener,
    registerRetryFailedExportListener,
    getExportRecord,
    setExportRecord,
    getElectronFile,
    showUploadFilesDialog,
    showUploadDirsDialog,
    getPendingUploads,
    setToUploadFiles,
    showUploadZipDialog,
    getElectronFilesFromGoogleZip,
    setToUploadCollection,
    getEncryptionKey,
    setEncryptionKey,
    clearElectronStore,
    openDiskCache,
    deleteDiskCache,
};
