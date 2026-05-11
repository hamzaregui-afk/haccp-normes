import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { env } from '../config/env';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Minio.Client;
  private readonly bucket = env.MINIO_BUCKET;

  constructor() {
    this.client = new Minio.Client({
      endPoint:  env.MINIO_ENDPOINT,
      port:      env.MINIO_PORT,
      useSSL:    env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'eu-west-1');
        this.logger.log(`Bucket '${this.bucket}' created`);
      }
    } catch (err) {
      this.logger.warn(`MinIO init warning: ${(err as Error).message}`);
    }
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
    tenantId: string,
    category: string,
  ): Promise<string> {
    const ext       = extname(originalName) || '.bin';
    const objectKey = `${tenantId}/${category}/${randomUUID()}${ext}`;
    await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, { 'Content-Type': mimetype });
    this.logger.log(`Uploaded document: ${objectKey}`);
    return objectKey;
  }

  async presignedGetUrl(objectKey: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectKey, 3600);
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
    this.logger.log(`Deleted document: ${objectKey}`);
  }
}
