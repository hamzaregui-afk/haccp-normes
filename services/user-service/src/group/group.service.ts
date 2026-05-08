import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGroupDto, AddMemberDto } from './dto/create-group.dto';

@Injectable()
export class GroupService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, page = 1, limit = 20) {
    const [groups, total] = await Promise.all([
      this.prisma.group.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.group.count({ where: { tenantId } }),
    ]);
    return toApiResponse(groups, toPaginationMeta(total, page, limit));
  }

  async findOne(id: string, tenantId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, tenantId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });
    if (!group) throw new NotFoundException(`Group ${id} not found`);
    return toApiResponse(group);
  }

  async create(dto: CreateGroupDto, tenantId: string) {
    const exists = await this.prisma.group.findFirst({
      where: { name: dto.name, tenantId },
    });
    if (exists) throw new ConflictException(`Group "${dto.name}" already exists`);

    const group = await this.prisma.group.create({
      data: { name: dto.name, tenantId },
    });
    return toApiResponse(group, undefined, 'Group created');
  }

  async addMember(groupId: string, dto: AddMemberDto, tenantId: string) {
    await this.findOne(groupId, tenantId);

    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, tenantId } });
    if (!user) throw new NotFoundException(`User ${dto.userId} not found in this tenant`);

    await this.prisma.groupMember.upsert({
      where: { userId_groupId: { userId: dto.userId, groupId } },
      create: { userId: dto.userId, groupId },
      update: {},
    });
    return toApiResponse(null, undefined, 'Member added');
  }

  async removeMember(groupId: string, userId: string, tenantId: string) {
    await this.findOne(groupId, tenantId);
    await this.prisma.groupMember.delete({
      where: { userId_groupId: { userId, groupId } },
    });
    return toApiResponse(null, undefined, 'Member removed');
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.group.delete({ where: { id } });
    return toApiResponse(null, undefined, 'Group deleted');
  }
}
