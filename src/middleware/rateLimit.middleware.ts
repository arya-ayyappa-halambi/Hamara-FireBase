import { customApiLimiter, customAuthLimiter } from './custom-rate-limit.middleware';

export const rateLimitConfig = {
  authWindowMinutes: 15,
  authLimit: 1000,
  apiWindowMinutes: 15,
  apiLimit: 1000,
};

export const authLimiter = customAuthLimiter;
export const apiLimiter = customApiLimiter;

