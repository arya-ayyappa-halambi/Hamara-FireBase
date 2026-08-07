import { StorageDriver } from './storage-driver.interface';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';

export class StorageDriverFactory {
  private static instance: StorageDriver | null = null;

  static getDriver(): StorageDriver {
    if (this.instance) return this.instance;

    const driverType = (process.env.STORAGE_DRIVER || 'local').toLowerCase().trim();

    if (driverType === 's3') {
      console.log('📦 Storage Engine: Initialized AWS S3 Object Storage Driver');
      this.instance = new S3StorageDriver();
    } else {
      console.log('📁 Storage Engine: Initialized Local Disk Storage Driver');
      this.instance = new LocalStorageDriver();
    }

    return this.instance;
  }
}

export const storageDriver = StorageDriverFactory.getDriver();
