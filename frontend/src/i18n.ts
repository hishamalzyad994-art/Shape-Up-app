// Multi-language i18n for ShapeUp.
// Strings are persisted in AsyncStorage so they survive app restarts and work
// before login. When the user logs in we also sync the choice to their profile.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

type Dict = Record<string, string>;

// ----- English (source of truth) -----
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
  region: 'REGION',
  currency: 'CURRENCY',
  // subscribe screen
  unlock_everything: 'UNLOCK\nEVERYTHING',
  shapeup_pro: 'SHAPEUP PRO',
  three_days_free_trial: '3 DAYS FREE TRIAL',
  try_pro_free: 'Try ShapeUp Pro free for 3 days',
  card_required: "Card required up front. You won't be charged today.",
  cancel_anytime: 'Cancel anytime before the trial ends to avoid being charged.',
  start_free_trial: 'START 3-DAY FREE TRIAL',
  subscribe_now: 'SUBSCRIBE NOW',
  already_active: 'ALREADY ACTIVE',
  monthly: 'MONTHLY',
  six_months: '6 MONTHS',
  yearly: 'YEARLY',
  auto_renew_badge: 'AUTO-RENEW',
  best_value: 'BEST VALUE',
  free_for_3_days: 'FREE for 3 days',
  then_price: 'then',
  per_month: 'per month',
  per_year: 'per year',
  every_6_months: 'every 6 months',
  you_are_pro: "YOU'RE PRO ✨",
  back_to_app: 'BACK TO APP',
  cancel_subscription: 'CANCEL SUBSCRIPTION',
  benefit_workouts: 'Daily ongoing workouts',
  benefit_meals: 'Personalized meal plans',
  benefit_chat: '24/7 AI Coach C chat',
  benefit_reports: 'Weekly progress reports',
  benefit_streaks: 'Streaks, achievements & badges',
  // profile screen
  settings: 'SETTINGS',
  preferences: 'PREFERENCES',
  manage_subscription: 'MANAGE SUBSCRIPTION',
  privacy_policy: 'PRIVACY POLICY',
  terms_of_service: 'TERMS OF SERVICE',
  logout: 'LOG OUT',
  select_language: 'Select language',
  select_region: 'Select region / currency',
  done: 'DONE',
  cancel: 'CANCEL',
  save: 'SAVE',
  tab_home: 'HOME',
  tab_workout: 'WORKOUT',
  tab_diet: 'DIET',
  tab_coach: 'COACH',
  tab_profile: 'PROFILE',
  restore_subscription: 'RESTORE SUBSCRIPTION',
  restoring: 'RESTORING…',
  watch_demo: 'WATCH DEMO',
};

// ----- Translations (curated; non-EN keys fall back to EN if missing) -----
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
  region: 'المنطقة',
  currency: 'العملة',
  unlock_everything: 'افتح\nكل شيء',
  shapeup_pro: 'شيب أب برو',
  three_days_free_trial: 'تجربة مجانية 3 أيام',
  try_pro_free: 'جرّب شيب أب برو مجاناً لمدة 3 أيام',
  card_required: 'يتطلب بطاقة مسبقاً. لن يتم خصم أي مبلغ اليوم.',
  cancel_anytime: 'يمكنك الإلغاء في أي وقت قبل انتهاء التجربة لتجنب الدفع.',
  start_free_trial: 'ابدأ التجربة المجانية 3 أيام',
  subscribe_now: 'اشترك الآن',
  already_active: 'مفعّل بالفعل',
  monthly: 'شهري',
  six_months: '6 أشهر',
  yearly: 'سنوي',
  auto_renew_badge: 'تجديد تلقائي',
  best_value: 'الأفضل قيمة',
  free_for_3_days: 'مجاناً لمدة 3 أيام',
  then_price: 'ثم',
  per_month: 'شهرياً',
  per_year: 'سنوياً',
  every_6_months: 'كل 6 أشهر',
  you_are_pro: 'أنت برو ✨',
  back_to_app: 'العودة للتطبيق',
  cancel_subscription: 'إلغاء الاشتراك',
  benefit_workouts: 'تمارين يومية مستمرة',
  benefit_meals: 'خطط وجبات مخصصة',
  benefit_chat: 'محادثة مع كوتش AI على مدار 24/7',
  benefit_reports: 'تقارير تقدم أسبوعية',
  benefit_streaks: 'سلاسل وإنجازات وشارات',
  settings: 'الإعدادات',
  preferences: 'التفضيلات',
  manage_subscription: 'إدارة الاشتراك',
  privacy_policy: 'سياسة الخصوصية',
  terms_of_service: 'شروط الخدمة',
  logout: 'تسجيل الخروج',
  select_language: 'اختر اللغة',
  select_region: 'اختر المنطقة / العملة',
  done: 'تم',
  cancel: 'إلغاء',
  save: 'حفظ',
  tab_home: 'الرئيسية', tab_workout: 'تمرين', tab_diet: 'تغذية', tab_coach: 'مدرب', tab_profile: 'الملف',
  restore_subscription: 'استعادة الاشتراك', restoring: 'جاري الاستعادة…', watch_demo: 'شاهد العرض',
};

