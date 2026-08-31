// ─────────────────────────────────────────────────────────────────────────────
//  src/services/organization.service.ts
//  AegisDB — GitHub-Grade Multi-Tenant Organizations, Teams & Project Isolation
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';
import { envelopeEncryptionService } from './envelope-encryption.service';

export function decryptUserField(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val.startsWith('{') && val.includes('"_encrypted":true')) {
      try {
        const parsed = JSON.parse(val);
        const dec = envelopeEncryptionService.decryptField(parsed, 'SYSTEM');
        return dec || val;
      } catch (_) {
        return val;
      }
    }
    return val;
  }
  if (typeof val === 'object' && val._encrypted === true) {
    try {
      const dec = envelopeEncryptionService.decryptField(val, 'SYSTEM');
      return dec || JSON.stringify(val);
    } catch (_) {
      return JSON.stringify(val);
    }
  }
  return String(val);
}

export type OrgRole = 'owner' | 'admin' | 'member' | 'billing_manager' | 'auditor';
export type ProjectRole = 'admin' | 'maintainer' | 'developer' | 'viewer';

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail?: string;
  ownerName?: string;
  avatarUrl?: string | null;
  description?: string | null;
  defaultMemberRole?: OrgRole;
  createdAt: string;
  updatedAt: string;
  myRole?: OrgRole;
  membersCount?: number;
  teamsCount?: number;
  projectsCount?: number;
}

export interface OrgMemberRecord {
  id: string;
  orgId: string;
  userId: string;
  email: string;
  name: string;
  role: OrgRole;
  joinedAt: string;
}

export interface OrgInviteRecord {
  id: string;
  orgId: string;
  orgName?: string;
  invitedEmail: string;
  role: OrgRole;
  token: string;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

export interface OrgTeamRecord {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description?: string | null;
  membersCount: number;
  memberCount?: number;
  projectsCount: number;
  projectGrantCount?: number;
  createdAt: string;
  updatedAt: string;
  myTeamRole?: 'maintainer' | 'member' | null;
}

export interface OrgTeamMemberRecord {
  id: string;
  teamId: string;
  userId: string;
  email: string;
  name: string;
  role: 'maintainer' | 'member';
  addedAt: string;
}

export interface ProjectTeamGrantRecord {
  id: string;
  projectId: string;
  projectName?: string;
  teamId: string;
  teamName?: string;
  teamSlug?: string;
  role: ProjectRole;
  grantedAt: string;
}

export interface ProjectCollaboratorRecord {
  id: string;
  projectId: string;
  projectName?: string;
  userId: string;
  email: string;
  name: string;
  role: ProjectRole;
  addedAt: string;
}

export interface OrgAuditLogRecord {
  id: string;
  orgId: string;
  actorId: string;
  actorEmail?: string;
  actorName?: string;
  action: string;
  targetType: 'member' | 'project' | 'team' | 'org' | 'invite';
  targetId?: string | null;
  details?: any;
  ipAddress?: string | null;
  createdAt: string;
}

class OrganizationService {
  private static instance: OrganizationService;

  private constructor() {}

