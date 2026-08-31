// ─────────────────────────────────────────────────────────────────────────────
//  src/routes/organization.routes.ts
//  HTTP Router for Organizations, Teams, RBAC & Project Access Grants
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { organizationService, OrgRole, ProjectRole } from '../services/organization.service';
import { notificationService } from '../services/notification.service';
import { networkAccessService } from '../services/network-access.service';
import { AppError } from '../types/auth.types';
import { getDb } from '../db/sqlite.connection';

const router = Router();

// Protect all organization routes with JWT auth
router.use(authenticateJwt);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Organization Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

// List user's organizations
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const orgs = organizationService.listUserOrganizations(userId);
    res.status(200).json({
      success: true,
      message: 'Organizations retrieved.',
      data: orgs
    });
  } catch (err) { next(err); }
});

// Create organization
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { name, slug, avatarUrl, description } = req.body;
    const ipAddress = networkAccessService.extractClientIp(req);
    const org = organizationService.createOrganization({ name, slug, ownerId: userId, avatarUrl, description, ipAddress });

    res.status(201).json({
      success: true,
      message: 'Organization created successfully.',
      data: org
    });
  } catch (err) { next(err); }
});

// Get organization details
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const { org, myRole } = organizationService.getOrganization(id, userId);
    const members = organizationService.listMembers(id, userId);

    res.status(200).json({
      success: true,
      message: 'Organization details retrieved.',
      data: {
        ...org,
        myRole,
        members
      }
    });
  } catch (err) { next(err); }
});

// Update organization settings
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    const updated = organizationService.updateOrganization(id, req.body, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Organization updated.',
      data: updated
    });
  } catch (err) { next(err); }
});

// Transfer organization ownership
router.post('/:id/transfer-ownership', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const { newOwnerUserId } = req.body;
    if (!newOwnerUserId) throw new AppError('newOwnerUserId is required', 400);

    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.transferOwnership(id, newOwnerUserId, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Organization ownership transferred successfully.',
      data: null
    });
  } catch (err) { next(err); }
});

// Delete organization
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.deleteOrganization(id, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Organization permanently deleted.',
      data: null
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Members & Role Management
// ─────────────────────────────────────────────────────────────────────────────

// List members
router.get('/:id/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const members = organizationService.listMembers(id, userId);

    res.status(200).json({
      success: true,
      message: 'Members retrieved.',
      data: members
    });
  } catch (err) { next(err); }
});

// Update member role
router.patch('/:id/members/:targetUserId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, targetUserId } = req.params;
    const { role } = req.body;
    if (!role) throw new AppError('role is required', 400);

    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.updateMemberRole(id, targetUserId, role as OrgRole, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Member role updated successfully.',
      data: null
    });
  } catch (err) { next(err); }
});

// Remove member / Leave organization
router.delete('/:id/members/:targetUserId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, targetUserId } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.removeMember(id, userId, targetUserId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Member removed or left organization successfully.',
      data: null
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Invitations
// ─────────────────────────────────────────────────────────────────────────────

// List pending invites
router.get('/:id/invites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const invites = organizationService.listPendingInvites(id, userId);

    res.status(200).json({
      success: true,
      message: 'Pending invitations retrieved.',
      data: invites
    });
  } catch (err) { next(err); }
});

// Create invite
router.post('/:id/invites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const { email, role, ttlDays } = req.body;
    if (!email) throw new AppError('Invited email is required.', 400);

    const ipAddress = networkAccessService.extractClientIp(req);
    const invite = organizationService.createInvite({
      orgId: id,
      actorUserId: userId,
      invitedEmail: email,
      role: (role as OrgRole) || 'member',
      ttlDays: ttlDays ? Number(ttlDays) : 7,
      ipAddress
    });

    // Notify invited user if account already exists
    const db = getDb();
    const invitedUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as any;
    if (invitedUser) {
      notificationService.sendNotification({
        userId: invitedUser.id,
        title: 'Team Collaboration Invite',
        message: `You were invited to join an organization with role "${invite.role}".`,
        type: 'invite',
        data: { inviteToken: invite.token, orgId: id }
      });
    }

    res.status(201).json({
      success: true,
      message: `Invitation created for ${email}.`,
      data: invite
    });
  } catch (err) { next(err); }
});

