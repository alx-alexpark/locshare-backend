import prisma from '@/lib/prisma';
import * as openpgp from 'openpgp';

export async function POST(request: Request) {
    const data = await request.json();
    const { pubkey } = data;
    const key: openpgp.Key = await openpgp.readKey({ armoredKey: pubkey });

    if (await key.isRevoked() || await key.isPrivate()) {
        return Response.json({ error: 'Invalid key' }, { status: 400 });
    }

    const keyId = key.getKeyID().toHex().toUpperCase();
    const primaryIdentity = key.getPrimaryUser();

    await prisma.user.create(
        {
            data: {
                keyid: keyId,
                email: (await primaryIdentity).user.userID!.email,
                fullName: (await primaryIdentity).user.userID!.name,
                publicKey: pubkey
            },
        }
    )

    return Response.json({ success: true, keyId: keyId });

}