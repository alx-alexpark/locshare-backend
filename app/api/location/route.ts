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

        const userKeyId = key.getKeyID().toHex().toUpperCase();

        // Get the request body
        const data = await request.json();
        const { cipherText, groupIds } = data;

        if (!cipherText || !groupIds || !Array.isArray(groupIds)) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Set expiration to 24 hours from now
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        // Verify user is a member of all specified groups
        const userGroups = await prisma.group.findMany({
            where: {
                id: {
                    in: groupIds
                },
                members: {
                    some: {
                        keyid: userKeyId
                    }
                }
            },
            select: {
                id: true
            }
        });

        const userGroupIds = userGroups.map(g => g.id);
        const invalidGroups = groupIds.filter((id: number) => !userGroupIds.includes(id));

        if (invalidGroups.length > 0) {
            return NextResponse.json(
                { error: `Not a member of groups: ${invalidGroups.join(', ')}` },
                { status: 403 }
            );
        }

        // Create the location update
        const locationUpdate = await prisma.locationUpdate.create({
            data: {
                userId: userKeyId,
                cipherText,
                expiresAt,
                Group: {
                    connect: groupIds.map((id: number) => ({ id }))
                }
            },
            include: {
                Group: true
            }
        });

        return NextResponse.json(locationUpdate);
    } catch (error) {
        console.error('Error creating location update:', error);
        return NextResponse.json(
            { error: 'Failed to create location update' },
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

        // Get query parameters
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const groupId = url.searchParams.get('groupId');

        if (isNaN(limit) || limit < 1 || limit > 100) {
            return NextResponse.json(
                { error: 'Limit must be between 1 and 100' },
                { status: 400 }
            );
        }

        // Build the query
        const where: any = {
            expiresAt: {
                gt: new Date() // Only get non-expired updates
            },
            Group: {
                some: {
                    members: {
                        some: {
                            keyid: userKeyId
                        }
                    }
                }
            }
        };

        // Add group filter if specified
        if (groupId) {
            where.Group.some.id = parseInt(groupId);
        }

        // Get all users in the relevant groups
        const users = await prisma.user.findMany({
            where: {
                groups: {
                    some: {
                        members: {
                            some: {
                                keyid: userKeyId
                            }
                        }
                    }
                }
            },
            select: {
                keyid: true
            }
        });

        const userKeyIds = users.map(user => user.keyid);

        // Get the most recent updates for each user
        const updates = await prisma.locationUpdate.findMany({
            where: {
                ...where,
                userId: {
                    in: userKeyIds
                }
            },
            select: {
                id: true,
                cipherText: true,
                timestamp: true,
                expiresAt: true,
                user: {
                    select: {
                        keyid: true,
                        fullName: true
                    }
                },
                Group: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: [
                { userId: 'asc' },
                { timestamp: 'desc' }
            ]
        });

        // Group updates by user and limit per user
        const updatesByUser = updates.reduce((acc, update) => {
            const userId = update.user.keyid;
            if (!acc[userId]) {
                acc[userId] = [];
            }
            if (acc[userId].length < limit) {
                acc[userId].push(update);
            }
            return acc;
        }, {} as Record<string, typeof updates>);

        // Flatten the updates back into an array
        const limitedUpdates = Object.values(updatesByUser).flat();

        return NextResponse.json(limitedUpdates);
    } catch (error) {
        console.error('Error fetching location updates:', error);
        return NextResponse.json(
            { error: 'Failed to fetch location updates' },
            { status: 500 }
        );
    }
} 