const es: Dict = {
  app_name: 'SHAPEUP', welcome_back: 'Bienvenido de vuelta, atleta.', start: 'EMPEZAR', log_in: 'INICIAR SESIÓN',
  create_account: 'CREAR CUENTA', email: 'Correo', password: 'Contraseña', full_name: 'Nombre completo',
  new_here: '¿Nuevo aquí?', already_member: '¿Ya eres miembro?', ready_to_burn: '¿LISTO\nPARA\nQUEMAR?',
  hey: 'HOLA', start_workout: 'EMPEZAR ENTRENO', streak: 'RACHA', days_done: 'ENTRENOS', kcal_target: 'KCAL OBJETIVO',
  protein: 'PROTEÍNA', ai_coach: 'COACH IA', need_kick: '¿Necesitas un empujón?', talk_anytime: 'Habla con Coach C cuando quieras.',
  target_zone: 'ZONA\nOBJETIVO', complete_day: 'COMPLETAR ENTRENO', nutrition: 'NUTRICIÓN', fuel_right: 'NÚTRETE\nBIEN',
  choose_plan: 'ELIGE PLAN', bmi: 'IMC', bmi_under: 'Bajo peso', bmi_normal: 'Normal', bmi_over: 'Sobrepeso', bmi_obese: 'Obesidad',
  profile: 'PERFIL', your_stats: 'TUS\nDATOS', log: 'REGISTRAR', weekly_progress: 'PROGRESO SEMANAL',
  no_weeks_yet: 'Registra tu peso semanalmente para ver tendencias.', rate_workout: 'VALORA TU ENTRENO', how_was_it: '¿Cómo fue?',
  difficulty_easy: 'FÁCIL', difficulty_medium: 'MEDIO', difficulty_hard: 'DURO', difficulty_crazy: 'BRUTAL',
  why_target: '¿POR QUÉ ESTA META?', why_target_hint: 'En una línea, tu motor en días duros.', whistle: 'SILBATO', language: 'IDIOMA',
  region: 'REGIÓN', currency: 'MONEDA',
  unlock_everything: 'DESBLOQUEA\nTODO', shapeup_pro: 'SHAPEUP PRO', three_days_free_trial: '3 DÍAS GRATIS',
  try_pro_free: 'Prueba ShapeUp Pro gratis 3 días', card_required: 'Tarjeta requerida. Hoy no se cobra nada.',
  cancel_anytime: 'Cancela antes de que termine la prueba para no ser cobrado.',
  start_free_trial: 'EMPEZAR PRUEBA DE 3 DÍAS', subscribe_now: 'SUSCRIBIRSE', already_active: 'YA ACTIVO',
  monthly: 'MENSUAL', six_months: '6 MESES', yearly: 'ANUAL', auto_renew_badge: 'AUTO-RENOVAR', best_value: 'MEJOR VALOR',
  free_for_3_days: 'GRATIS 3 días', then_price: 'luego', per_month: 'al mes', per_year: 'al año', every_6_months: 'cada 6 meses',
  you_are_pro: 'ERES PRO ✨', back_to_app: 'VOLVER', cancel_subscription: 'CANCELAR SUSCRIPCIÓN',
  benefit_workouts: 'Entrenos diarios continuos', benefit_meals: 'Planes de comidas personalizados',
  benefit_chat: 'Coach C IA 24/7', benefit_reports: 'Informes semanales', benefit_streaks: 'Rachas y logros',
  settings: 'AJUSTES', preferences: 'PREFERENCIAS', manage_subscription: 'GESTIONAR SUSCRIPCIÓN',
  privacy_policy: 'POLÍTICA DE PRIVACIDAD', terms_of_service: 'TÉRMINOS', logout: 'CERRAR SESIÓN',
  select_language: 'Selecciona idioma', select_region: 'Selecciona región / moneda', done: 'HECHO', cancel: 'CANCELAR', save: 'GUARDAR',
  tab_home: 'INICIO', tab_workout: 'ENTRENO', tab_diet: 'DIETA', tab_coach: 'COACH', tab_profile: 'PERFIL',
  restore_subscription: 'RESTAURAR SUSCRIPCIÓN', restoring: 'RESTAURANDO…', watch_demo: 'VER DEMO',
};

