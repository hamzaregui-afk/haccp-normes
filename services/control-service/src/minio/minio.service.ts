/**
 * MinioService — wraps the MinIO SDK for control task photo uploads.
 *
 * ARCH-DECISION: We use MinIO (S3-compatible) for object storage instead of
 * the filesystem to support horizontal scaling. Multiple service replicas can
 * write/read photos without shared-volume coordination. The bucket is
 * `haccp-control-photos`; objects are keyed as `{tenantId}/{taskId}/{uuid}.{ext}`.
 *
 * Presigned GET URLs are generated with a 1-hour TTL — long enough for a
 * supervisor to review the photo, short enough to limit exposure if a URL leaks.
 */

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
      // Non-fatal at startup — MinIO might not be reachable in dev without Docker
      this.logger.warn(`MinIO init warning: ${(err as Error).message}`);
    }
  }

  /**
   * Upload a buffer to MinIO.
   * Returns the object key (not a URL — generate presigned URL separately).
   */
  async upload(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
    tenantId: string,
    taskId: string,
  ): Promise<string> {
    const ext       = extname(originalName) || '.bin';
    const objectKey = `${tenantId}/${taskId}/${randomUUID()}${ext}`;

    await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
      'Content-Type': mimetype,
    });

    this.logger.log(`Uploaded control photo: ${objectKey}`);
    return objectKey;
  }

  /**
   * Generate a presigned GET URL valid for 1 hour (3600 seconds).
   */
  async presignedGetUrl(objectKey: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectKey, 3600);
  }
}
