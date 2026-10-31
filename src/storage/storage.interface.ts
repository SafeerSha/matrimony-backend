export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface StorageUploadResult {
  url: string;
  objectKey: string | null;
  storageProvider: string;
}

export interface StorageDeleteTarget {
  url: string;
  objectKey?: string | null;
  storageProvider?: string;
}

export abstract class StorageService {
  abstract uploadFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<StorageUploadResult>;
  abstract deleteFile(target: StorageDeleteTarget): Promise<void>;
}