const fr: Dict = {
  app_name: 'SHAPEUP', welcome_back: 'Bon retour, athlète.', start: 'COMMENCER', log_in: 'CONNEXION',
  create_account: 'CRÉER UN COMPTE', email: 'E-mail', password: 'Mot de passe', full_name: 'Nom complet',
  new_here: 'Nouveau ici ?', already_member: 'Déjà membre ?', ready_to_burn: 'PRÊT À\nBRÛLER ?',
  hey: 'SALUT', start_workout: 'COMMENCER', streak: 'SÉRIE', days_done: 'SÉANCES', kcal_target: 'KCAL CIBLE',
  protein: 'PROTÉINE', ai_coach: 'COACH IA', need_kick: 'Besoin d\'un coup de pouce ?', talk_anytime: 'Parlez à Coach C à tout moment.',
  target_zone: 'ZONE\nCIBLE', complete_day: 'TERMINER LA SÉANCE', nutrition: 'NUTRITION', fuel_right: 'BIEN\nMANGER',
  choose_plan: 'CHOISIR LE PLAN', bmi: 'IMC', bmi_under: 'Insuffisant', bmi_normal: 'Normal', bmi_over: 'Surpoids', bmi_obese: 'Obésité',
  profile: 'PROFIL', your_stats: 'VOS\nSTATS', log: 'JOURNAL', weekly_progress: 'PROGRÈS HEBDO',
  no_weeks_yet: 'Pesez-vous chaque semaine pour voir vos progrès.', rate_workout: 'NOTEZ VOTRE SÉANCE', how_was_it: 'C\'était comment ?',
  difficulty_easy: 'FACILE', difficulty_medium: 'MOYEN', difficulty_hard: 'DUR', difficulty_crazy: 'DINGUE',
  why_target: 'POURQUOI CET OBJECTIF ?', why_target_hint: 'En une ligne, votre carburant.', whistle: 'SIFFLET', language: 'LANGUE',
  region: 'RÉGION', currency: 'DEVISE',
  unlock_everything: 'TOUT\nDÉBLOQUER', shapeup_pro: 'SHAPEUP PRO', three_days_free_trial: '3 JOURS GRATUITS',
  try_pro_free: 'Essayez ShapeUp Pro gratuit 3 jours', card_required: 'Carte requise. Aucun débit aujourd\'hui.',
  cancel_anytime: 'Annulez avant la fin de l\'essai pour ne pas être débité.',
  start_free_trial: 'COMMENCER L\'ESSAI 3 JOURS', subscribe_now: 'S\'ABONNER', already_active: 'DÉJÀ ACTIF',
  monthly: 'MENSUEL', six_months: '6 MOIS', yearly: 'ANNUEL', auto_renew_badge: 'AUTO-RENOUV.', best_value: 'MEILLEUR PRIX',
  free_for_3_days: 'GRATUIT 3 jours', then_price: 'puis', per_month: 'par mois', per_year: 'par an', every_6_months: 'tous les 6 mois',
  you_are_pro: 'VOUS ÊTES PRO ✨', back_to_app: 'RETOUR', cancel_subscription: 'RÉSILIER',
  benefit_workouts: 'Séances quotidiennes', benefit_meals: 'Plans repas personnalisés',
  benefit_chat: 'Coach C IA 24/7', benefit_reports: 'Rapports hebdo', benefit_streaks: 'Séries et succès',
  settings: 'PARAMÈTRES', preferences: 'PRÉFÉRENCES', manage_subscription: 'GÉRER L\'ABONNEMENT',
  privacy_policy: 'CONFIDENTIALITÉ', terms_of_service: 'CONDITIONS', logout: 'DÉCONNEXION',
  select_language: 'Choisir la langue', select_region: 'Choisir la région / devise', done: 'OK', cancel: 'ANNULER', save: 'ENREGISTRER',
  tab_home: 'ACCUEIL', tab_workout: 'SÉANCE', tab_diet: 'DIÈTE', tab_coach: 'COACH', tab_profile: 'PROFIL',
  restore_subscription: "RESTAURER L'ABONNEMENT", restoring: 'RESTAURATION…', watch_demo: 'VOIR DÉMO',
};

const de: Dict = {
  app_name: 'SHAPEUP', welcome_back: 'Willkommen zurück, Athlet.', start: 'START', log_in: 'ANMELDEN',
  create_account: 'KONTO ERSTELLEN', email: 'E-Mail', password: 'Passwort', full_name: 'Vollständiger Name',
  new_here: 'Neu hier?', already_member: 'Schon Mitglied?', ready_to_burn: 'BEREIT\nZUM\nBRENNEN?',
  hey: 'HEY', start_workout: 'TRAINING STARTEN', streak: 'SERIE', days_done: 'WORKOUTS', kcal_target: 'KCAL ZIEL',
  protein: 'PROTEIN', ai_coach: 'KI-COACH', need_kick: 'Brauchst du Antrieb?', talk_anytime: 'Sprich jederzeit mit Coach C.',
  target_zone: 'ZIEL\nZONE', complete_day: 'TRAINING ABSCHLIESSEN', nutrition: 'ERNÄHRUNG', fuel_right: 'RICHTIG\nTANKEN',
  choose_plan: 'PLAN WÄHLEN', bmi: 'BMI', bmi_under: 'Untergewicht', bmi_normal: 'Normal', bmi_over: 'Übergewicht', bmi_obese: 'Adipositas',
  profile: 'PROFIL', your_stats: 'DEINE\nSTATS', log: 'EINTRAGEN', weekly_progress: 'WOCHENFORTSCHRITT',
  no_weeks_yet: 'Wiege dich wöchentlich, um Trends zu sehen.', rate_workout: 'BEWERTE DEIN TRAINING', how_was_it: 'Wie war\'s?',
  difficulty_easy: 'LEICHT', difficulty_medium: 'MITTEL', difficulty_hard: 'HART', difficulty_crazy: 'EXTREM',
  why_target: 'WARUM DIESES ZIEL?', why_target_hint: 'In einem Satz, dein Antrieb.', whistle: 'PFIFF', language: 'SPRACHE',
  region: 'REGION', currency: 'WÄHRUNG',
  unlock_everything: 'ALLES\nFREISCHALTEN', shapeup_pro: 'SHAPEUP PRO', three_days_free_trial: '3 TAGE GRATIS',
  try_pro_free: 'ShapeUp Pro 3 Tage gratis testen', card_required: 'Karte nötig. Heute keine Abbuchung.',
  cancel_anytime: 'Vor Ende der Testphase kündigen, um nicht belastet zu werden.',
  start_free_trial: '3-TAGE-TESTPHASE STARTEN', subscribe_now: 'ABONNIEREN', already_active: 'BEREITS AKTIV',
  monthly: 'MONATLICH', six_months: '6 MONATE', yearly: 'JÄHRLICH', auto_renew_badge: 'AUTO-VERLÄNG.', best_value: 'BESTER WERT',
  free_for_3_days: 'GRATIS 3 Tage', then_price: 'danach', per_month: 'pro Monat', per_year: 'pro Jahr', every_6_months: 'alle 6 Monate',
  you_are_pro: 'DU BIST PRO ✨', back_to_app: 'ZURÜCK', cancel_subscription: 'KÜNDIGEN',
  benefit_workouts: 'Tägliche Workouts', benefit_meals: 'Personalisierte Ernährungspläne',
  benefit_chat: 'KI-Coach C 24/7', benefit_reports: 'Wöchentliche Berichte', benefit_streaks: 'Serien & Erfolge',
  settings: 'EINSTELLUNGEN', preferences: 'PRÄFERENZEN', manage_subscription: 'ABO VERWALTEN',
  privacy_policy: 'DATENSCHUTZ', terms_of_service: 'AGB', logout: 'ABMELDEN',
  select_language: 'Sprache wählen', select_region: 'Region / Währung wählen', done: 'FERTIG', cancel: 'ABBRECHEN', save: 'SPEICHERN',
  tab_home: 'START', tab_workout: 'TRAINING', tab_diet: 'DIÄT', tab_coach: 'COACH', tab_profile: 'PROFIL',
  restore_subscription: 'ABO WIEDERHERSTELLEN', restoring: 'WIRD WIEDERHERGESTELLT…', watch_demo: 'DEMO ANSEHEN',
};