  public static getInstance(): OrganizationService {
    if (!OrganizationService.instance) {
      OrganizationService.instance = new OrganizationService();
    }
    return OrganizationService.instance;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Organization Lifecycle & Administration
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Creates a new organization and assigns creator as Owner
   */
  public createOrganization(params: {
    name: string;
    slug?: string;
    ownerId: string;
    avatarUrl?: string;
    description?: string;
    ipAddress?: string;
  }): OrganizationRecord {
    const { name, ownerId, avatarUrl, description, ipAddress } = params;
    const db = getDb();
    const cleanSlug = (params.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'org';
    let slug = cleanSlug;
    const existing = db.prepare('SELECT id FROM organizations WHERE slug = ?').get(slug);
    if (existing) {
      slug = `${cleanSlug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    const id = `org_${uuidv4()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO organizations (id, name, slug, ownerId, avatarUrl, description, defaultMemberRole, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 'member', ?, ?)
    `).run(id, name.trim(), slug, ownerId, avatarUrl || null, description?.trim() || null, now, now);

    // Add owner to members table
    const memberId = `mem_${uuidv4()}`;
    db.prepare(`
      INSERT INTO organization_members (id, orgId, userId, role, joinedAt)
      VALUES (?, ?, ?, 'owner', ?)
    `).run(memberId, id, ownerId, now);

    this.logOrgAction({
      orgId: id,
      actorId: ownerId,
      action: 'org.created',
      targetType: 'org',
      targetId: id,
      details: { name: name.trim(), slug },
      ipAddress
    });

    return {
      id,
      name: name.trim(),
      slug,
      ownerId,
      avatarUrl: avatarUrl || null,
      description: description?.trim() || null,
      defaultMemberRole: 'member',
      createdAt: now,
      updatedAt: now,
      myRole: 'owner',
      membersCount: 1,
      teamsCount: 0,
      projectsCount: 0
    };
  }

  /**
   * List organizations for a user with comprehensive metrics
   */
  public listUserOrganizations(userId: string): OrganizationRecord[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT o.*, m.role as myRole,
        (SELECT COUNT(*) FROM organization_members WHERE orgId = o.id) as membersCount,
        (SELECT COUNT(*) FROM organization_teams WHERE orgId = o.id) as teamsCount,
        (SELECT COUNT(*) FROM projects WHERE orgId = o.id) as projectsCount,
        u.email as ownerEmail, u.name as ownerName
      FROM organizations o
      JOIN organization_members m ON o.id = m.orgId
      LEFT JOIN users u ON o.ownerId = u.id
      WHERE m.userId = ?
      ORDER BY o.createdAt DESC
    `).all(userId) as any[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerId: r.ownerId,
      ownerEmail: decryptUserField(r.ownerEmail),
      ownerName: decryptUserField(r.ownerName) || decryptUserField(r.ownerEmail),
      avatarUrl: r.avatarUrl,
      description: r.description,
      defaultMemberRole: r.defaultMemberRole || 'member',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      myRole: r.myRole,
      membersCount: Number(r.membersCount || 0),
      teamsCount: Number(r.teamsCount || 0),
      projectsCount: Number(r.projectsCount || 0)
    }));
  }

  /**
   * Get organization details with membership validation
   */
  public getOrganization(orgId: string, userId: string): { org: OrganizationRecord; myRole: OrgRole } {
    const db = getDb();
    const membership = db.prepare(`
      SELECT m.role, o.*,
        (SELECT COUNT(*) FROM organization_members WHERE orgId = o.id) as membersCount,
        (SELECT COUNT(*) FROM organization_teams WHERE orgId = o.id) as teamsCount,
        (SELECT COUNT(*) FROM projects WHERE orgId = o.id) as projectsCount,
        u.email as ownerEmail, u.name as ownerName
      FROM organization_members m
      JOIN organizations o ON m.orgId = o.id
      LEFT JOIN users u ON o.ownerId = u.id
      WHERE m.orgId = ? AND m.userId = ?
    `).get(orgId, userId) as any;

    if (!membership) {
      throw new AppError('Forbidden: You are not a member of this organization.', 403);
    }

    return {
      org: {
        id: membership.id,
        name: membership.name,
        slug: membership.slug,
        ownerId: membership.ownerId,
        ownerEmail: decryptUserField(membership.ownerEmail),
        ownerName: decryptUserField(membership.ownerName) || decryptUserField(membership.ownerEmail),
        avatarUrl: membership.avatarUrl,
        description: membership.description,
        defaultMemberRole: membership.defaultMemberRole || 'member',
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
        myRole: membership.role,
        membersCount: Number(membership.membersCount || 0),
        teamsCount: Number(membership.teamsCount || 0),
        projectsCount: Number(membership.projectsCount || 0)
      },
      myRole: membership.role
    };
  }

  /**
   * Update Organization profile and settings
   */
  public updateOrganization(orgId: string, data: { name?: string; description?: string; avatarUrl?: string; defaultMemberRole?: OrgRole }, actorId: string, ipAddress?: string): OrganizationRecord {
    const { myRole } = this.getOrganization(orgId, actorId);
    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Organization Owners and Admins can modify settings.', 403);
    }

    const db = getDb();
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
    if (!existing) throw new AppError('Organization not found', 404);

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const description = data.description !== undefined ? data.description.trim() : existing.description;
    const avatarUrl = data.avatarUrl !== undefined ? data.avatarUrl : existing.avatarUrl;
    const defaultMemberRole = data.defaultMemberRole || existing.defaultMemberRole || 'member';

    db.prepare(`
      UPDATE organizations
      SET name = ?, description = ?, avatarUrl = ?, defaultMemberRole = ?, updatedAt = ?
      WHERE id = ?
    `).run(name, description, avatarUrl, defaultMemberRole, now, orgId);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'org.updated',
      targetType: 'org',
      targetId: orgId,
      details: { name, description, defaultMemberRole },
      ipAddress
    });

