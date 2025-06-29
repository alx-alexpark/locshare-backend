import { getAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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

        // Get the request body
        const data = await request.json();
        const { name, memberKeyIds } = data;

        if (!name) {
            return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
        }

        // Create the group with the creator as a member
        const group = await prisma.group.create({
            data: {
                name,
                members: {
                    connect: [
                        { keyid: key.getKeyID().toHex().toUpperCase() }, // Creator
                        ...(memberKeyIds.filter(k => !!k) || []).map((keyId: string) => ({ keyid: keyId }))
                    ].filter(c => !!c)
                }
            },
            include: {
                members: true
            }
        });

        return NextResponse.json(group);
    } catch (error) {
        console.trace('Error creating group:', error.stack);
        return NextResponse.json(
            { error: 'Failed to create group' },
            { status: 500 }
        );
    }
}

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

        const userKeyId = key.getKeyID().toHex().toUpperCase();

        // Get all groups the user is a member of
        const groups = await prisma.group.findMany({
            where: {
                members: {
                    some: {
                        keyid: userKeyId
                    }
                }
            },
            select: {
                id: true,
                name: true,
                members: {
                    select: {
                        keyid: true,
                        fullName: true
                    }
                }
            }
        });

        return NextResponse.json(groups);
    } catch (error) {
        console.trace('Error fetching groups:', error);
        return NextResponse.json(
            { error: 'Failed to fetch groups' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: Request) {
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

        const userKeyId = key.getKeyID().toHex().toUpperCase();

        // Get the request body
        const data = await request.json();
        const { groupId, newMemberKeyIds } = data;

        if (!groupId || !newMemberKeyIds || !Array.isArray(newMemberKeyIds)) {
            return NextResponse.json(
                { error: 'Missing or invalid groupId or newMemberKeyIds' },
                { status: 400 }
            );
        }

        // Verify the requester is a member of the group
        const group = await prisma.group.findFirst({
            where: {
                id: groupId,
                members: {
                    some: {
                        keyid: userKeyId
                    }
                }
            }
        });

        if (!group) {
            return NextResponse.json(
                { error: 'Group not found or you are not a member' },
                { status: 404 }
            );
        }

        // Verify all new members exist
        const existingUsers = await prisma.user.findMany({
            where: {
                keyid: {
                    in: newMemberKeyIds
                }
            },
            select: {
                keyid: true
            }
        });

        const existingKeyIds = existingUsers.map(user => user.keyid);
        const nonExistentKeyIds = newMemberKeyIds.filter(id => !existingKeyIds.includes(id));

        if (nonExistentKeyIds.length > 0) {
            return NextResponse.json(
                { error: `Users not found: ${nonExistentKeyIds.join(', ')}` },
                { status: 400 }
            );
        }

        // Add new members to the group
        const updatedGroup = await prisma.group.update({
            where: {
                id: groupId
            },
            data: {
                members: {
                    connect: newMemberKeyIds.map(keyId => ({ keyid: keyId }))
                }
            },
            include: {
                members: {
                    select: {
                        keyid: true,
                        fullName: true
                    }
                }
            }
        });

        return NextResponse.json(updatedGroup);
    } catch (error) {
        console.trace('Error adding members to group:', error);
        return NextResponse.json(
            { error: 'Failed to add members to group' },
            { status: 500 }
        );
    }
} 