const pt: Dict = {
  app_name: 'SHAPEUP', welcome_back: 'Bem-vindo de volta, atleta.', start: 'COMEÇAR', log_in: 'ENTRAR',
  create_account: 'CRIAR CONTA', email: 'E-mail', password: 'Senha', full_name: 'Nome completo',
  new_here: 'Novo por aqui?', already_member: 'Já é membro?', ready_to_burn: 'PRONTO\nPARA\nQUEIMAR?',
  hey: 'OLÁ', start_workout: 'INICIAR TREINO', streak: 'SEQUÊNCIA', days_done: 'TREINOS', kcal_target: 'KCAL META',
  protein: 'PROTEÍNA', ai_coach: 'COACH IA', need_kick: 'Precisa de empurrão?', talk_anytime: 'Fale com o Coach C a qualquer hora.',
  target_zone: 'ZONA\nALVO', complete_day: 'CONCLUIR TREINO', nutrition: 'NUTRIÇÃO', fuel_right: 'COMA\nCERTO',
  choose_plan: 'ESCOLHER PLANO', bmi: 'IMC', bmi_under: 'Abaixo do peso', bmi_normal: 'Normal', bmi_over: 'Sobrepeso', bmi_obese: 'Obesidade',
  profile: 'PERFIL', your_stats: 'SUAS\nESTATS', log: 'REGISTRAR', weekly_progress: 'PROGRESSO SEMANAL',
  no_weeks_yet: 'Pese-se semanalmente para ver tendências.', rate_workout: 'AVALIE SEU TREINO', how_was_it: 'Como foi?',
  difficulty_easy: 'FÁCIL', difficulty_medium: 'MÉDIO', difficulty_hard: 'DIFÍCIL', difficulty_crazy: 'INSANO',
  why_target: 'POR QUE ESSA META?', why_target_hint: 'Em uma linha, seu combustível.', whistle: 'APITO', language: 'IDIOMA',
  region: 'REGIÃO', currency: 'MOEDA',
  unlock_everything: 'DESBLOQUEAR\nTUDO', shapeup_pro: 'SHAPEUP PRO', three_days_free_trial: '3 DIAS GRÁTIS',
  try_pro_free: 'Experimente ShapeUp Pro grátis por 3 dias', card_required: 'Cartão necessário. Nada cobrado hoje.',
  cancel_anytime: 'Cancele antes do fim do teste para evitar cobrança.',
  start_free_trial: 'INICIAR 3 DIAS GRÁTIS', subscribe_now: 'ASSINAR', already_active: 'JÁ ATIVO',
  monthly: 'MENSAL', six_months: '6 MESES', yearly: 'ANUAL', auto_renew_badge: 'AUTO-RENOV.', best_value: 'MELHOR VALOR',
  free_for_3_days: 'GRÁTIS 3 dias', then_price: 'depois', per_month: 'por mês', per_year: 'por ano', every_6_months: 'a cada 6 meses',
  you_are_pro: 'VOCÊ É PRO ✨', back_to_app: 'VOLTAR', cancel_subscription: 'CANCELAR ASSINATURA',
  benefit_workouts: 'Treinos diários', benefit_meals: 'Planos alimentares personalizados',
  benefit_chat: 'Coach C IA 24/7', benefit_reports: 'Relatórios semanais', benefit_streaks: 'Sequências e conquistas',
  settings: 'CONFIGURAÇÕES', preferences: 'PREFERÊNCIAS', manage_subscription: 'GERENCIAR ASSINATURA',
  privacy_policy: 'PRIVACIDADE', terms_of_service: 'TERMOS', logout: 'SAIR',
  select_language: 'Selecionar idioma', select_region: 'Selecionar região / moeda', done: 'PRONTO', cancel: 'CANCELAR', save: 'SALVAR',
  tab_home: 'INÍCIO', tab_workout: 'TREINO', tab_diet: 'DIETA', tab_coach: 'COACH', tab_profile: 'PERFIL',
  restore_subscription: 'RESTAURAR ASSINATURA', restoring: 'RESTAURANDO…', watch_demo: 'VER DEMO',
};

