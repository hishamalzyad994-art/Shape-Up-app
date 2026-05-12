// Lightweight i18n. Add languages here; app reads `language` from user profile.
import { useAuth } from './AuthContext';

type Dict = Record<string, string>;

const en: Dict = {
  app_name: 'SHAPEUP',
  welcome_back: 'Welcome back, athlete.',
  start: 'START',
  log_in: 'LOG IN',
  create_account: 'CREATE ACCOUNT',
  email: 'Email',
  password: 'Password',
  full_name: 'Full name',
  new_here: 'New here?',
  already_member: 'Already a member?',
  ready_to_burn: 'READY TO\nBURN?',
  hey: 'HEY',
  start_workout: 'START WORKOUT',
  streak: 'STREAK',
  days_done: 'WORKOUTS',
  kcal_target: 'KCAL TARGET',
  protein: 'PROTEIN',
  ai_coach: 'AI COACH',
  need_kick: 'Need a kick?',
  talk_anytime: 'Talk to Coach C anytime.',
  target_zone: 'TARGET\nZONE',
  complete_day: 'COMPLETE WORKOUT',
  nutrition: 'NUTRITION',
  fuel_right: 'FUEL\nRIGHT',
  choose_plan: 'CHOOSE PLAN',
  bmi: 'BMI',
  bmi_under: 'Underweight',
  bmi_normal: 'Normal',
  bmi_over: 'Overweight',
  bmi_obese: 'Obese',
  profile: 'PROFILE',
  your_stats: 'YOUR\nSTATS',
  log: 'LOG',
  weekly_progress: 'WEEKLY PROGRESS',
  no_weeks_yet: 'Log your weight weekly to see fat-loss trends.',
  rate_workout: 'RATE YOUR WORKOUT',
  how_was_it: 'How was it?',
  difficulty_easy: 'EASY',
  difficulty_medium: 'MEDIUM',
  difficulty_hard: 'HARD',
  difficulty_crazy: 'CRAZY',
  why_target: 'WHY THIS TARGET?',
  why_target_hint: 'In one line, your fuel on tough days.',
  whistle: 'WHISTLE SOUND',
  language: 'LANGUAGE',
};

const ar: Dict = {
  app_name: 'شيب أب',
  welcome_back: 'أهلاً بعودتك، أيها البطل.',
  start: 'ابدأ',
  log_in: 'تسجيل الدخول',
  create_account: 'إنشاء حساب',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  full_name: 'الاسم الكامل',
  new_here: 'جديد هنا؟',
  already_member: 'هل أنت عضو بالفعل؟',
  ready_to_burn: 'هل أنت\nمستعد؟',
  hey: 'مرحباً',
  start_workout: 'ابدأ التمرين',
  streak: 'سلسلة',
  days_done: 'تمارين',
  kcal_target: 'سعرات الهدف',
  protein: 'بروتين',
  ai_coach: 'مدرب AI',
  need_kick: 'تحتاج دفعة؟',
  talk_anytime: 'تحدث مع كوتش سي في أي وقت.',
  target_zone: 'منطقة\nالهدف',
  complete_day: 'إنهاء التمرين',
  nutrition: 'تغذية',
  fuel_right: 'تغذية\nصحيحة',
  choose_plan: 'اختر الخطة',
  bmi: 'مؤشر كتلة الجسم',
  bmi_under: 'وزن ناقص',
  bmi_normal: 'طبيعي',
  bmi_over: 'وزن زائد',
  bmi_obese: 'سمنة',
  profile: 'الملف',
  your_stats: 'إحصائياتك',
  log: 'تسجيل',
  weekly_progress: 'التقدم الأسبوعي',
  no_weeks_yet: 'سجل وزنك أسبوعياً لرؤية فقدان الدهون.',
  rate_workout: 'قيّم تمرينك',
  how_was_it: 'كيف كان؟',
  difficulty_easy: 'سهل',
  difficulty_medium: 'متوسط',
  difficulty_hard: 'صعب',
  difficulty_crazy: 'مجنون',
  why_target: 'لماذا هذا الهدف؟',
  why_target_hint: 'في سطر واحد، دافعك في الأيام الصعبة.',
  whistle: 'صوت الصافرة',
  language: 'اللغة',
};

const DICTS: Record<string, Dict> = { en, ar };

export function useT() {
  const { user } = useAuth();
  const lang = user?.profile?.language || 'en';
  const dict = DICTS[lang] || en;
  return (k: keyof typeof en) => dict[k] || en[k] || k;
}

export const LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية' },
];

export const MOTIVATION_QUOTES = [
  "Discipline beats motivation. Show up.",
  "Sweat is just fat crying.",
  "The body achieves what the mind believes.",
  "Don't stop when you're tired. Stop when you're done.",
  "Your only limit is you.",
  "Today's effort = tomorrow's results.",
  "Strong is the new skinny.",
  "Every rep counts. Every set matters.",
];
