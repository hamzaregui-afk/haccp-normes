import { z } from 'zod';

// ─── Roles ────────────────────────────────────────────────────────────────────
// IMPORTANT: QUALITY_OFFICER replaces the old QUALITY role across the codebase.
// Update any reference to 'QUALITY' → 'QUALITY_OFFICER'.

export const UserRoleSchema = z.enum([
  'SUPER_ADMIN',      // Platform-level — manages tenants (clients feature only)
  'ADMIN',            // Tenant admin — full access within their tenant
  'MANAGER',          // Department / site manager
  'QUALITY_OFFICER',  // Responsible for quality — read + NC/reports write
  'OPERATOR',         // Field worker — primary mobile app user
  'VIEWER',           // Read-only across all tenant data
]);

export type UserRole = z.infer<typeof UserRoleSchema>;

// Legacy alias — do NOT use in new code
/** @deprecated Use UserRole */
export type Role = UserRole;

// ─── User Status ──────────────────────────────────────────────────────────────

export const UserStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'INVITED',   // Email sent, password not yet set
]);

export type UserStatus = z.infer<typeof UserStatusSchema>;

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: UserRoleSchema,
  status: UserStatusSchema.default('ACTIVE'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({
  id: true,
  tenantId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().min(8).max(128),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = CreateUserSchema.partial().omit({ password: true });
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export const JwtPayloadSchema = z.object({
  sub: z.string().min(1),        // userId — min(1) not cuid() so any valid ID format works
  email: z.string().email(),
  name: z.string().optional(),   // display name — included in JWT for UI convenience
  tenantId: z.string().min(1),   // CRITICAL — every service query is scoped to this
  role: UserRoleSchema,
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type TokenPair = z.infer<typeof TokenPairSchema>;

// ─── Group ────────────────────────────────────────────────────────────────────

export const GroupMemberSchema = z.object({
  userId: z.string().cuid(),
  groupId: z.string().cuid(),
  user: z.object({
    id: z.string().cuid(),
    name: z.string(),
    email: z.string().email(),
    role: UserRoleSchema,
  }).optional(),
});

export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const GroupSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100),
  tenantId: z.string().cuid(),
  createdAt: z.coerce.date(),
  // Prisma aggregation — present on list queries
  _count: z.object({ members: z.number() }).optional(),
  // Present on detail query
  members: z.array(GroupMemberSchema).optional(),
});

export type Group = z.infer<typeof GroupSchema>;

export const CreateGroupSchema = z.object({ name: z.string().min(1).max(100) });
export type CreateGroup = z.infer<typeof CreateGroupSchema>;