const it: Dict = {
  app_name: 'SHAPEUP', welcome_back: 'Bentornato, atleta.', start: 'INIZIA', log_in: 'ACCEDI',
  create_account: 'CREA ACCOUNT', email: 'Email', password: 'Password', full_name: 'Nome completo',
  new_here: 'Nuovo qui?', already_member: 'Già membro?', ready_to_burn: 'PRONTO A\nBRUCIARE?',
  hey: 'CIAO', start_workout: 'INIZIA ALLENAMENTO', streak: 'SERIE', days_done: 'ALLENAMENTI', kcal_target: 'KCAL OBIETTIVO',
  protein: 'PROTEINE', ai_coach: 'COACH IA', need_kick: 'Serve una spinta?', talk_anytime: 'Parla con Coach C quando vuoi.',
  target_zone: 'ZONA\nOBIETTIVO', complete_day: 'COMPLETA ALLENAMENTO', nutrition: 'NUTRIZIONE', fuel_right: 'MANGIA\nGIUSTO',
  choose_plan: 'SCEGLI PIANO', bmi: 'BMI', bmi_under: 'Sottopeso', bmi_normal: 'Normale', bmi_over: 'Sovrappeso', bmi_obese: 'Obesità',
  profile: 'PROFILO', your_stats: 'I TUOI\nDATI', log: 'REGISTRA', weekly_progress: 'PROGRESSI SETT.',
  no_weeks_yet: 'Pesati settimanalmente per vedere i progressi.', rate_workout: 'VALUTA L\'ALLENAMENTO', how_was_it: 'Com\'era?',
  difficulty_easy: 'FACILE', difficulty_medium: 'MEDIO', difficulty_hard: 'DURO', difficulty_crazy: 'FOLLE',
  why_target: 'PERCHÉ QUESTO OBIETTIVO?', why_target_hint: 'In una riga, la tua benzina.', whistle: 'FISCHIO', language: 'LINGUA',
  region: 'REGIONE', currency: 'VALUTA',
  unlock_everything: 'SBLOCCA\nTUTTO', shapeup_pro: 'SHAPEUP PRO', three_days_free_trial: '3 GIORNI GRATIS',
  try_pro_free: 'Prova ShapeUp Pro gratis 3 giorni', card_required: 'Carta richiesta. Nessun addebito oggi.',
  cancel_anytime: 'Disdici prima della fine della prova per non essere addebitato.',
  start_free_trial: 'INIZIA PROVA 3 GIORNI', subscribe_now: 'ABBONATI', already_active: 'GIÀ ATTIVO',
  monthly: 'MENSILE', six_months: '6 MESI', yearly: 'ANNUALE', auto_renew_badge: 'AUTO-RINNOVO', best_value: 'MIGLIORE',
  free_for_3_days: 'GRATIS 3 giorni', then_price: 'poi', per_month: 'al mese', per_year: 'all\'anno', every_6_months: 'ogni 6 mesi',
  you_are_pro: 'SEI PRO ✨', back_to_app: 'TORNA', cancel_subscription: 'DISDICI ABBONAMENTO',
  benefit_workouts: 'Allenamenti quotidiani', benefit_meals: 'Piani alimentari personalizzati',
  benefit_chat: 'Coach C IA 24/7', benefit_reports: 'Report settimanali', benefit_streaks: 'Serie e traguardi',
  settings: 'IMPOSTAZIONI', preferences: 'PREFERENZE', manage_subscription: 'GESTISCI ABBONAMENTO',
  privacy_policy: 'PRIVACY', terms_of_service: 'TERMINI', logout: 'ESCI',
  select_language: 'Seleziona lingua', select_region: 'Seleziona regione / valuta', done: 'FATTO', cancel: 'ANNULLA', save: 'SALVA',
  tab_home: 'HOME', tab_workout: 'ALLENA', tab_diet: 'DIETA', tab_coach: 'COACH', tab_profile: 'PROFILO',
  restore_subscription: 'RIPRISTINA ABBONAMENTO', restoring: 'RIPRISTINO…', watch_demo: 'GUARDA DEMO',
};

