import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { Roles }        from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { ModuleGuard }  from '../auth/guards/module.guard';
import { RequireModule } from '../auth/decorators/require-module.decorator';
import { DocumentCategorySchema, DocumentQuerySchema } from './dto/document.dto';
import { DocumentService }     from './document.service';

// ARCH-DECISION: Reject anything not on this allowlist at upload time. The stored
// MIME type is later re-served by MinIO as the object Content-Type, so accepting
// image/svg+xml or text/html would let an attacker store content that a browser
// renders as active markup (stored XSS). We allow documents + raster images only —
// SVG/HTML/JS/executables are refused.
const DOCUMENT_MIME_ALLOWLIST = new Set<string>([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
]);

function mimeAllowlistFilter(allow: Set<string>) {
  return (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ): void => {
    if (allow.has(file.mimetype)) cb(null, true);
    else cb(new BadRequestException(`Type de fichier non autorisé : ${file.mimetype}`), false);
  };
}

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequireModule('GED')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.documentService.findAll(user.tenantId, DocumentQuerySchema.parse(query));
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: mimeAllowlistFilter(DOCUMENT_MIME_ALLOWLIST),
  }))
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('category') category: string,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    const cat    = DocumentCategorySchema.catch('OTHER').parse(category);
    const result = await this.documentService.upload(user.tenantId, file, name || file.originalname, cat);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'CREATE',
      resource:   'documents',
      resourceId: (result.data as { id: string }).id,
      payload:    { name: name || file.originalname, category: cat, sizeBytes: file.size },
    }).catch(() => { /* fire-and-forget: audit failure must never surface */ });

    return result;
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.documentService.remove(id, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'DELETE',
      resource:   'documents',
      resourceId: id,
      payload:    {},
    }).catch(() => { /* fire-and-forget: audit failure must never surface */ });

    return result;
  }
}
