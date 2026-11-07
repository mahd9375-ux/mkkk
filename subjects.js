export const SUBJECTS = [
    { id: 'islamic', name: 'التربية الإسلامية', inMinisterialExam: true, evidence: '' },
    { id: 'arabic', name: 'اللغة العربية', inMinisterialExam: true, evidence: '' },
    { id: 'english', name: 'اللغة الإنكليزية', inMinisterialExam: true, evidence: '' },
    { id: 'math', name: 'الرياضيات', inMinisterialExam: true, evidence: '' },
    { id: 'physics', name: 'الفيزياء', inMinisterialExam: true, evidence: '' },
    { id: 'chemistry', name: 'الكيمياء', inMinisterialExam: true, evidence: '' },
    { id: 'biology', name: 'الأحياء', inMinisterialExam: true, evidence: '' },
    { id: 'social', name: 'الاجتماعيات', inMinisterialExam: true, evidence: '' },
    { id: 'french', name: 'اللغة الفرنسية', inMinisterialExam: true, evidence: '', needsVerification: true },
    { id: 'computer', name: 'الحاسوب', inMinisterialExam: false, evidence: '', needsVerification: true },
];
/** أسماء مستعارة (بعد التطبيع) — تشمل اللهجة العراقية والاختصارات */
export const SUBJECT_ALIASES = {
    islamic: ['اسلاميه', 'الاسلاميه', 'تربيه اسلاميه', 'التربيه الاسلاميه', 'دين', 'الدين', 'قران', 'القران'],
    arabic: ['عربي', 'العربي', 'عربيه', 'العربيه', 'اللغه العربيه', 'قواعد', 'القواعد', 'نحو', 'النحو', 'ادب', 'الادب', 'نصوص', 'مطالعه', 'المطالعه', 'املاء', 'الاملاء', 'تعبير', 'التعبير', 'بلاغه', 'البلاغه'],
    english: ['انكليزي', 'الانكليزي', 'انجليزي', 'الانجليزي', 'انكلش', 'انگليزي', 'انكليزيه', 'الانكليزيه', 'اللغه الانكليزيه', 'english', 'eng'],
    math: ['رياضيات', 'الرياضيات', 'رياضه', 'الرياضه', 'رياضي', 'math', 'maths'],
    physics: ['فيزياء', 'الفيزياء', 'فيزيا', 'الفيزيا', 'فيز', 'physics'],
    chemistry: ['كيمياء', 'الكيمياء', 'كيميا', 'الكيميا', 'كيم', 'chemistry'],
    biology: ['احياء', 'الاحياء', 'احيا', 'الاحيا', 'علم الاحياء', 'الانسان وصحته', 'biology'],
    social: ['اجتماعيات', 'الاجتماعيات', 'اجتماعيه', 'تاريخ', 'التاريخ', 'جغرافيه', 'الجغرافيه', 'جغرافيا', 'وطنيه', 'الوطنيه'],
    french: ['فرنسي', 'الفرنسي', 'فرنسيه', 'الفرنسيه', 'اللغه الفرنسيه', 'french'],
    computer: ['حاسوب', 'الحاسوب', 'حاسبه', 'كمبيوتر', 'الكمبيوتر', 'computer'],
};
export function subjectName(id) {
    if (!id)
        return 'مادة غير محددة';
    return SUBJECTS.find(s => s.id === id)?.name ?? id;
}