const hi: Dict = {
  app_name: 'शेपअप', welcome_back: 'वापस स्वागत है, एथलीट।', start: 'शुरू करें', log_in: 'लॉग इन',
  create_account: 'खाता बनाएँ', email: 'ईमेल', password: 'पासवर्ड', full_name: 'पूरा नाम',
  new_here: 'नए हैं?', already_member: 'पहले से सदस्य?', ready_to_burn: 'जलाने को\nतैयार?',
  hey: 'हाय', start_workout: 'वर्कआउट शुरू करें', streak: 'स्ट्रीक', days_done: 'वर्कआउट्स', kcal_target: 'कैलोरी लक्ष्य',
  protein: 'प्रोटीन', ai_coach: 'AI कोच', need_kick: 'जोश चाहिए?', talk_anytime: 'कोच C से कभी भी बात करें।',
  target_zone: 'लक्ष्य\nज़ोन', complete_day: 'वर्कआउट पूरा करें', nutrition: 'पोषण', fuel_right: 'सही\nईंधन',
  choose_plan: 'प्लान चुनें', bmi: 'BMI', bmi_under: 'कम वज़न', bmi_normal: 'सामान्य', bmi_over: 'अधिक वज़न', bmi_obese: 'मोटापा',
  profile: 'प्रोफ़ाइल', your_stats: 'आपके\nआँकड़े', log: 'दर्ज करें', weekly_progress: 'साप्ताहिक प्रगति',
  no_weeks_yet: 'साप्ताहिक वज़न दर्ज करें।', rate_workout: 'वर्कआउट को रेट करें', how_was_it: 'कैसा था?',
  difficulty_easy: 'आसान', difficulty_medium: 'मध्यम', difficulty_hard: 'कठिन', difficulty_crazy: 'पागल',
  why_target: 'यह लक्ष्य क्यों?', why_target_hint: 'एक पंक्ति में, आपकी प्रेरणा।', whistle: 'सीटी', language: 'भाषा',
  region: 'क्षेत्र', currency: 'मुद्रा',
  unlock_everything: 'सब कुछ\nखोलें', shapeup_pro: 'शेपअप प्रो', three_days_free_trial: '3 दिन मुफ़्त',
  try_pro_free: 'शेपअप प्रो 3 दिन मुफ़्त आज़माएँ', card_required: 'कार्ड ज़रूरी। आज कोई शुल्क नहीं।',
  cancel_anytime: 'शुल्क से बचने के लिए ट्रायल खत्म होने से पहले रद्द करें।',
  start_free_trial: '3-दिन मुफ़्त ट्रायल शुरू करें', subscribe_now: 'सदस्यता लें', already_active: 'पहले से सक्रिय',
  monthly: 'मासिक', six_months: '6 महीने', yearly: 'वार्षिक', auto_renew_badge: 'ऑटो-नवीकरण', best_value: 'बेस्ट वैल्यू',
  free_for_3_days: '3 दिन मुफ़्त', then_price: 'फिर', per_month: 'प्रति माह', per_year: 'प्रति वर्ष', every_6_months: 'हर 6 माह',
  you_are_pro: 'आप प्रो हैं ✨', back_to_app: 'वापस', cancel_subscription: 'सदस्यता रद्द करें',
  benefit_workouts: 'रोज़ाना वर्कआउट', benefit_meals: 'निजी भोजन योजना',
  benefit_chat: '24/7 AI कोच चैट', benefit_reports: 'साप्ताहिक रिपोर्ट', benefit_streaks: 'स्ट्रीक्स और बैज',
  settings: 'सेटिंग्स', preferences: 'पसंद', manage_subscription: 'सदस्यता प्रबंधित करें',
  privacy_policy: 'गोपनीयता नीति', terms_of_service: 'सेवा शर्तें', logout: 'लॉग आउट',
  select_language: 'भाषा चुनें', select_region: 'क्षेत्र / मुद्रा चुनें', done: 'हो गया', cancel: 'रद्द करें', save: 'सहेजें',
  tab_home: 'होम', tab_workout: 'वर्कआउट', tab_diet: 'डायट', tab_coach: 'कोच', tab_profile: 'प्रोफ़ाइल',
  restore_subscription: 'सदस्यता पुनर्स्थापित करें', restoring: 'पुनर्स्थापित हो रहा है…', watch_demo: 'डेमो देखें',
};