// Revoke invite
router.delete('/:id/invites/:inviteId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, inviteId } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.revokeInvite(id, inviteId, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Invitation revoked.',
      data: null
    });
  } catch (err) { next(err); }
});

// Accept invite
router.post('/invites/:token/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    const userEmail = req.user?.email || '';
    if (!userId) throw new AppError('Authentication required', 401);

    const { token } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    const result = organizationService.acceptInvite(token, userId, userEmail, ipAddress);

    notificationService.sendNotification({
      userId,
      title: 'Welcome to the Team!',
      message: `You have successfully joined the organization as a ${result.role}.`,
      type: 'success',
      data: { orgId: result.orgId }
    });

    res.status(200).json({
      success: true,
      message: 'Invitation accepted successfully.',
      data: result
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Teams & Project Grants
// ─────────────────────────────────────────────────────────────────────────────

// List teams in an org
router.get('/:id/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const teams = organizationService.listTeams(id, userId);

    res.status(200).json({
      success: true,
      message: 'Teams retrieved.',
      data: teams
    });
  } catch (err) { next(err); }
});

// Create team
router.post('/:id/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const { name, slug, description } = req.body;
    const ipAddress = networkAccessService.extractClientIp(req);

    const team = organizationService.createTeam({
      orgId: id,
      name,
      slug,
      description,
      actorId: userId,
      ipAddress
    });

    res.status(201).json({
      success: true,
      message: 'Team created successfully.',
      data: team
    });
  } catch (err) { next(err); }
});

// Get team details
router.get('/:id/teams/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, teamId } = req.params;
    const data = organizationService.getTeam(id, teamId, userId);

    res.status(200).json({
      success: true,
      message: 'Team details retrieved.',
      data
    });
  } catch (err) { next(err); }
});

// Update team
router.patch('/:id/teams/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, teamId } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.updateTeam(id, teamId, req.body, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Team updated successfully.',
      data: null
    });
  } catch (err) { next(err); }
});

// Delete team
router.delete('/:id/teams/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, teamId } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.deleteTeam(id, teamId, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Team deleted successfully.',
      data: null
    });
  } catch (err) { next(err); }
});

// Add member to team
router.post('/:id/teams/:teamId/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, teamId } = req.params;
    const { targetUserId, role } = req.body;
    if (!targetUserId) throw new AppError('targetUserId is required', 400);

    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.addTeamMember({
      orgId: id,
      teamId,
      userId: targetUserId,
      role: role || 'member',
      actorId: userId,
      ipAddress
    });

    res.status(201).json({
      success: true,
      message: 'Member added to team.',
      data: null
    });
  } catch (err) { next(err); }
});

// Remove member from team
router.delete('/:id/teams/:teamId/members/:memberUserId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, teamId, memberUserId } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.removeTeamMember(id, teamId, memberUserId, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Member removed from team.',
      data: null
    });
  } catch (err) { next(err); }
});

// Grant team access to a project
router.post('/:id/teams/:teamId/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, teamId } = req.params;
    const { projectId, role } = req.body;
    if (!projectId || !role) throw new AppError('projectId and role are required', 400);

    const ipAddress = networkAccessService.extractClientIp(req);
    const grant = organizationService.grantTeamProjectAccess({
      orgId: id,
      teamId,
      projectId,
      role: role as ProjectRole,
      actorId: userId,
      ipAddress
    });

    res.status(201).json({
      success: true,
      message: 'Project access granted to team.',
      data: grant
    });
  } catch (err) { next(err); }
});

// Revoke team project access
router.delete('/:id/teams/:teamId/projects/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id, teamId, projectId } = req.params;
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.revokeTeamProjectAccess(id, teamId, projectId, userId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Team project access revoked.',
      data: null
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Organization Audit Logs
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const logs = organizationService.listOrgAuditLogs(id, userId, limit);

    res.status(200).json({
      success: true,
      message: 'Audit logs retrieved.',
      data: logs
    });
  } catch (err) { next(err); }
});

export default router;
