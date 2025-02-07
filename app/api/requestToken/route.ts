import prisma from '@/lib/prisma';
import { AttestationType } from '@prisma/client';
import * as openpgp from 'openpgp';

const genRanHex = (size: number) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

export async function POST(request: Request) {
    const data = await request.json();
    const { keyid } = data;

    const user = await prisma.user.findUnique({
        where: {
            keyid: keyid,
        },
    });

    if (!user) {
        throw new Error('User not found');
    }

    const challengeString = genRanHex(128);

    const attestation = await prisma.attestation.create({
        data: {
            user: { connect: { keyid: user.keyid } },
            // TODO: expiry time
            type: AttestationType.SESSION,
            challenge: challengeString
        },
    });

    return Response.json({ challenge: challengeString });
}