const ja: Dict = {
  app_name: 'SHAPEUP', welcome_back: 'おかえりなさい、アスリート。', start: 'スタート', log_in: 'ログイン',
  create_account: 'アカウント作成', email: 'メール', password: 'パスワード', full_name: '氏名',
  new_here: '初めての方?', already_member: '会員ですか?', ready_to_burn: '燃やす\n準備は?',
  hey: 'こんにちは', start_workout: 'ワークアウト開始', streak: 'ストリーク', days_done: 'ワークアウト', kcal_target: 'カロリー目標',
  protein: 'タンパク質', ai_coach: 'AIコーチ', need_kick: '励ましが必要?', talk_anytime: 'いつでもコーチCに相談。',
  target_zone: 'ターゲット\nゾーン', complete_day: 'ワークアウト完了', nutrition: '栄養', fuel_right: '正しい\n食事',
  choose_plan: 'プラン選択', bmi: 'BMI', bmi_under: '低体重', bmi_normal: '普通', bmi_over: '過体重', bmi_obese: '肥満',
  profile: 'プロフィール', your_stats: 'あなたの\nデータ', log: '記録', weekly_progress: '週間進捗',
  no_weeks_yet: '毎週体重を記録してください。', rate_workout: 'ワークアウトを評価', how_was_it: 'どうでしたか?',
  difficulty_easy: '簡単', difficulty_medium: '普通', difficulty_hard: 'ハード', difficulty_crazy: '激ハード',
  why_target: 'なぜこの目標?', why_target_hint: '一言で、あなたの原動力。', whistle: 'ホイッスル', language: '言語',
  region: '地域', currency: '通貨',
  unlock_everything: 'すべて\nアンロック', shapeup_pro: 'SHAPEUP PRO', three_days_free_trial: '3日間無料',
  try_pro_free: 'ShapeUp Proを3日間無料お試し', card_required: 'カード必須。本日請求はありません。',
  cancel_anytime: '請求を避けるには無料期間終了前に解約してください。',
  start_free_trial: '3日間無料トライアル開始', subscribe_now: '登録する', already_active: '既に有効',
  monthly: '月額', six_months: '6ヶ月', yearly: '年額', auto_renew_badge: '自動更新', best_value: 'お得',
  free_for_3_days: '3日間無料', then_price: 'その後', per_month: '/月', per_year: '/年', every_6_months: '6ヶ月毎',
  you_are_pro: 'あなたはPRO ✨', back_to_app: '戻る', cancel_subscription: 'サブスクをキャンセル',
  benefit_workouts: '毎日のワークアウト', benefit_meals: '個別ミールプラン',
  benefit_chat: '24/7 AIコーチC', benefit_reports: '週次レポート', benefit_streaks: 'ストリーク&バッジ',
  settings: '設定', preferences: '環境設定', manage_subscription: 'サブスク管理',
  privacy_policy: 'プライバシー', terms_of_service: '利用規約', logout: 'ログアウト',
  select_language: '言語を選択', select_region: '地域 / 通貨を選択', done: '完了', cancel: 'キャンセル', save: '保存',
  tab_home: 'ホーム', tab_workout: 'トレ', tab_diet: '食事', tab_coach: 'コーチ', tab_profile: 'プロフ',
  restore_subscription: '購入を復元', restoring: '復元中…', watch_demo: 'デモを見る',
};

const tr: Dict = {
  app_name: 'SHAPEUP', welcome_back: 'Tekrar hoş geldin, sporcu.', start: 'BAŞLA', log_in: 'GİRİŞ',
  create_account: 'HESAP OLUŞTUR', email: 'E-posta', password: 'Şifre', full_name: 'Ad Soyad',
  new_here: 'Yeni misin?', already_member: 'Zaten üye misin?', ready_to_burn: 'YAKMAYA\nHAZIR MISIN?',
  hey: 'SELAM', start_workout: 'ANTRENMANA BAŞLA', streak: 'SERİ', days_done: 'ANTRENMAN', kcal_target: 'KALORİ HEDEFİ',
  protein: 'PROTEİN', ai_coach: 'AI KOÇ', need_kick: 'Motivasyon mu?', talk_anytime: 'Koç C ile her an konuş.',
  target_zone: 'HEDEF\nBÖLGE', complete_day: 'ANTRENMANI TAMAMLA', nutrition: 'BESLENME', fuel_right: 'DOĞRU\nBESLEN',
  choose_plan: 'PLAN SEÇ', bmi: 'VKİ', bmi_under: 'Zayıf', bmi_normal: 'Normal', bmi_over: 'Fazla kilo', bmi_obese: 'Obez',
  profile: 'PROFİL', your_stats: 'İSTATİSTİK', log: 'KAYDET', weekly_progress: 'HAFTALIK İLERLEME',
  no_weeks_yet: 'Haftalık tartılın, trendleri görün.', rate_workout: 'ANTRENMANINI DEĞERLENDİR', how_was_it: 'Nasıldı?',
  difficulty_easy: 'KOLAY', difficulty_medium: 'ORTA', difficulty_hard: 'ZOR', difficulty_crazy: 'ÇILGIN',
  why_target: 'NEDEN BU HEDEF?', why_target_hint: 'Tek satırda motivasyonun.', whistle: 'DÜDÜK', language: 'DİL',
  region: 'BÖLGE', currency: 'PARA BİRİMİ',
  unlock_everything: 'HER ŞEYİN\nKİLİDİNİ AÇ', shapeup_pro: 'SHAPEUP PRO', three_days_free_trial: '3 GÜN ÜCRETSİZ',
  try_pro_free: 'ShapeUp Pro\'yu 3 gün ücretsiz dene', card_required: 'Kart gerekli. Bugün ücret alınmaz.',
  cancel_anytime: 'Ücret alınmaması için deneme bitmeden iptal edin.',
  start_free_trial: '3 GÜNLÜK DENEMEYİ BAŞLAT', subscribe_now: 'ABONE OL', already_active: 'ZATEN AKTİF',
  monthly: 'AYLIK', six_months: '6 AY', yearly: 'YILLIK', auto_renew_badge: 'OTO-YENİLEME', best_value: 'EN İYİ FİYAT',
  free_for_3_days: '3 gün ÜCRETSİZ', then_price: 'sonra', per_month: 'aylık', per_year: 'yıllık', every_6_months: '6 ayda bir',
  you_are_pro: 'PRO\'SUN ✨', back_to_app: 'GERİ', cancel_subscription: 'ABONELİĞİ İPTAL ET',
  benefit_workouts: 'Günlük antrenmanlar', benefit_meals: 'Kişisel beslenme planları',
  benefit_chat: '24/7 AI Koç C', benefit_reports: 'Haftalık raporlar', benefit_streaks: 'Seri ve rozetler',
  settings: 'AYARLAR', preferences: 'TERCİHLER', manage_subscription: 'ABONELİĞİ YÖNET',
  privacy_policy: 'GİZLİLİK', terms_of_service: 'KOŞULLAR', logout: 'ÇIKIŞ',
  select_language: 'Dil seç', select_region: 'Bölge / para birimi seç', done: 'TAMAM', cancel: 'İPTAL', save: 'KAYDET',
  tab_home: 'ANA', tab_workout: 'ANTRENMAN', tab_diet: 'DİYET', tab_coach: 'KOÇ', tab_profile: 'PROFİL',
  restore_subscription: 'ABONELİĞİ GERİ YÜKLE', restoring: 'GERİ YÜKLENİYOR…', watch_demo: 'DEMO İZLE',
};

