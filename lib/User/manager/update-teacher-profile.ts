"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/requireAuth"
import { getUserInstituteRole } from "@/lib/auth/getInstituteRole"

/**
 * Invite / register a teacher to an institute by email.
 * This creates:
 *  1. InstituteMembership (role=TEACHER, status=ACTIVE, isActive=true)
 *  2. TeacherInstituteRecord (with designation, department, subjects, isVerified=true)
 */
export async function addTeacherByEmail(
  instituteId: string,
  formData: FormData
) {
  try {
    const session = await requireAuth()
    const role = await getUserInstituteRole(session.user.id, instituteId)
    if (role !== "MANAGER" && role !== "ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const email = (formData.get("email") as string)?.trim().toLowerCase()
    const designation = (formData.get("designation") as string) || undefined
    const department = (formData.get("department") as string) || undefined
    const subjectsRaw = formData.get("subjects") as string | null
    const teachingSubjects = subjectsRaw
      ? subjectsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : []

    if (!email) return { success: false, error: "Email is required." }

    // Find the user by email
    const targetUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true }
    })
    if (!targetUser)
      return { success: false, error: "No user found with that email. Make sure they have registered an account first." }

    // Check if already a member
    const existing = await prisma.instituteMembership.findFirst({
      where: { userId: targetUser.id, instituteId, role: "TEACHER" },
    })
    if (existing) {
      if (existing.status === "ACTIVE") {
        return { success: false, error: "This user is already an active teacher at this institute." }
      }
      // Activate pending
      await prisma.$transaction(async (tx) => {
        await tx.instituteMembership.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", isActive: true, joinedAt: new Date() },
        })
        await tx.teacherInstituteRecord.updateMany({
          where: { membershipId: existing.id },
          data: { isVerified: true, isVisible: true, designation, department, teachingSubjects },
        })
      })
    } else {
      // Ensure the user has a TeacherProfile (create if missing)
      await prisma.teacherProfile.upsert({
        where: { userId: targetUser.id },
        create: { userId: targetUser.id },
        update: {},
      })

      const teacherProfile = await prisma.teacherProfile.findUnique({
        where: { userId: targetUser.id },
        select: { id: true },
      })
      if (!teacherProfile) {
        return { success: false, error: "Failed to create teacher profile." }
      }

      // Create the membership + teacher record in a transaction
      await prisma.$transaction(async (tx) => {
        const membership = await tx.instituteMembership.create({
          data: {
            userId: targetUser.id,
            instituteId,
            role: "TEACHER",
            status: "ACTIVE",
            isActive: true,
            joinedAt: new Date(),
          },
        })

        await tx.teacherInstituteRecord.create({
          data: {
            membershipId: membership.id,
            teacherProfileId: teacherProfile.id,
            instituteId,
            designation,
            department,
            teachingSubjects,
            isVerified: true,
            isVisible: true,
          },
        })
      })
    }

    // Add to channels
    try {
      const { ensureInstituteChannels, addMemberToInstituteChannels } = await import("@/lib/chat/ensureInstituteChannels");
      await ensureInstituteChannels(instituteId);
      await addMemberToInstituteChannels(targetUser.id, instituteId, "TEACHER");
    } catch (chatErr) {
      console.warn("Could not add teacher to channels:", chatErr);
    }

    const inst = await prisma.institute.findUnique({ where: { id: instituteId }, select: { slug: true } });
    revalidatePath(`/manager/${instituteId}/members`)
    revalidatePath(`/institute/${instituteId}`)
    if (inst?.slug) {
      revalidatePath(`/institute/${inst.slug}`)
      revalidatePath(`/institute/${instituteId}-${inst.slug}`)
    }
    if (targetUser.username) {
      revalidatePath(`/u/${targetUser.username}`)
    }

    return { success: true, message: "Teacher added successfully!" }
  } catch (error) {
    console.error("addTeacherByEmail error:", error)
    return { success: false, error: "Failed to add teacher." }
  }
}

/**
 * Remove a teacher from an institute by deleting their membership.
 * Cascade rules handle TeacherInstituteRecord deletion.
 */
export async function removeTeacherMembership(
  membershipId: string,
  instituteId: string
) {
  try {
    const session = await requireAuth()
    const role = await getUserInstituteRole(session.user.id, instituteId)
    if (role !== "MANAGER" && role !== "ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const membership = await prisma.instituteMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { username: true } }, institute: { select: { slug: true } } },
    });

    await prisma.instituteMembership.delete({ where: { id: membershipId } })

    revalidatePath(`/manager/${instituteId}/members`)
    revalidatePath(`/institute/${instituteId}`)
    if (membership?.institute?.slug) {
      revalidatePath(`/institute/${membership.institute.slug}`)
      revalidatePath(`/institute/${instituteId}-${membership.institute.slug}`)
    }
    if (membership?.user?.username) {
      revalidatePath(`/u/${membership.user.username}`)
    }

    return { success: true, message: "Teacher removed." }
  } catch (error) {
    return { success: false, error: "Failed to remove teacher." }
  }
}
