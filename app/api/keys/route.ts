import { getAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        // Get the authorization header
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the token and verify it
        const token = authHeader.split(' ')[1];
        const key = await getAuth(token);
        if (!key) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Get the keyId from query parameters
        const url = new URL(request.url);
        const keyId = url.searchParams.get('keyId');

        if (!keyId) {
            return NextResponse.json(
                { error: 'keyId parameter is required' },
                { status: 400 }
            );
        }

        // Find the user with the requested keyId
        const user = await prisma.user.findUnique({
            where: {
                keyid: keyId
            },
            select: {
                publicKey: true,
                keyid: true,
                fullName: true
            }
        });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            keyid: user.keyid,
            fullName: user.fullName,
            publicKey: user.publicKey
        });
    } catch (error) {
        console.trace('Error fetching public key:', error);
        return NextResponse.json(
            { error: 'Failed to fetch public key' },
            { status: 500 }
        );
    }
} 