const DICTS: Record<string, Dict> = { en, ar, es, fr, de, pt, it, hi, ja, tr };

export const LANGUAGES: { key: string; label: string; native: string; rtl?: boolean }[] = [
  { key: 'en', label: 'English',    native: 'English' },
  { key: 'ar', label: 'Arabic',     native: 'العربية', rtl: true },
  { key: 'es', label: 'Spanish',    native: 'Español' },
  { key: 'fr', label: 'French',     native: 'Français' },
  { key: 'de', label: 'German',     native: 'Deutsch' },
  { key: 'pt', label: 'Portuguese', native: 'Português' },
  { key: 'it', label: 'Italian',    native: 'Italiano' },
  { key: 'hi', label: 'Hindi',      native: 'हिन्दी' },
  { key: 'ja', label: 'Japanese',   native: '日本語' },
  { key: 'tr', label: 'Turkish',    native: 'Türkçe' },
];

const STORAGE_KEY = 'shapeup.language.v1';
const COUNTRY_KEY = 'shapeup.country.v1';

function detectInitialLanguage(): string {
  try {
    const locales = (Localization as any).getLocales?.() || [];
    const code = (locales[0]?.languageCode || '').toLowerCase();
    if (DICTS[code]) return code;
    return 'en';
  } catch { return 'en'; }
}

function detectInitialCountry(): string | null {
  try {
    const locales = (Localization as any).getLocales?.() || [];
    const region = locales[0]?.regionCode || (Localization as any).region;
    return region ? String(region).toUpperCase() : null;
  } catch { return null; }
}

type Ctx = {
  lang: string;
  country: string | null;
  setLang: (lang: string) => Promise<void>;
  setCountry: (country: string) => Promise<void>;
  t: (k: keyof typeof en) => string;
  isRTL: boolean;
};

const LangCtx = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>('en');
  const [country, setCountryState] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const storedLang = await AsyncStorage.getItem(STORAGE_KEY);
        const storedCountry = await AsyncStorage.getItem(COUNTRY_KEY);
        const initLang = storedLang && DICTS[storedLang] ? storedLang : detectInitialLanguage();
        const initCountry = storedCountry || detectInitialCountry();
        setLangState(initLang);
        setCountryState(initCountry);
        applyRTL(initLang);
      } catch {}
    })();
  }, []);

  const setLang = useCallback(async (next: string) => {
    if (!DICTS[next]) return;
    setLangState(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, next); } catch {}
    applyRTL(next);
  }, []);

  const setCountry = useCallback(async (cc: string) => {
    const v = (cc || '').toUpperCase();
    setCountryState(v);
    try { await AsyncStorage.setItem(COUNTRY_KEY, v); } catch {}
  }, []);

  const t = useCallback((k: keyof typeof en) => {
    const d = DICTS[lang] || en;
    return (d[k as string] ?? en[k as string] ?? String(k));
  }, [lang]);

  const isRTL = useMemo(() => {
    return !!LANGUAGES.find(l => l.key === lang && l.rtl);
  }, [lang]);

  const value = useMemo(() => ({ lang, country, setLang, setCountry, t, isRTL }),
    [lang, country, setLang, setCountry, t, isRTL]);

  return React.createElement(LangCtx.Provider, { value }, children);
}

function applyRTL(lang: string) {
  try {
    const wantRTL = !!LANGUAGES.find(l => l.key === lang && l.rtl);
    if (I18nManager.isRTL !== wantRTL) {
      I18nManager.allowRTL(wantRTL);
      I18nManager.forceRTL(wantRTL);
    }
  } catch {}
}

export function useLang() {
  const ctx = useContext(LangCtx);
  if (!ctx) {
    // Fallback (provider not mounted): no-op translations & no persistence.
    return {
      lang: 'en',
      country: null,
      setLang: async () => {},
      setCountry: async () => {},
      t: (k: any) => (en[k as string] ?? String(k)),
      isRTL: false,
    } as Ctx;
  }
  return ctx;
}

// Convenience hook used by existing screens.
export function useT() {
  const { t } = useLang();
  return t;
}

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
