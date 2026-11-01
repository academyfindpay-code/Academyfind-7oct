"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { v2 as cloudinary } from "cloudinary";

// --- Cloudinary Config ---
cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImageToCloudinary(file: File, folderName: string, idPrefix: string) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`;

    const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: `academyfind/${folderName}`,
        public_id: `${idPrefix}-${Date.now()}`,
        overwrite: true,
        format: "webp",
    });
    return uploadResult.secure_url;
}

// 🔥 Helper function to safely parse numbers (Fixes NaN Prisma Crashing)
const parseNum = (val: any) => {
    if (val === null || val === undefined || val === "") return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
};

// ==========================================
// 1. UPDATE BATCHES
// ==========================================
export async function updateInstituteBatches(instituteId: string, batches: any[]) {
    try {
        await prisma.$transaction(async (tx) => {
            const batchIdsToKeep = batches.map(b => b.id).filter(Boolean);
            
            // Delete batches not in the updated list
            await tx.instituteBatch.deleteMany({ 
                where: { 
                    instituteId, 
                    id: { notIn: batchIdsToKeep } 
                } 
            });

            if (batches.length > 0) {
                for (const b of batches) {
                    const data = {
                        name: b.name,
                        duration: b.duration || null,
                        fee: parseNum(b.fee),
                        originalFee: parseNum(b.originalFee),
                        batchType: b.batchType || null,
                        mode: (b.mode as "OFFLINE" | "ONLINE" | "HYBRID") || "OFFLINE",
                        timing: b.timing || null,
                        seatsTotal: parseNum(b.seatsTotal),
                        seatsLeft: parseNum(b.seatsLeft),
                        ageGroupMin: parseNum(b.ageGroupMin),
                        ageGroupMax: parseNum(b.ageGroupMax),
                    };

                    if (b.id) {
                        await tx.instituteBatch.update({
                            where: { id: b.id },
                            data
                        });
                    } else {
                        await tx.instituteBatch.create({
                            data: {
                                instituteId,
                                ...data
                            }
                        });
                    }
                }
            }
        });
        
        revalidatePath(`/manager/${instituteId}/profile`);
        revalidatePath(`/manager/${instituteId}/members`);
        return { success: true };
    } catch (error: any) {
        console.error("Batch Update Error:", error);
        // 🔥 Send exact error to the toast popup
        return { success: false, error: error.message || "Failed to update batches in DB" };
    }
}

// ==========================================
// 2. UPDATE FAQs
// ==========================================
export async function updateInstituteFAQs(instituteId: string, faqs: any[]) {
    try {
        await prisma.$transaction(async (tx) => {
            await tx.instituteFAQ.deleteMany({ where: { instituteId } });

            if (faqs.length > 0) {
                await tx.instituteFAQ.createMany({
                    data: faqs.map((f, idx) => ({
                        instituteId,
                        question: f.question,
                        answer: f.answer,
                        order: idx
                    }))
                });
            }
        });
        
        revalidatePath(`/manager/${instituteId}/profile`);
        return { success: true };
    } catch (error: any) {
        console.error("FAQ Update Error:", error);
        return { success: false, error: error.message || "Failed to update FAQs in DB" };
    }
}

// ==========================================
// 3. UPDATE OPERATING HOURS
// ==========================================
export async function updateOperatingHours(instituteId: string, hours: any[]) {
    try {
        await prisma.$transaction(async (tx) => {
            // Delete old hours safely
            await tx.instituteOperatingHour.deleteMany({ where: { instituteId } });

            if (hours.length > 0) {
                // Insert new hours
                await tx.instituteOperatingHour.createMany({
                    data: hours.map(h => ({
                        instituteId,
                        dayOfWeek: parseInt(h.dayOfWeek), // 🔥 Force integer
                        openTime: h.openTime || null,
                        closeTime: h.closeTime || null,
                        isClosed: Boolean(h.isClosed)     // 🔥 Force boolean
                    }))
                });
            }
        });
        
        revalidatePath(`/manager/${instituteId}/profile`);
        return { success: true };
    } catch (error: any) {
        console.error("Operating Hours Error:", error);
        return { success: false, error: error.message || "Failed to update hours in DB" };
    }
}

// ==========================================
// 4. UPDATE ACHIEVEMENTS (With Images)
// ==========================================
export async function updateAchievements(instituteId: string, formData: FormData) {
    try {
        const rawData = formData.get("data") as string;
        const achievements = JSON.parse(rawData || "[]");

        // 1. Upload new images first to avoid blocking DB transactions
        const processedAchievements = await Promise.all(
            achievements.map(async (ach: any, i: number) => {
                let secureUrl = ach.imageUrl;
                const file = formData.get(`image_${i}`) as File | null;
                
                if (file && file.size > 0) {
                    secureUrl = await uploadImageToCloudinary(file, "achievements", `ach-${instituteId}`);
                }
                
                return {
                    instituteId,
                    year: parseNum(ach.year) || new Date().getFullYear(),
                    title: ach.title,
                    studentName: ach.studentName || null,
                    achievementType: ach.achievementType || null,
                    imageUrl: secureUrl || null
                };
            })
        );

        // 2. Perform DB Replace inside a transaction
        await prisma.$transaction(async (tx) => {
            await tx.instituteAchievement.deleteMany({ where: { instituteId } });
            
            if (processedAchievements.length > 0) {
                await tx.instituteAchievement.createMany({
                    data: processedAchievements
                });
            }
        });

        revalidatePath(`/manager/${instituteId}/profile`);
        return { success: true };
    } catch (error: any) {
        console.error("Achievement Error:", error);
        return { success: false, error: error.message || "Failed to update achievements in DB" };
    }
}

// ==========================================
// 5. UPDATE NOTABLE ALUMNI (With Images)
// ==========================================
export async function updateNotablePersons(instituteId: string, formData: FormData) {
    try {
        const rawData = formData.get("data") as string;
        const persons = JSON.parse(rawData || "[]");

        // 1. Upload files first
        const processedPersons = await Promise.all(
            persons.map(async (p: any, i: number) => {
                let secureUrl = p.imageUrl;
                const file = formData.get(`image_${i}`) as File | null;
                
                if (file && file.size > 0) {
                    secureUrl = await uploadImageToCloudinary(file, "alumni", `alum-${instituteId}`);
                }
                
                return {
                    instituteId,
                    name: p.name,
                    batchYear: parseNum(p.batchYear),
                    placedAt: p.placedAt || null,
                    package: p.package || null,
                    imageUrl: secureUrl || null
                };
            })
        );

        // 2. Transact DB Update
        await prisma.$transaction(async (tx) => {
            await tx.notablePersons.deleteMany({ where: { instituteId } });
            
            if (processedPersons.length > 0) {
                await tx.notablePersons.createMany({
                    data: processedPersons
                });
            }
        });

        revalidatePath(`/manager/${instituteId}/profile`);
        return { success: true };
    } catch (error: any) {
        console.error("Notable Alumni Error:", error);
        return { success: false, error: error.message || "Failed to update alumni in DB" };
    }
}

// ==========================================
// 6. UPDATE FACULTY MEMBERS (Direct Entries with Images)
// ==========================================
export async function updateFacultyMembers(instituteId: string, formData: FormData) {
    try {
        const rawData = formData.get("data") as string;
        const members = JSON.parse(rawData || "[]");

        // 1. Upload files first
        const processedMembers = await Promise.all(
            members.map(async (m: any, i: number) => {
                let secureUrl = m.imageUrl;
                const file = formData.get(`image_${i}`) as File | null;
                
                if (file && file.size > 0) {
                    secureUrl = await uploadImageToCloudinary(file, "faculty", `fac-${instituteId}`);
                }
                
                const subjects = Array.isArray(m.subjects) 
                    ? m.subjects 
                    : (m.subjects ? String(m.subjects).split(",").map((s: string) => s.trim()).filter(Boolean) : []);

                return {
                    instituteId,
                    name: String(m.name || "").trim(),
                    designation: m.designation?.trim() || null,
                    description: m.description?.trim() || null,
                    experience: m.experience?.trim() || null,
                    subjects,
                    displayOrder: i,
                    imageUrl: secureUrl || null
                };
            })
        );

        // 2. Transact DB Update
        await prisma.$transaction(async (tx) => {
            await tx.instituteFacultyMember.deleteMany({ where: { instituteId } });
            
            if (processedMembers.length > 0) {
                await tx.instituteFacultyMember.createMany({
                    data: processedMembers
                });
            }
        });

        // 3. Revalidate paths
        revalidatePath(`/manager/${instituteId}/profile`);
        revalidatePath(`/manager/${instituteId}/members`);
        revalidatePath(`/af-ass-manage/institutes/${instituteId}`);
        const inst = await prisma.institute.findUnique({ where: { id: instituteId }, select: { slug: true } });
        if (inst?.slug) {
            revalidatePath(`/institute/${inst.slug}`);
            revalidatePath(`/institute/${instituteId}`);
        }

        return { success: true };
    } catch (error: any) {
        console.error("Faculty Members Error:", error);
        return { success: false, error: error.message || "Failed to update faculty members in DB" };
    }
}