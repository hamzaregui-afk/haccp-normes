import {
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
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { Roles }        from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { DocumentCategorySchema, DocumentQuerySchema } from './dto/document.dto';
import { DocumentService }     from './document.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.documentService.findAll(user.tenantId, DocumentQuerySchema.parse(query));
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('category') category: string,
  ) {
    const cat = DocumentCategorySchema.catch('OTHER').parse(category);
    return this.documentService.upload(user.tenantId, file, name || file.originalname, cat);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.documentService.remove(id, user.tenantId);
  }
}
