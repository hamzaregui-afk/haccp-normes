import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { JwtPayload } from '@haccp/shared-types';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PaginationQuerySchema } from '@haccp/shared-validators';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: Record<string, unknown>) {
    const { page, limit, search } = PaginationQuerySchema.parse(query);

    const where = {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, email: true, name: true,
          role: true, status: true, tenantId: true,
          createdAt: true, updatedAt: true,
          // passwordHash intentionally excluded
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return toApiResponse(users, toPaginationMeta(total, page, limit));
  }

  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return toApiResponse(user);
  }

  async create(dto: CreateUserDto, actor: JwtPayload) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException(`Email ${dto.email} already in use`);

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : await bcrypt.hash(crypto.randomUUID(), 12); // placeholder — invite flow sets real password

    const status = dto.password ? 'ACTIVE' : 'INVITED';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        status,
        tenantId: actor.tenantId,
        passwordHash, // stored only in auth-service — sync via RabbitMQ event
      } as Parameters<typeof this.prisma.user.create>[0]['data'],
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true, createdAt: true, updatedAt: true,
      },
    });

    // TODO: publish user.user.created event to RabbitMQ → auth-service syncs credentials
    return toApiResponse(user, undefined, status === 'INVITED' ? 'Invitation sent' : 'User created');
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string) {
    await this.findOne(id, tenantId); // throws 404 if not found or wrong tenant

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true, createdAt: true, updatedAt: true,
      },
    });
    return toApiResponse(user);
  }

  async remove(id: string, tenantId: string, actor: JwtPayload) {
    await this.findOne(id, tenantId);
    if (id === actor.sub) throw new ConflictException('You cannot delete your own account');

    await this.prisma.user.delete({ where: { id } });
    return toApiResponse(null, undefined, 'User deleted');
  }
}
