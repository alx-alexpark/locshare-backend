import prisma from '@/lib/prisma';
import { AttestationType } from '@prisma/client';
import * as openpgp from 'openpgp';
import { hashToken } from '@/lib/hash';

const genRanHex = (size: number) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

export async function POST(request: Request) {
    const data = await request.json();
    const { signedChallenge } = data;

    console.log(signedChallenge);

    const message = await openpgp.readCleartextMessage({ cleartextMessage: signedChallenge });

    const attestation = await prisma.attestation.findFirst({
        where: {
            challenge: message.getText(),
        },
        include: {
            user: true,
        }
    });

    if (!attestation) {
        return Response.json({ error: 'Invalid challenge' }, { status: 400 });
    }

    const user = attestation.user;

    const userPubKey = await openpgp.readKey({ armoredKey: user.publicKey });
    const verified = await openpgp.verify({
        message,
        verificationKeys: userPubKey,
    });

    const token = genRanHex(128);
    const hashedToken = hashToken(token);
    const now = new Date();
    const tokenExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    if (verified.signatures[0].keyID.toHex().toUpperCase() === user.keyid) {
        await prisma.attestation.update({
            where: {
                id: attestation.id,
            },
            data: {
                verified: true,
                authToken: hashedToken,
                fullfilled: true,
                expiresAt: tokenExpiry // Update expiry to 24 hours for the token
            },
        });
    }

    const encryptedToken = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: JSON.stringify({token: token}) }), // input as Message object
        encryptionKeys: userPubKey,
    });

    return Response.json({ tokenCipherText: encryptedToken });
}