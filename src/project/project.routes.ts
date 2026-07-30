// ─────────────────────────────────────────────────────────────────────────────
//  src/project/project.routes.ts
//  Mounted at /api/v1/projects by server.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { createProject, listProjects, deleteProject } from './project.controller';

const router = Router();

router.use(authenticateJwt);

router.post('/', createProject);
router.get('/', listProjects);
router.delete('/:id', deleteProject);

export default router;
