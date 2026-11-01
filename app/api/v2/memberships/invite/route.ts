import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/getSession";
import { notifyUserPush } from "@/lib/pushNotifications";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { userId, instituteId, role, directAdd } = body;

        if (!userId || !instituteId || !role) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        // Validate manager or admin
        const managerCheck = await prisma.instituteManager.findUnique({
            where: {
                userId_instituteId: { userId: session.user.id, instituteId }
            }
        });
        if (!managerCheck && session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized to manage institute members" }, { status: 403 });
        }

        const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
        if (!institute) return NextResponse.json({ error: "Institute not found" }, { status: 404 });

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, username: true }
        });
        if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const isDirect = Boolean(directAdd);

        // Check if already member
        const existing = await prisma.instituteMembership.findFirst({
            where: { userId, instituteId, role: role as any }
        });

        if (existing) {
            if (existing.status === "ACTIVE") {
                return NextResponse.json({ error: "User is already an active member in this role." }, { status: 400 });
            }

            // If pending and manager chose directAdd, upgrade to ACTIVE immediately
            if (isDirect) {
                await prisma.$transaction(async (tx) => {
                    await tx.instituteMembership.update({
                        where: { id: existing.id },
                        data: {
                            status: "ACTIVE",
                            isActive: true,
                            joinedAt: new Date(),
                        }
                    });

                    if (role === "STUDENT") {
                        await tx.studentInstituteRecord.updateMany({
                            where: { membershipId: existing.id },
                            data: { isVerified: true, isVisible: true }
                        });
                    } else if (role === "TEACHER") {
                        await tx.teacherInstituteRecord.updateMany({
                            where: { membershipId: existing.id },
                            data: { isVerified: true, isVisible: true }
                        });
                    }

                    await tx.userNotification.create({
                        data: {
                            userId,
                            type: "NOTICE",
                            title: "Added to Institute",
                            body: JSON.stringify({
                                message: `You have been added as a ${role.toLowerCase()} at ${institute.name}.`,
                                instituteId,
                                role
                            }),
                            entityId: existing.id
                        }
                    });
                });

                const { ensureInstituteChannels, addMemberToInstituteChannels } = await import("@/lib/chat/ensureInstituteChannels");
                await ensureInstituteChannels(instituteId);
                await addMemberToInstituteChannels(userId, instituteId, role);

                revalidatePath(`/manager/${instituteId}/members`);
                revalidatePath(`/institute/${instituteId}`);
                if (institute.slug) {
                    revalidatePath(`/institute/${institute.slug}`);
                    revalidatePath(`/institute/${instituteId}-${institute.slug}`);
                }
                if (targetUser.username) {
                    revalidatePath(`/u/${targetUser.username}`);
                }

                return NextResponse.json({ success: true, message: "Member activated successfully!" });
            }

            return NextResponse.json({ error: "User already has a pending invitation/request." }, { status: 400 });
        }

        // Ensure profile exists based on role
        let profileId = "";
        if (role === "STUDENT") {
            const profile = await prisma.studentProfile.upsert({
                where: { userId },
                create: { userId },
                update: {},
            });
            profileId = profile.id;
        } else if (role === "TEACHER") {
            const profile = await prisma.teacherProfile.upsert({
                where: { userId },
                create: { userId },
                update: {},
            });
            profileId = profile.id;
        }

        // Create membership
        await prisma.$transaction(async (tx) => {
            const membership = await tx.instituteMembership.create({
                data: {
                    userId,
                    instituteId,
                    role: role as any,
                    status: isDirect ? "ACTIVE" : "PENDING",
                    isActive: isDirect,
                    joinedAt: isDirect ? new Date() : null,
                }
            });

            if (role === "STUDENT") {
                await tx.studentInstituteRecord.create({
                    data: {
                        studentProfileId: profileId,
                        instituteId,
                        membershipId: membership.id,
                        courseName: "General",
                        isVerified: isDirect,
                        isVisible: true,
                    }
                });
            } else if (role === "TEACHER") {
                await tx.teacherInstituteRecord.create({
                    data: {
                        teacherProfileId: profileId,
                        instituteId,
                        membershipId: membership.id,
                        designation: "Faculty",
                        teachingSubjects: [],
                        isVerified: isDirect,
                        isVisible: true,
                    }
                });
            }

            // Create Notification
            await tx.userNotification.create({
                data: {
                    userId,
                    type: "NOTICE",
                    title: isDirect ? "Added to Institute" : "Institute Invitation",
                    body: JSON.stringify({
                        message: isDirect
                            ? `You have been added as a ${role.toLowerCase()} at ${institute.name}.`
                            : `${institute.name} has invited you to join as a ${role.toLowerCase()}.`,
                        invite: !isDirect,
                        instituteId,
                        role
                    }),
                    entityId: membership.id
                }
            });
        });

        if (isDirect) {
            const { ensureInstituteChannels, addMemberToInstituteChannels } = await import("@/lib/chat/ensureInstituteChannels");
            await ensureInstituteChannels(instituteId);
            await addMemberToInstituteChannels(userId, instituteId, role);
        }

        notifyUserPush({
            userId,
            title: isDirect ? `Joined ${institute.name} 🎓` : `Invitation from ${institute.name} ✉️`,
            body: isDirect
                ? `You are now a registered ${role.toLowerCase()} of ${institute.name}.`
                : `You have been invited to join ${institute.name} as a ${role.toLowerCase()}.`,
            data: { route: `/institute/${instituteId}` },
        }).catch(() => {});

        // Revalidate paths so teacher profile and institute pages update immediately
        revalidatePath(`/manager/${instituteId}/members`);
        revalidatePath(`/institute/${instituteId}`);
        if (institute.slug) {
            revalidatePath(`/institute/${institute.slug}`);
            revalidatePath(`/institute/${instituteId}-${institute.slug}`);
        }
        if (targetUser.username) {
            revalidatePath(`/u/${targetUser.username}`);
        }

        return NextResponse.json({
            success: true,
            message: isDirect ? `${role === "TEACHER" ? "Teacher" : "Student"} added directly!` : "Invitation sent!"
        });
    } catch (error) {
        console.error("Invite error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