    return this.getOrganization(orgId, actorId).org;
  }

  /**
   * Transfer Organization ownership to another member
   */
  public transferOwnership(orgId: string, newOwnerUserId: string, currentOwnerId: string, ipAddress?: string): boolean {
    const db = getDb();
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
    if (!org) throw new AppError('Organization not found', 404);

    if (org.ownerId !== currentOwnerId) {
      throw new AppError('Forbidden: Only the current Organization Owner can transfer ownership.', 403);
    }

    const newOwnerMember = db.prepare('SELECT * FROM organization_members WHERE orgId = ? AND userId = ?').get(orgId, newOwnerUserId) as any;
    if (!newOwnerMember) {
      throw new AppError('Target user must already be an active member of this organization.', 400);
    }

    const now = new Date().toISOString();

    // Update organizations table ownerId
    db.prepare('UPDATE organizations SET ownerId = ?, updatedAt = ? WHERE id = ?').run(newOwnerUserId, now, orgId);

    // Promote target member to 'owner'
    db.prepare("UPDATE organization_members SET role = 'owner' WHERE orgId = ? AND userId = ?").run(orgId, newOwnerUserId);

    // Demote former owner to 'admin'
    db.prepare("UPDATE organization_members SET role = 'admin' WHERE orgId = ? AND userId = ?").run(orgId, currentOwnerId);

    this.logOrgAction({
      orgId,
      actorId: currentOwnerId,
      action: 'org.ownership_transferred',
      targetType: 'org',
      targetId: orgId,
      details: { previousOwner: currentOwnerId, newOwner: newOwnerUserId },
      ipAddress
    });

    return true;
  }

  /**
   * Delete an organization and cascade delete all teams and associated org data
   */
  public deleteOrganization(orgId: string, actorId: string, ipAddress?: string): boolean {
    const db = getDb();
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
    if (!org) throw new AppError('Organization not found', 404);

    if (org.ownerId !== actorId) {
      throw new AppError('Forbidden: Only the Organization Owner can permanently delete this organization.', 403);
    }

    // Cascade delete members, teams, grants, projects
    db.prepare('DELETE FROM organization_audit_logs WHERE orgId = ?').run(orgId);
    db.prepare('DELETE FROM organization_invites WHERE orgId = ?').run(orgId);
    db.prepare('DELETE FROM organization_members WHERE orgId = ?').run(orgId);
    
    // Delete teams and their members/grants
    const teams = db.prepare('SELECT id FROM organization_teams WHERE orgId = ?').all(orgId) as { id: string }[];
    for (const t of teams) {
      db.prepare('DELETE FROM project_team_grants WHERE teamId = ?').run(t.id);
      db.prepare('DELETE FROM organization_team_members WHERE teamId = ?').run(t.id);
    }
    db.prepare('DELETE FROM organization_teams WHERE orgId = ?').run(orgId);

    // Detach or delete projects
    db.prepare('DELETE FROM projects WHERE orgId = ?').run(orgId);
    db.prepare('DELETE FROM organizations WHERE id = ?').run(orgId);

    return true;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Organization Members & Invitations
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * List members of an organization
   */
  public listMembers(orgId: string, userId: string): OrgMemberRecord[] {
    this.getOrganization(orgId, userId); // verify membership
    const db = getDb();
    const rows = db.prepare(`
      SELECT m.id, m.orgId, m.userId, m.role, m.joinedAt, u.email, u.name
      FROM organization_members m
      JOIN users u ON m.userId = u.id
      WHERE m.orgId = ?
      ORDER BY 
        CASE m.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'member' THEN 3
          WHEN 'billing_manager' THEN 4
          ELSE 5
        END,
        m.joinedAt ASC
    `).all(orgId) as any[];

    return rows.map(r => ({
      id: r.id,
      orgId: r.orgId,
      userId: r.userId,
      email: decryptUserField(r.email),
      name: decryptUserField(r.name) || decryptUserField(r.email),
      role: r.role,
      joinedAt: r.joinedAt
    }));
  }

  /**
   * Update a member's organization role
   */
  public updateMemberRole(orgId: string, targetUserId: string, newRole: OrgRole, actorId: string, ipAddress?: string): boolean {
    const { myRole } = this.getOrganization(orgId, actorId);
    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Owners and Admins can modify member roles.', 403);
    }

    const db = getDb();
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
    if (targetUserId === org.ownerId) {
      throw new AppError('Cannot alter role of the Organization Owner. Transfer ownership first.', 400);
    }

    if (myRole === 'admin' && newRole === 'owner') {
      throw new AppError('Forbidden: Admins cannot promote members to Owner.', 403);
    }

    db.prepare('UPDATE organization_members SET role = ? WHERE orgId = ? AND userId = ?').run(newRole, orgId, targetUserId);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'member.role_updated',
      targetType: 'member',
      targetId: targetUserId,
      details: { newRole },
      ipAddress
    });

    return true;
  }

  /**
   * Create an invitation for a new team member
   */
  public createInvite(params: {
    orgId: string;
    actorUserId: string;
    invitedEmail: string;
    role: OrgRole;
    ttlDays?: number;
    ipAddress?: string;
  }): OrgInviteRecord {
    const { orgId, actorUserId, invitedEmail, role, ttlDays = 7, ipAddress } = params;
    const { myRole } = this.getOrganization(orgId, actorUserId);

    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Organization Owners and Admins can invite new members.', 403);
    }

    const cleanEmail = invitedEmail.trim().toLowerCase();
    const emailHash = crypto.createHash('sha256').update(cleanEmail).digest('hex');
    const db = getDb();

    // Check if user is already a member
    const existingMember = db.prepare(`
      SELECT m.id FROM organization_members m
      JOIN users u ON m.userId = u.id
      WHERE m.orgId = ? AND (u.emailHash = ? OR u.email = ?)
    `).get(orgId, emailHash, cleanEmail);

    if (existingMember) {
      throw new AppError(`User ${cleanEmail} is already a member of this organization.`, 400);
    }

    const token = `orginv_${crypto.randomBytes(24).toString('hex')}`;
    const id = `inv_${uuidv4()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 86400000).toISOString();

    db.prepare(`
      INSERT INTO organization_invites (id, orgId, invitedEmail, role, token, status, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, orgId, cleanEmail, role, token, expiresAt, now.toISOString());

    this.logOrgAction({
      orgId,
      actorId: actorUserId,
      action: 'invite.created',
      targetType: 'invite',
      targetId: id,
      details: { invitedEmail: cleanEmail, role },
      ipAddress
    });

    return {
      id,
      orgId,
      invitedEmail: cleanEmail,
      role,
      token,
      status: 'pending',
      expiresAt,
      createdAt: now.toISOString()
    };
  }

  /**
   * List pending invites for an organization
   */
  public listPendingInvites(orgId: string, userId: string): OrgInviteRecord[] {
    this.getOrganization(orgId, userId);
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM organization_invites
      WHERE orgId = ? AND status = 'pending'
      ORDER BY createdAt DESC
    `).all(orgId) as any[];

    return rows;
  }

  /**
   * Revoke an invite
   */
  public revokeInvite(orgId: string, inviteId: string, actorId: string, ipAddress?: string): boolean {
    const { myRole } = this.getOrganization(orgId, actorId);
    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Insufficient privileges.', 403);
    }

    const db = getDb();
    const info = db.prepare("UPDATE organization_invites SET status = 'revoked' WHERE id = ? AND orgId = ?").run(inviteId, orgId);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'invite.revoked',
      targetType: 'invite',
      targetId: inviteId,
      ipAddress
    });

    return info.changes > 0;
  }

  /**
   * Accept an invitation
   */
  public acceptInvite(token: string, userId: string, userEmail: string, ipAddress?: string): { orgId: string; role: OrgRole } {
    const db = getDb();
    const invite = db.prepare('SELECT * FROM organization_invites WHERE token = ?').get(token.trim()) as any;
    if (!invite) throw new AppError('Invitation not found.', 404);
    if (invite.status !== 'pending') throw new AppError('Invitation is no longer valid.', 400);
    if (new Date(invite.expiresAt) < new Date()) throw new AppError('Invitation has expired.', 400);

    const now = new Date().toISOString();
    const memberId = `mem_${uuidv4()}`;

    // Add membership
    db.prepare(`
      INSERT OR REPLACE INTO organization_members (id, orgId, userId, role, joinedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(memberId, invite.orgId, userId, invite.role, now);

    // Mark invite accepted
    db.prepare("UPDATE organization_invites SET status = 'accepted' WHERE id = ?").run(invite.id);

    this.logOrgAction({
      orgId: invite.orgId,
      actorId: userId,
      action: 'invite.accepted',
      targetType: 'member',
      targetId: userId,
      details: { email: userEmail, role: invite.role },
      ipAddress
    });

    return { orgId: invite.orgId, role: invite.role };
  }

  /**
   * Remove member or leave organization
   */
  public removeMember(orgId: string, actorUserId: string, targetUserId: string, ipAddress?: string): boolean {
    const db = getDb();
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
    if (!org) throw new AppError('Organization not found', 404);

    const actor = db.prepare('SELECT role FROM organization_members WHERE orgId = ? AND userId = ?').get(orgId, actorUserId) as any;
    if (!actor) throw new AppError('Forbidden', 403);

    // Target is owner check
    if (targetUserId === org.ownerId) {
      throw new AppError('The Organization Owner cannot be removed. Transfer ownership first.', 400);
    }

    // Permission check: actor must be self, owner, or admin
    if (actorUserId !== targetUserId && actor.role !== 'owner' && actor.role !== 'admin') {
      throw new AppError('Forbidden: Insufficient privileges to remove team member.', 403);
    }

    // Remove from team memberships as well
    const teams = db.prepare('SELECT id FROM organization_teams WHERE orgId = ?').all(orgId) as { id: string }[];
    for (const t of teams) {
      db.prepare('DELETE FROM organization_team_members WHERE teamId = ? AND userId = ?').run(t.id, targetUserId);
    }

    const info = db.prepare('DELETE FROM organization_members WHERE orgId = ? AND userId = ?').run(orgId, targetUserId);

    this.logOrgAction({
      orgId,
      actorId: actorUserId,
      action: actorUserId === targetUserId ? 'member.left' : 'member.removed',
      targetType: 'member',
      targetId: targetUserId,
      ipAddress
    });

    return info.changes > 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Organization Teams (e.g. @org/backend, @org/frontend)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create an Organization Team
   */
  public createTeam(params: {
    orgId: string;
    name: string;
    slug?: string;
    description?: string;
    actorId: string;
    ipAddress?: string;
  }): OrgTeamRecord {
    const { orgId, name, description, actorId, ipAddress } = params;
    const { myRole } = this.getOrganization(orgId, actorId);

    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Organization Owners and Admins can create teams.', 403);
    }

    if (!name || !name.trim()) throw new AppError('Team name is required.', 400);

    const db = getDb();
    const cleanSlug = (params.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'team';
    let slug = cleanSlug;
    const existing = db.prepare('SELECT id FROM organization_teams WHERE orgId = ? AND slug = ?').get(orgId, slug);
    if (existing) {
      slug = `${cleanSlug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const id = `team_${uuidv4()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO organization_teams (id, orgId, name, slug, description, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgId, name.trim(), slug, description?.trim() || null, now, now);

    // Auto-add creator as team maintainer
    const tmemId = `tmem_${uuidv4()}`;
    db.prepare(`
      INSERT INTO organization_team_members (id, teamId, userId, role, addedAt)
      VALUES (?, ?, ?, 'maintainer', ?)
    `).run(tmemId, id, actorId, now);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'team.created',
      targetType: 'team',
      targetId: id,
      details: { name: name.trim(), slug },
      ipAddress
    });

    return {
      id,
      orgId,
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      membersCount: 1,
      memberCount: 1,
      projectsCount: 0,
      projectGrantCount: 0,
      createdAt: now,
      updatedAt: now,
      myTeamRole: 'maintainer'
    };
  }

  /**
   * List all teams in an organization
   */
  public listTeams(orgId: string, userId: string): OrgTeamRecord[] {
    this.getOrganization(orgId, userId);
    const db = getDb();

    const rows = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM organization_team_members WHERE teamId = t.id) as membersCount,
        (SELECT COUNT(*) FROM project_team_grants WHERE teamId = t.id) as projectsCount,
        tm.role as myTeamRole
      FROM organization_teams t
      LEFT JOIN organization_team_members tm ON t.id = tm.teamId AND tm.userId = ?
      WHERE t.orgId = ?
      ORDER BY t.name ASC
    `).all(userId, orgId) as any[];

    return rows.map(r => ({
      id: r.id,
      orgId: r.orgId,
      name: r.name,
      slug: r.slug,
      description: r.description,
      membersCount: Number(r.membersCount || 0),
      memberCount: Number(r.membersCount || 0),
      projectsCount: Number(r.projectsCount || 0),
      projectGrantCount: Number(r.projectsCount || 0),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      myTeamRole: r.myTeamRole || null
    }));
  }

  /**
   * Get team details with member roster and project grants
   */
  public getTeam(orgId: string, teamId: string, userId: string): {
    team: OrgTeamRecord;
    members: OrgTeamMemberRecord[];
    projectGrants: ProjectTeamGrantRecord[];
  } {
    this.getOrganization(orgId, userId);
    const db = getDb();

    const team = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM organization_team_members WHERE teamId = t.id) as membersCount,
        (SELECT COUNT(*) FROM project_team_grants WHERE teamId = t.id) as projectsCount,
        tm.role as myTeamRole
      FROM organization_teams t
      LEFT JOIN organization_team_members tm ON t.id = tm.teamId AND tm.userId = ?
      WHERE t.orgId = ? AND t.id = ?
    `).get(userId, orgId, teamId) as any;

    if (!team) throw new AppError('Team not found', 404);

    const members = (db.prepare(`
      SELECT tm.id, tm.teamId, tm.userId, tm.role, tm.addedAt, u.email, u.name
      FROM organization_team_members tm
      JOIN users u ON tm.userId = u.id
      WHERE tm.teamId = ?
      ORDER BY tm.addedAt ASC
    `).all(teamId) as any[]).map(m => ({
      ...m,
      email: decryptUserField(m.email),
      name: decryptUserField(m.name) || decryptUserField(m.email)
    }));

    const projectGrants = db.prepare(`
      SELECT ptg.id, ptg.projectId, ptg.teamId, ptg.role, ptg.grantedAt, p.name as projectName
      FROM project_team_grants ptg
      JOIN projects p ON ptg.projectId = p.id
      WHERE ptg.teamId = ?
      ORDER BY ptg.grantedAt DESC
    `).all(teamId) as any[];

    return {
      team: {
        id: team.id,
        orgId: team.orgId,
        name: team.name,
        slug: team.slug,
        description: team.description,
        membersCount: Number(team.membersCount || 0),
        memberCount: Number(team.membersCount || 0),
        projectsCount: Number(team.projectsCount || 0),
        projectGrantCount: Number(team.projectsCount || 0),
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
        myTeamRole: team.myTeamRole || null
      },
      members,
      projectGrants
    };
  }

  /**
   * Update team name or description
   */
  public updateTeam(orgId: string, teamId: string, data: { name?: string; description?: string }, actorId: string, ipAddress?: string): boolean {
    const { myRole } = this.getOrganization(orgId, actorId);
    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Owners and Admins can update teams.', 403);
    }

    const db = getDb();
    const team = db.prepare('SELECT * FROM organization_teams WHERE id = ? AND orgId = ?').get(teamId, orgId) as any;
    if (!team) throw new AppError('Team not found', 404);

    const name = data.name !== undefined ? data.name.trim() : team.name;
    const description = data.description !== undefined ? data.description.trim() : team.description;
    const now = new Date().toISOString();

    db.prepare('UPDATE organization_teams SET name = ?, description = ?, updatedAt = ? WHERE id = ?').run(name, description, now, teamId);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'team.updated',
      targetType: 'team',
      targetId: teamId,
      details: { name, description },
      ipAddress
    });

    return true;
  }

  /**
   * Delete a team and its project grants
   */
  public deleteTeam(orgId: string, teamId: string, actorId: string, ipAddress?: string): boolean {
    const { myRole } = this.getOrganization(orgId, actorId);
    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Owners and Admins can delete teams.', 403);
    }

    const db = getDb();
    db.prepare('DELETE FROM project_team_grants WHERE teamId = ?').run(teamId);
    db.prepare('DELETE FROM organization_team_members WHERE teamId = ?').run(teamId);
    const info = db.prepare('DELETE FROM organization_teams WHERE id = ? AND orgId = ?').run(teamId, orgId);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'team.deleted',
      targetType: 'team',
      targetId: teamId,
      ipAddress
    });

    return info.changes > 0;
  }

  /**
   * Add a member to a team
   */
  public addTeamMember(params: {
    orgId: string;
    teamId: string;
    userId: string;
    role?: 'maintainer' | 'member';
    actorId: string;
    ipAddress?: string;
  }): boolean {
    const { orgId, teamId, userId, role = 'member', actorId, ipAddress } = params;
    const { myRole } = this.getOrganization(orgId, actorId);

    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Owners and Admins can manage team members.', 403);
    }

    const db = getDb();
    // Validate target is org member
    const isOrgMember = db.prepare('SELECT id FROM organization_members WHERE orgId = ? AND userId = ?').get(orgId, userId);
    if (!isOrgMember) {
      throw new AppError('User must first be a member of the organization before joining a team.', 400);
    }

    const id = `tmem_${uuidv4()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO organization_team_members (id, teamId, userId, role, addedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, teamId, userId, role, now);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'team.member_added',
      targetType: 'team',
      targetId: teamId,
      details: { userId, role },
      ipAddress
    });

    return true;
  }

  /**
   * Remove a member from a team
   */
  public removeTeamMember(orgId: string, teamId: string, userId: string, actorId: string, ipAddress?: string): boolean {
    const { myRole } = this.getOrganization(orgId, actorId);
    if (myRole !== 'owner' && myRole !== 'admin' && actorId !== userId) {
      throw new AppError('Forbidden: Insufficient privileges.', 403);
    }

    const db = getDb();
    const info = db.prepare('DELETE FROM organization_team_members WHERE teamId = ? AND userId = ?').run(teamId, userId);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'team.member_removed',
      targetType: 'team',
      targetId: teamId,
      details: { userId },
      ipAddress
    });

    return info.changes > 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Project Team Grants & Direct Collaborators
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Grant a Team access to an Organization Project with a specific role
   */
  public grantTeamProjectAccess(params: {
    orgId: string;
    teamId: string;
    projectId: string;
    role: ProjectRole;
    actorId: string;
    ipAddress?: string;
  }): ProjectTeamGrantRecord {
    const { orgId, teamId, projectId, role, actorId, ipAddress } = params;
    const { myRole } = this.getOrganization(orgId, actorId);

    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Only Owners and Admins can configure project permissions.', 403);
    }

    const db = getDb();
    const project = db.prepare('SELECT id, name, orgId FROM projects WHERE id = ?').get(projectId) as any;
    if (!project || project.orgId !== orgId) {
      throw new AppError('Project does not belong to this organization.', 400);
    }

    const team = db.prepare('SELECT id, name, slug FROM organization_teams WHERE id = ? AND orgId = ?').get(teamId, orgId) as any;
    if (!team) throw new AppError('Team does not belong to this organization.', 400);

    const id = `ptg_${uuidv4()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO project_team_grants (id, projectId, teamId, role, grantedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, projectId, teamId, role, now);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'project.team_granted',
      targetType: 'project',
      targetId: projectId,
      details: { teamId, teamName: team.name, role },
      ipAddress
    });

    return {
      id,
      projectId,
      projectName: project.name,
      teamId,
      teamName: team.name,
      teamSlug: team.slug,
      role,
      grantedAt: now
    };
  }

  /**
   * Revoke a Team's project grant
   */
  public revokeTeamProjectAccess(orgId: string, teamId: string, projectId: string, actorId: string, ipAddress?: string): boolean {
    const { myRole } = this.getOrganization(orgId, actorId);
    if (myRole !== 'owner' && myRole !== 'admin') {
      throw new AppError('Forbidden: Insufficient privileges.', 403);
    }

    const db = getDb();
    const info = db.prepare('DELETE FROM project_team_grants WHERE teamId = ? AND projectId = ?').run(teamId, projectId);

    this.logOrgAction({
      orgId,
      actorId,
      action: 'project.team_revoked',
      targetType: 'project',
      targetId: projectId,
      details: { teamId },
      ipAddress
    });

    return info.changes > 0;
  }

  /**
   * List all direct collaborators and team grants for a project
   */
  public listProjectAccess(projectId: string, userId: string): {
    collaborators: ProjectCollaboratorRecord[];
    teams: ProjectTeamGrantRecord[];
    directMembers: ProjectCollaboratorRecord[];
    teamGrants: ProjectTeamGrantRecord[];
    myEffectiveRole: ProjectRole | null;
  } {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) throw new AppError('Project not found', 404);

    const myEffectiveRole = this.getEffectiveProjectRole(userId, projectId);
    if (!myEffectiveRole) {
      throw new AppError('Forbidden: You do not have access to this project.', 403);
    }

    const collaborators = (db.prepare(`
      SELECT pm.id, pm.projectId, pm.userId, pm.role, pm.addedAt, u.email, u.name, p.name as projectName
      FROM project_members pm
      JOIN users u ON pm.userId = u.id
      JOIN projects p ON pm.projectId = p.id
      WHERE pm.projectId = ?
      ORDER BY pm.addedAt ASC
    `).all(projectId) as any[]).map(c => ({
      ...c,
      email: decryptUserField(c.email),
      name: decryptUserField(c.name) || decryptUserField(c.email)
    }));

    const teams = db.prepare(`
      SELECT ptg.id, ptg.projectId, ptg.teamId, ptg.role, ptg.grantedAt, t.name as teamName, t.slug as teamSlug, p.name as projectName
      FROM project_team_grants ptg
      JOIN organization_teams t ON ptg.teamId = t.id
      JOIN projects p ON ptg.projectId = p.id
      WHERE ptg.projectId = ?
      ORDER BY ptg.grantedAt ASC
    `).all(projectId) as any[];

    return {
      collaborators,
      teams,
      directMembers: collaborators,
      teamGrants: teams,
      myEffectiveRole
    };
  }

  /**
   * Add a direct individual collaborator to a project
   */
  public addProjectCollaborator(params: {
    projectId: string;
    userId: string;
    role: ProjectRole;
    actorId: string;
    ipAddress?: string;
  }): ProjectCollaboratorRecord {
    const { projectId, userId, role, actorId, ipAddress } = params;
    const callerRole = this.getEffectiveProjectRole(actorId, projectId);
    if (callerRole !== 'admin') {
      throw new AppError('Forbidden: Only Project Admins can manage direct collaborators.', 403);
    }

    const db = getDb();
    const project = db.prepare('SELECT id, name, orgId FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) throw new AppError('Project not found', 404);

    let user: any = null;
    if (userId.includes('@')) {
      const emailHash = crypto.createHash('sha256').update(userId.toLowerCase().trim()).digest('hex');
      user = db.prepare('SELECT id, email, name FROM users WHERE emailHash = ? OR email = ?').get(emailHash, userId.toLowerCase().trim());
    } else {
      user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId);
    }
    if (!user) throw new AppError('User not found with provided ID or email', 404);

    const actualUserId = user.id;
    const id = `pmem_${uuidv4()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO project_members (id, projectId, userId, role, addedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, projectId, actualUserId, role, now);

    if (project.orgId) {
      this.logOrgAction({
        orgId: project.orgId,
        actorId,
        action: 'project.collaborator_added',
        targetType: 'project',
        targetId: projectId,
        details: { collaboratorId: actualUserId, role },
        ipAddress
      });
    }

    return {
      id,
      projectId,
      projectName: project.name,
      userId: actualUserId,
      email: decryptUserField(user.email),
      name: decryptUserField(user.name) || decryptUserField(user.email),
      role,
      addedAt: now
    };
  }

  /**
   * Remove a direct collaborator from a project
   */
  public removeProjectCollaborator(projectId: string, targetUserId: string, actorId: string, ipAddress?: string): boolean {
    const callerRole = this.getEffectiveProjectRole(actorId, projectId);
    if (callerRole !== 'admin' && actorId !== targetUserId) {
      throw new AppError('Forbidden: Insufficient privileges.', 403);
    }

    const db = getDb();
    const project = db.prepare('SELECT id, orgId FROM projects WHERE id = ?').get(projectId) as any;
    const info = db.prepare('DELETE FROM project_members WHERE projectId = ? AND userId = ?').run(projectId, targetUserId);

    if (project?.orgId) {
      this.logOrgAction({
        orgId: project.orgId,
        actorId,
        action: 'project.collaborator_removed',
        targetType: 'project',
        targetId: projectId,
        details: { targetUserId },
        ipAddress
      });
    }

    return info.changes > 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Effective Permission Resolver (Zero-Trust Project Access)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Computes the highest effective project role for a user across:
   * 1. Personal ownership
   * 2. Org Owner / Admin role (inherited Admin)
   * 3. Direct Project Collaborator
   * 4. Team-to-Project Role Grants
   */
  public getEffectiveProjectRole(userId: string, projectId: string): ProjectRole | null {
    const db = getDb();
    const user = db.prepare('SELECT isSuperAdmin FROM users WHERE id = ?').get(userId) as any;
    if (user?.isSuperAdmin) return 'admin';

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return null;

    // 1. Personal Workspace project check
    if (!project.orgId && project.ownerId === userId) {
      return 'admin';
    }

    // 2. Organization context check
    if (project.orgId) {
      const orgMember = db.prepare('SELECT role FROM organization_members WHERE orgId = ? AND userId = ?').get(project.orgId, userId) as any;
      if (orgMember) {
        if (orgMember.role === 'owner' || orgMember.role === 'admin') {
          return 'admin';
        }
      }
    }

    // Role hierarchy ranking helper
    const roleRank: Record<ProjectRole, number> = {
      admin: 4,
      maintainer: 3,
      developer: 2,
      viewer: 1
    };

    let highestRank = 0;
    let highestRole: ProjectRole | null = null;

    // 3. Direct Project Collaborator check
    const directMember = db.prepare('SELECT role FROM project_members WHERE projectId = ? AND userId = ?').get(projectId, userId) as any;
    if (directMember && roleRank[directMember.role as ProjectRole]) {
      const rank = roleRank[directMember.role as ProjectRole];
      if (rank > highestRank) {
        highestRank = rank;
        highestRole = directMember.role as ProjectRole;
      }
    }

    // 4. Team Project Grants check
    if (project.orgId) {
      const teamGrants = db.prepare(`
        SELECT ptg.role
        FROM project_team_grants ptg
        JOIN organization_team_members tm ON ptg.teamId = tm.teamId
        WHERE ptg.projectId = ? AND tm.userId = ?
      `).all(projectId, userId) as { role: ProjectRole }[];

      for (const grant of teamGrants) {
        const rank = roleRank[grant.role];
        if (rank && rank > highestRank) {
          highestRank = rank;
          highestRole = grant.role;
        }
      }
    }

    return highestRole;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Organization Audit Logging
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Append an immutable record to the organization audit log
   */
  public logOrgAction(params: {
    orgId: string;
    actorId: string;
    action: string;
    targetType: 'member' | 'project' | 'team' | 'org' | 'invite';
    targetId?: string | null;
    details?: any;
    ipAddress?: string | null;
  }): void {
    try {
      const db = getDb();
      const id = `oaudit_${uuidv4()}`;
      const now = new Date().toISOString();
      const detailsStr = params.details ? JSON.stringify(params.details) : null;

      db.prepare(`
        INSERT INTO organization_audit_logs (id, orgId, actorId, action, targetType, targetId, details, ipAddress, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, params.orgId, params.actorId, params.action, params.targetType, params.targetId || null, detailsStr, params.ipAddress || null, now);
    } catch (_) {}
  }

  /**
   * List audit logs for an organization
   */
  public listOrgAuditLogs(orgId: string, userId: string, limit: number = 50): OrgAuditLogRecord[] {
    this.getOrganization(orgId, userId);
    const db = getDb();

    const rows = db.prepare(`
      SELECT oal.*, u.email as actorEmail, u.name as actorName
      FROM organization_audit_logs oal
      LEFT JOIN users u ON oal.actorId = u.id
      WHERE oal.orgId = ?
      ORDER BY oal.createdAt DESC
      LIMIT ?
    `).all(orgId, Math.min(100, Math.max(1, limit))) as any[];

    return rows.map(r => ({
      id: r.id,
      orgId: r.orgId,
      actorId: r.actorId,
      actorEmail: decryptUserField(r.actorEmail),
      actorName: decryptUserField(r.actorName) || decryptUserField(r.actorEmail),
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      details: r.details ? JSON.parse(r.details) : null,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt
    }));
  }
}

export const organizationService = OrganizationService.getInstance();
