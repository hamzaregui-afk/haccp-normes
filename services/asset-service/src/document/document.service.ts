import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import type { DocumentQuery } from './dto/document.dto';

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio:  MinioService,
  ) {}

  async findAll(tenantId: string, query: DocumentQuery) {
    const { page, limit, category, search } = query;
    const where = {
      tenantId,
      ...(category ? { category: category as never } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [docs, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    // Refresh presigned URLs so they don't expire mid-session
    const withUrls = await Promise.all(
      docs.map(async (d) => ({ ...d, url: await this.minio.presignedGetUrl(d.objectKey) }))
    );

    return toApiResponse(withUrls, toPaginationMeta(total, { page, limit }));
  }

  async upload(
    tenantId: string,
    file: Express.Multer.File,
    name: string,
    category: 'PROCEDURE' | 'RECIPE' | 'OTHER',
  ) {
    const objectKey = await this.minio.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      tenantId,
      category.toLowerCase(),
    );
    const url = await this.minio.presignedGetUrl(objectKey);

    const doc = await this.prisma.document.create({
      data: {
        tenantId,
        name,
        category: category as never,
        mimeType:  file.mimetype,
        sizeBytes: file.size,
        objectKey,
        url,
      },
    });

    return toApiResponse({ ...doc, url }, undefined, 'Document ajouté');
  }

  async remove(id: string, tenantId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);

    await this.minio.deleteObject(doc.objectKey);
    // ARCH-DECISION: Double-scoped where for defense-in-depth — tenantId ensures
    // a race between the findFirst ownership check and the delete cannot be
    // exploited to delete a document belonging to a different tenant.
    await this.prisma.document.delete({ where: { id, tenantId } });

    return toApiResponse(null, undefined, 'Document supprimé');
  }
}
