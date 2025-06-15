import { hashToken } from './hash';
import prisma from './prisma';
import * as openpgp from 'openpgp';

export async function getAuth(token: string): Promise<openpgp.Key | null> {
    try {
        // Find attestation by token
        const attestation = await prisma.attestation.findFirst({
            where: {
                authToken: hashToken(token),
                verified: true,
                fullfilled: true,
                expiresAt: {
                    gt: new Date() // Token hasn't expired
                }
            },
            include: {
                user: true
            }
        });

        if (!attestation?.user?.publicKey) {
            return null;
        }

        // Parse the public key
        const key = await openpgp.readKey({ armoredKey: attestation.user.publicKey });
        
        // Verify the key is valid
        if (await key.isRevoked() || await key.isPrivate()) {
            return null;
        }

        return key;
    } catch (error) {
        console.error('Error in getAuth:', error);
        return null;
    }
} 