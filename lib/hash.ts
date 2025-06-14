import { createHash } from 'crypto';

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function verifyToken(token: string, hashedToken: string): boolean {
    return hashToken(token) === hashedToken;
} 