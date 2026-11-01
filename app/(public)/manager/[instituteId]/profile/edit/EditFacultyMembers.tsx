"use client"

import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GraduationCap, Plus, Trash2, Save, Image as ImageIcon, Loader2, BookOpen, Info, CheckCircle2 } from "lucide-react";
import { updateFacultyMembers } from "@/lib/User/manager/updateRelateddata";

type FacultyMemberItem = {
    _key: string;
    id?: string;
    name: string;
    designation: string;
    description: string;
    experience: string;
    subjects: string;
    imageUrl: string;
    _file?: File | null;
};

interface RawFacultyData {
    id?: string;
    name?: string | null;
    designation?: string | null;
    description?: string | null;
    experience?: string | null;
    subjects?: string[] | string | null;
    imageUrl?: string | null;
}

export default function EditFacultyMembers({
    instituteId,
    currentFaculty = [],
    maxLimit = 25,
}: {
    instituteId: string;
    currentFaculty: RawFacultyData[];
    maxLimit?: number;
}) {
    const router = useRouter();
    const [items, setItems] = useState<FacultyMemberItem[]>(
        (currentFaculty || []).map((f: RawFacultyData, idx: number) => ({
            _key: f.id || `fac-${idx}-${Date.now()}`,
            id: f.id,
            name: f.name || "",
            designation: f.designation || "",
            description: f.description || "",
            experience: f.experience || "",
            subjects: Array.isArray(f.subjects) ? f.subjects.join(", ") : (f.subjects || ""),
            imageUrl: f.imageUrl || "",
            _file: null,
        }))
    );
    const [isSaving, setIsSaving] = useState(false);

    const addItem = () => {
        if (items.length >= maxLimit) {
            toast.error(`Limit reached (${maxLimit} faculty members).`);
            return;
        }
        setItems(prev => [
            ...prev,
            {
                _key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: "",
                designation: "",
                description: "",
                experience: "",
                subjects: "",
                imageUrl: "",
                _file: null,
            },
        ]);
    };

    const updateField = (idx: number, field: keyof FacultyMemberItem, value: string | File | null) => {
        setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
    };

    const handleImagePick = (idx: number, file: File | null) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return toast.error("Image too large (Max 5MB)");
        updateField(idx, "_file", file);
        updateField(idx, "imageUrl", URL.createObjectURL(file));
    };

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        const cleaned = items.filter(it => it.name.trim());
        if (items.length > 0 && cleaned.length === 0) {
            toast.error("Please enter a name for the faculty member before saving.");
            return;
        }

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append(
                "data",
                JSON.stringify(
                    cleaned.map((it) => ({
                        id: it.id,
                        name: it.name,
                        designation: it.designation,
                        description: it.description,
                        experience: it.experience,
                        subjects: it.subjects,
                        imageUrl: it.imageUrl,
                    }))
                )
            );
            cleaned.forEach((it, idx) => {
                if (it._file) formData.append(`image_${idx}`, it._file);
            });

            const result = await updateFacultyMembers(instituteId, formData);
            if (result.success) {
                toast.success("Faculty & Teachers directory updated successfully!");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to save faculty");
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to save faculty members";
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card className="p-0 rounded-3xl border-stone-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white transition-all overflow-hidden">
            <CardHeader className="rounded-t-3xl bg-gradient-to-r from-amber-50/80 via-amber-50/30 to-white border-b border-amber-100/70 p-6 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
                                <GraduationCap className="w-5 h-5 text-amber-700" />
                                Direct Faculty Showcase
                            </CardTitle>
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                                No Sign-up Required
                            </span>
                        </div>
                        <CardDescription className="text-xs text-stone-500 mt-1 max-w-xl">
                            Add and showcase your teachers directly on your public institute profile & member directory. You can add multiple teachers with photos, subjects, and experience.
                        </CardDescription>
                    </div>
                    <span className="inline-flex items-center self-start sm:self-auto rounded-full bg-amber-100/70 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200/60">
                        {items.length} / {maxLimit} Added
                    </span>
                </div>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
                {/* Visual Distinction Explanation Callout */}
                <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/60 to-orange-50/30 p-4 text-xs text-stone-700 space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <Info className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>How is this different from &quot;Registered Faculty&quot;?</span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 pt-1">
                        <div className="bg-white/80 rounded-xl p-3 border border-amber-200/50">
                            <p className="font-bold text-amber-900 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                                Direct Showcase (Here)
                            </p>
                            <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                                Simply fill in their photo, designation, experience, and subjects. Great for showcasing faculty immediately on your institute page without asking them to sign up.
                            </p>
                        </div>
                        <div className="bg-white/80 rounded-xl p-3 border border-stone-200/70">
                            <p className="font-bold text-stone-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                                Registered Faculty Accounts
                            </p>
                            <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                                Teachers who hold an individual AcademyFind login account. They can receive 1-on-1 direct messages from students. Manage them via <strong>Add / Invite Faculty</strong>.
                            </p>
                        </div>
                    </div>
                </div>

                {items.length === 0 && (
                    <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50/50">
                        <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700 mb-3">
                            <BookOpen className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-semibold text-stone-700">No faculty members added yet</p>
                        <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                            Add your educators, subject specialists, and mentors to increase student trust and enrollment.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addItem}
                            className="mt-4 gap-1.5 rounded-xl border-amber-200 bg-amber-50/60 text-amber-900 hover:bg-amber-100 text-xs font-semibold"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add First Teacher
                        </Button>
                    </div>
                )}

                {items.map((it, idx) => (
                    <div
                        key={it._key}
                        className="border border-stone-200/80 rounded-2xl p-4 sm:p-5 bg-stone-50/80 relative flex flex-col md:flex-row gap-4 shadow-sm hover:border-amber-300 transition-colors"
                    >
                        <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            aria-label="Remove teacher"
                            className="absolute top-3 right-3 text-stone-400 hover:text-red-600 transition-colors p-1"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Photo Picker */}
                        <div className="flex flex-col items-center md:items-start shrink-0">
                            <label className="cursor-pointer group flex flex-col items-center">
                                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-dashed border-amber-300 group-hover:border-amber-500 shadow-sm bg-white flex items-center justify-center overflow-hidden transition-all">
                                    {it.imageUrl ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={it.imageUrl} alt={it.name || "Teacher"} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-stone-400 group-hover:text-amber-700">
                                            <ImageIcon className="w-6 h-6" />
                                            <span className="text-[10px] font-semibold">Upload Photo</span>
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] font-medium text-stone-400 group-hover:text-stone-700 mt-1">
                                    {it.imageUrl ? "Change photo" : "Click to select"}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleImagePick(idx, e.target.files?.[0] || null)}
                                />
                            </label>
                        </div>

                        {/* Fields Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-grow pr-0 md:pr-6">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-stone-700">Teacher Name *</Label>
                                <Input
                                    value={it.name}
                                    onChange={(e) => updateField(idx, "name", e.target.value)}
                                    placeholder="e.g. Dr. H. C. Verma"
                                    className="bg-white rounded-xl h-9 text-sm"
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-stone-700">Designation / Role</Label>
                                <Input
                                    value={it.designation}
                                    onChange={(e) => updateField(idx, "designation", e.target.value)}
                                    placeholder="e.g. Senior Physics Faculty / HOD"
                                    className="bg-white rounded-xl h-9 text-sm"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-stone-700">Subjects Taught</Label>
                                <Input
                                    value={it.subjects}
                                    onChange={(e) => updateField(idx, "subjects", e.target.value)}
                                    placeholder="e.g. Physics, Mechanics, JEE Adv"
                                    className="bg-white rounded-xl h-9 text-sm"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-stone-700">Experience / Tag</Label>
                                <Input
                                    value={it.experience}
                                    onChange={(e) => updateField(idx, "experience", e.target.value)}
                                    placeholder="e.g. 15+ Years Exp • Ex-IIT Kanpur"
                                    className="bg-white rounded-xl h-9 text-sm"
                                />
                            </div>

                            <div className="space-y-1 sm:col-span-2">
                                <Label className="text-xs font-semibold text-stone-700">Description / Qualifications / Bio</Label>
                                <Textarea
                                    value={it.description}
                                    onChange={(e) => updateField(idx, "description", e.target.value)}
                                    placeholder="Brief background, teaching pedagogy, student achievements mentored, etc."
                                    rows={2}
                                    className="bg-white rounded-xl text-sm resize-none"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={addItem}
                        disabled={items.length >= maxLimit}
                        className="w-full sm:w-auto gap-1.5 rounded-xl border-stone-300 hover:bg-stone-100 text-stone-800"
                    >
                        <Plus className="w-4 h-4" /> Add Teacher Entry
                    </Button>

                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full sm:w-auto bg-stone-900 hover:bg-[#ebdbb7] hover:text-stone-900 text-white rounded-xl gap-2 font-semibold transition-all px-6"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Faculty Directory
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
