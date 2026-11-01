import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { creditWallet } from "@/lib/wallet/credit";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { notificationId, membershipId, accept } = body;

        if (!notificationId || !membershipId || accept === undefined) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const membership = await prisma.instituteMembership.findUnique({
            where: { id: membershipId }
        });

        if (!membership || membership.userId !== session.user.id || membership.status !== "PENDING") {
            return NextResponse.json({ error: "Invalid membership request" }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            if (accept) {
                await tx.instituteMembership.update({
                    where: { id: membershipId },
                    data: { status: "ACTIVE", isActive: true, joinedAt: new Date() }
                });

                if (membership.role === "STUDENT") {
                    await tx.studentInstituteRecord.updateMany({
                        where: { membershipId },
                        data: { isVerified: true, isVisible: true }
                    });
                } else if (membership.role === "TEACHER") {
                    await tx.teacherInstituteRecord.updateMany({
                        where: { membershipId },
                        data: { isVerified: true, isVisible: true }
                    });
                }

                // Add to channels
                const { ensureInstituteChannels } = await import("@/lib/chat/ensureInstituteChannels");
                await ensureInstituteChannels(membership.instituteId);
                const channels = await tx.conversation.findMany({
                    where: { instituteId: membership.instituteId, type: 'INSTITUTE' }
                });

                const allowedChannels = channels.filter((ch: any) => {
                    if (ch.channelType === "TEACHERS") {
                        return membership.role === "TEACHER" || membership.role === "MANAGER" || membership.role === "ADMIN";
                    }
                    if (ch.channelType === "STAFF") {
                        return membership.role === "MANAGER" || membership.role === "ADMIN";
                    }
                    return true;
                });

                if (allowedChannels.length > 0) {
                    await tx.conversationParticipant.createMany({
                        data: allowedChannels.map((ch: any) => ({
                            conversationId: ch.id,
                            userId: session.user.id,
                            role: membership.role === 'TEACHER' || membership.role === 'MANAGER' ? 'ADMIN' : 'MEMBER'
                        })),
                        skipDuplicates: true
                    });
                }

                // Award Coins
                await creditWallet(session.user.id, 25, "PROFILE_COMPLETION", "Joined Institute Community Bonus");
            } else {
                await tx.instituteMembership.update({
                    where: { id: membershipId },
                    data: { status: "REJECTED" }
                });
            }

            // Mark notification as read
            await tx.userNotification.update({
                where: { id: notificationId },
                data: { isRead: true }
            });
        });

        // Revalidate profile and institute pages
        const [inst, usr] = await Promise.all([
            prisma.institute.findUnique({ where: { id: membership.instituteId }, select: { slug: true } }),
            prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true } })
        ]);

        revalidatePath(`/manager/${membership.instituteId}/members`);
        revalidatePath(`/institute/${membership.instituteId}`);
        if (inst?.slug) {
            revalidatePath(`/institute/${inst.slug}`);
            revalidatePath(`/institute/${membership.instituteId}-${inst.slug}`);
        }
        if (usr?.username) {
            revalidatePath(`/u/${usr.username}`);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Membership response error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
