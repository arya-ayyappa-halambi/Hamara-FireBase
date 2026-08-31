// ─────────────────────────────────────────────────────────────────────────────
//  tests/organizations.test.ts
//  Comprehensive Test Suite for GitHub-Grade Organizations, Teams, RBAC & Isolation
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { organizationService } from '../src/services/organization.service';
import { projectService } from '../src/project/project.service';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runOrgTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Comprehensive GitHub-Grade Organization Architecture Tests');
  console.log('================================================================\n');

  initSqlite();

  const db = getDb();
  const testUser = db.prepare('SELECT id, email FROM users LIMIT 1').get() as any;
  const ownerId = testUser.id;

  // Create two extra test users for RBAC testing
  const aliceId = `usr_${uuidv4()}`;
  const aliceEmail = `alice_${Date.now()}@aegisdb.dev`;
  const aliceHash = crypto.createHash('sha256').update(aliceEmail).digest('hex');
  db.prepare(`
    INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, 'Alice Developer', 'fake_pass', 0, ?, ?)
  `).run(aliceId, aliceEmail, aliceHash, new Date().toISOString(), new Date().toISOString());

  const bobId = `usr_${uuidv4()}`;
  const bobEmail = `bob_${Date.now()}@aegisdb.dev`;
  const bobHash = crypto.createHash('sha256').update(bobEmail).digest('hex');
  db.prepare(`
    INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, 'Bob Engineer', 'fake_pass', 0, ?, ?)
  `).run(bobId, bobEmail, bobHash, new Date().toISOString(), new Date().toISOString());

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 1: Organization Creation & Custom Slugs
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Organization Creation & Custom Slugs ---');
  const orgSlug = `robotics-${Date.now().toString().slice(-4)}`;
  const org = organizationService.createOrganization({
    name: 'Acme Cloud Robotics',
    slug: orgSlug,
    description: 'Autonomous robotics and cloud teleoperation',
    ownerId,
    ipAddress: '192.168.1.100'
  });

  assert(org.id.startsWith('org_'), 'Organization ID starts with org_ prefix');
  assert(org.name === 'Acme Cloud Robotics', 'Organization name preserved');
  assert(org.slug === orgSlug, 'Custom slug preserved');
  assert(org.ownerId === ownerId, 'Owner set correctly');
  assert(org.myRole === 'owner', 'Creator assigned Owner role');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 2: Personal vs Org Project Creation & Workspace Isolation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Workspace Project Isolation ---');
  // Personal project
  const personalProj = projectService.createProject(ownerId, 'My Secret Side Project');
  assert(personalProj.project.orgId === null, 'Personal project has null orgId');
  assert(personalProj.project.ownerId === ownerId, 'Personal project owned by user');

  // Org project
  const orgProj = projectService.createProject(ownerId, 'Fleet Mission Control', org.id);
  assert(orgProj.project.orgId === org.id, 'Org project has correct orgId');

  // List Personal workspace
  const personalList = projectService.listProjects(ownerId, null);
  assert(personalList.some(p => p.id === personalProj.project.id), 'Personal project listed in personal workspace');
  assert(!personalList.some(p => p.id === orgProj.project.id), 'Org project hidden from personal workspace list');

  // List Org workspace
  const orgList = projectService.listProjects(ownerId, org.id);
  assert(orgList.some(p => p.id === orgProj.project.id), 'Org project listed in org workspace');
  assert(!orgList.some(p => p.id === personalProj.project.id), 'Personal project hidden from org workspace list');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 3: Team Invitations & Role Assignment
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Organization Invitations & Acceptance ---');
  const invite = organizationService.createInvite({
    orgId: org.id,
    actorUserId: ownerId,
    invitedEmail: aliceEmail,
    role: 'member',
    ttlDays: 7,
    ipAddress: '192.168.1.100'
  });

  assert(invite.token.startsWith('orginv_'), 'Invite token generated');
  assert(invite.role === 'member', 'Assigned role is member');

  const acceptResult = organizationService.acceptInvite(invite.token, aliceId, aliceEmail, '192.168.1.101');
  assert(acceptResult.orgId === org.id, 'Alice joined correct org');
  assert(acceptResult.role === 'member', 'Alice joined as member');

  const members = organizationService.listMembers(org.id, ownerId);
  assert(members.length === 2, 'Org now has 2 members (Owner + Alice)');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 4: Member Role Modification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Update Member Role ---');
  organizationService.updateMemberRole(org.id, aliceId, 'admin', ownerId, '192.168.1.100');
  const updatedMembers = organizationService.listMembers(org.id, ownerId);
  const aliceMember = updatedMembers.find(m => m.userId === aliceId);
  assert(aliceMember?.role === 'admin', 'Alice role promoted to Admin');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 5: Functional Teams & Membership
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Functional Teams Management ---');
  const team = organizationService.createTeam({
    orgId: org.id,
    name: 'Backend Core',
    slug: 'backend-core',
    description: 'API & Infrastructure team',
    actorId: ownerId,
    ipAddress: '192.168.1.100'
  });

  assert(team.id.startsWith('team_'), 'Team ID starts with team_ prefix');
  assert(team.slug === 'backend-core', 'Team slug preserved');

  // Add Bob to Org and then to Team
  const bobInvite = organizationService.createInvite({
    orgId: org.id,
    actorUserId: ownerId,
    invitedEmail: bobEmail,
    role: 'member'
  });
  organizationService.acceptInvite(bobInvite.token, bobId, bobEmail);

  organizationService.addTeamMember({
    orgId: org.id,
    teamId: team.id,
    userId: bobId,
    role: 'member',
    actorId: ownerId,
    ipAddress: '192.168.1.100'
  });

  const teamDetails = organizationService.getTeam(org.id, team.id, ownerId);
  assert(teamDetails.team.memberCount === 2, 'Team member count is 2 (creator + Bob)');
  assert(teamDetails.members.some(m => m.userId === bobId), 'Bob is in the team roster');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 6: Project Team Grants & Effective Permissions
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Team Project Access Grants & Effective Permissions ---');
  // Before grant: Bob has no access to orgProj
  let bobRoleBefore = organizationService.getEffectiveProjectRole(bobId, orgProj.project.id);
  assert(bobRoleBefore === null, 'Bob has NO effective role on project before grant');

  // Grant 'developer' access to the Backend team on orgProj
  organizationService.grantTeamProjectAccess({
    orgId: org.id,
    teamId: team.id,
    projectId: orgProj.project.id,
    role: 'developer',
    actorId: ownerId,
    ipAddress: '192.168.1.100'
  });

  // After grant: Bob gets 'developer' role via team membership
  let bobRoleAfter = organizationService.getEffectiveProjectRole(bobId, orgProj.project.id);
  assert(bobRoleAfter === 'developer', 'Bob inherits "developer" role via team grant');

  // Org Admin (Alice) automatically inherits 'admin' on all org projects
  let aliceEffectiveRole = organizationService.getEffectiveProjectRole(aliceId, orgProj.project.id);
  assert(aliceEffectiveRole === 'admin', 'Org Admin (Alice) automatically inherits "admin" role');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 7: Direct Project Collaborators Override
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Direct Project Collaborator Overrides ---');
  // Upgrade Bob directly to 'maintainer' on orgProj
  organizationService.addProjectCollaborator({
    projectId: orgProj.project.id,
    userId: bobId,
    role: 'maintainer',
    actorId: ownerId,
    ipAddress: '192.168.1.100'
  });

  let bobRoleDirect = organizationService.getEffectiveProjectRole(bobId, orgProj.project.id);
  assert(bobRoleDirect === 'maintainer', 'Bob upgraded to "maintainer" via direct project collaborator grant (higher than team role)');

  // List project access
  const projAccess = organizationService.listProjectAccess(orgProj.project.id, ownerId);
  assert(projAccess.directMembers.some(d => d.userId === bobId && d.role === 'maintainer'), 'Direct collaborator listed in project access');
  assert(projAccess.teamGrants.some(t => t.teamId === team.id && t.role === 'developer'), 'Team grant listed in project access');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 8: Revocation of Grants
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Access Revocation ---');
  // Remove direct collaborator
  organizationService.removeProjectCollaborator(orgProj.project.id, bobId, ownerId);
  let bobRoleAfterDirectRemoval = organizationService.getEffectiveProjectRole(bobId, orgProj.project.id);
  assert(bobRoleAfterDirectRemoval === 'developer', 'Bob falls back to team role "developer" after direct removal');

  // Revoke team project grant
  organizationService.revokeTeamProjectAccess(org.id, team.id, orgProj.project.id, ownerId);
  let bobRoleAfterTeamRevoke = organizationService.getEffectiveProjectRole(bobId, orgProj.project.id);
  assert(bobRoleAfterTeamRevoke === null, 'Bob has null role after team project grant revoked');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 9: Organization Audit Logs
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Organization Audit Trail ---');
  const auditLogs = organizationService.listOrgAuditLogs(org.id, ownerId, 50);
  assert(auditLogs.length > 5, `Audit trail recorded ${auditLogs.length} organization events`);
  assert(auditLogs.some(l => l.action === 'team.created'), 'Audit log tracks team creation');
  assert(auditLogs.some(l => l.action === 'project.team_granted'), 'Audit log tracks project team grant');
  assert(auditLogs.some(l => l.action === 'member.role_updated'), 'Audit log tracks role modifications');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 10: Transfer Organization Ownership
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 10. Transfer Organization Ownership ---');
  organizationService.transferOwnership(org.id, aliceId, ownerId, '192.168.1.100');
  const orgAfterTransfer = organizationService.getOrganization(org.id, aliceId);
  assert(orgAfterTransfer.org.ownerId === aliceId, 'Alice is now the new Organization Owner');
  assert(orgAfterTransfer.myRole === 'owner', 'Alice has owner role');

  const previousOwnerRole = organizationService.getOrganization(org.id, ownerId);
  assert(previousOwnerRole.myRole === 'admin', 'Previous owner downgraded to Admin');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 11: Cascading Organization Deletion
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 11. Cascading Organization Deletion ---');
  organizationService.deleteOrganization(org.id, aliceId, '192.168.1.100');

  // Verify teams, members, and project grants were cascaded
  const orgCheck = db.prepare('SELECT id FROM organizations WHERE id = ?').get(org.id);
  assert(!orgCheck, 'Organization deleted from DB');
  const teamsCheck = db.prepare('SELECT id FROM organization_teams WHERE orgId = ?').all(org.id);
  assert(teamsCheck.length === 0, 'Organization teams cascaded');
  const grantsCheck = db.prepare('SELECT id FROM project_team_grants WHERE teamId = ?').all(team.id);
  assert(grantsCheck.length === 0, 'Project team grants cascaded');

  console.log('\n================================================================');
  console.log(`📊 GitHub-Grade Architecture Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runOrgTests().catch(err => {
  console.error('Fatal error in organization test suite:', err);
  process.exit(1);
});
