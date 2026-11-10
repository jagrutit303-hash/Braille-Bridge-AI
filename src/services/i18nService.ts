/**
 * BrailleBridge Multilingual Localization & i18n Service
 * Supports English (US & IN), Hindi (hi-IN), Kannada (kn-IN), Tamil (ta-IN), and Bengali (bn-IN).
 * Provides consistent phrases for voice onboarding, agent confirmations, cancellations, and status messages.
 */

export type SupportedLanguage = "en-US" | "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "bn-IN";

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  brailleTableId: string;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: "en-US", name: "English (US)", nativeName: "English (US)", brailleTableId: "en-ueb-g1" },
  { code: "en-IN", name: "English (India)", nativeName: "English (India)", brailleTableId: "en-ueb-g1" },
  { code: "hi-IN", name: "Hindi", nativeName: "हिन्दी", brailleTableId: "hi-in-g1" },
  { code: "kn-IN", name: "Kannada", nativeName: "ಕನ್ನಡ", brailleTableId: "kn-in-g1" },
  { code: "ta-IN", name: "Tamil", nativeName: "தமிழ்", brailleTableId: "ta-in-g1" },
  { code: "bn-IN", name: "Bengali", nativeName: "বাংলা", brailleTableId: "bn-in-g1" },
];

export interface I18nPhrases {
  agentGreeting: string;
  listeningPrompt: string;
  listeningPaused: string;
  processingTask: string;
  taskCompleted: string;
  actionCanceled: string;
  actionUndone: string;
  nothingToUndo: string;
  permissionRequired: (actionDesc: string) => string;
  confirmationAcknowledged: string;
  whatAmIDoingIdle: string;
  whatAmIDoingBusy: (currentAction: string) => string;
  repeatPrefix: string;
  nothingToRepeat: string;
  micPermissionDenied: string;
  speechError: (err: string) => string;
  helpGeneral: string;
  onboardingTitle: string;
  onboardingSpokenIntro: string;
  welcomeTour: string;
  voiceSwitched: (langName: string) => string;
}

const PHRASES: Record<string, I18nPhrases> = {
  en: {
    agentGreeting: "Hello! BrailleBridge Agent is ready. Press Alt plus V to speak anytime.",
    listeningPrompt: "Listening… please speak your instruction.",
    listeningPaused: "Listening paused. Press microphone or Alt plus V to resume.",
    processingTask: "Understanding your request and preparing steps…",
    taskCompleted: "Task completed successfully.",
    actionCanceled: "Action canceled. No changes were made.",
    actionUndone: "The previous action has been undone.",
    nothingToUndo: "There is no recent action to undo.",
    permissionRequired: (actionDesc) =>
      `This action requires your confirmation: ${actionDesc}. Say Confirm or Cancel, or press the buttons below.`,
    confirmationAcknowledged: "Confirmed. Executing action now.",
    whatAmIDoingIdle: "I am currently idle and waiting for your instruction.",
    whatAmIDoingBusy: (act) => `I am currently working on: ${act}`,
    repeatPrefix: "Repeating last statement: ",
    nothingToRepeat: "There is no previous message to repeat.",
    micPermissionDenied:
      "Microphone access was denied. Please allow microphone permissions in your browser or type your command.",
    speechError: (err) => `Speech recognition notice: ${err}. You can try again or use the keyboard.`,
    helpGeneral:
      "You can say: Read this page, Go to study companion, Schedule a revision session tomorrow at 4 PM, Change speech speed to faster, or Switch to Kannada.",
    onboardingTitle: "Welcome to BrailleBridge Voice Agent",
    onboardingSpokenIntro:
      "Welcome to BrailleBridge AI. Here are five essential tips: One, press Alt plus V anytime to start or stop voice control. Two, press Escape to silence speech instantly. Three, say 'Cancel that' to stop any active task. Four, say 'Switch to Hindi' or 'Switch to Kannada' to change languages. Five, say 'Where am I' or 'Help' for guidance on any page. You are now ready to explore.",
    welcomeTour:
      "Welcome to BrailleBridge AI. Your voice-first accessible study companion. Open the Dashboard to review your saved notes, notices, and Braille streaks; translate text into English or Bharati Braille; upload PDFs or scanned images for smart audio reading; or press Alt plus V anytime to ask the Voice Agent for guidance.",
    voiceSwitched: (name) => `Switched voice language to ${name}.`,
  },
  hi: {
    agentGreeting: "नमस्ते! ब्रेल ब्रिज एजेंट तैयार है। बोलने के लिए कभी भी ऑल्ट प्लस वी दबाएं।",
    listeningPrompt: "सुन रहा हूँ… कृपया अपना निर्देश बोलें।",
    listeningPaused: "सुनना रोक दिया गया है। फिर से शुरू करने के लिए माइक दबाएं।",
    processingTask: "आपके निर्देश को समझकर कार्य योजना बनाई जा रही है…",
    taskCompleted: "कार्य सफलतापूर्वक पूरा हुआ।",
    actionCanceled: "कार्य रद्द कर दिया गया। कोई बदलाव नहीं किया गया।",
    actionUndone: "पिछला कार्य वापस ले लिया गया है।",
    nothingToUndo: "वापस लेने के लिए कोई हालिया कार्य नहीं है।",
    permissionRequired: (actionDesc) =>
      `इस कार्य के लिए आपकी अनुमति आवश्यक है: ${actionDesc}। पुष्टि करने के लिए 'कन्फर्म' बोलें या 'रद्द करें' कहें।`,
    confirmationAcknowledged: "पुष्टि प्राप्त हुई। कार्य किया जा रहा है।",
    whatAmIDoingIdle: "मैं अभी प्रतीक्षा कर रहा हूँ। कृपया निर्देश दें।",
    whatAmIDoingBusy: (act) => `मैं अभी इस कार्य पर काम कर रहा हूँ: ${act}`,
    repeatPrefix: "पिछला संदेश दोहराया जा रहा है: ",
    nothingToRepeat: "दोहराने के लिए कोई संदेश नहीं है।",
    micPermissionDenied:
      "माइक्रोफ़ोन की अनुमति अस्वीकृत कर दी गई है। कृपया ब्राउज़र में माइक्रोफ़ोन की अनुमति दें।",
    speechError: (err) => `ध्वनि पहचान सूचना: ${err}। कृपया पुनः प्रयास करें।`,
    helpGeneral:
      "आप कह सकते हैं: 'पेज पढ़ो', 'स्टडी कंपैनियन खोलो', 'कल 4 बजे रिवीजन शेड्यूल करो', 'तेज़ बोलो', या 'अंग्रेज़ी में बदलो'।",
    onboardingTitle: "ब्रेलब्रिज वॉइस एजेंट में आपका स्वागत है",
    onboardingSpokenIntro:
      "ब्रेल ब्रिज ए आई में आपका स्वागत है। बोलने के लिए ऑल्ट प्लस वी दबाएं। आवाज़ रोकने के लिए एस्केप दबाएं। किसी भी कार्य को रद्द करने के लिए 'रद्द करो' कहें। भाषा बदलने के लिए 'स्विच टू हिंदी' या 'कन्नड़' कहें। सहायता के लिए 'मदद' कहें।",
    welcomeTour:
      "ब्रेल ब्रिज ए आई में आपका स्वागत है। यह आपका आवाज़ आधारित सुलभ अध्ययन साथी है। अपने सेव किए गए नोट्स, नोटिस और ब्रेल प्रगति देखने के लिए डैशबोर्ड खोलें; अंग्रेजी या भारती ब्रेल में अनुवाद करें; स्मार्ट ऑडियो रीडिंग के लिए पीडीएफ या हस्तलिखित नोट्स अपलोड करें; या वॉइस एजेंट से मार्गदर्शन लेने के लिए कभी भी ऑल्ट वी दबाएं।",
    voiceSwitched: (name) => `आवाज़ की भाषा ${name} में बदल दी गई है।`,
  },
  kn: {
    agentGreeting: "ನಮಸ್ಕಾರ! ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್ ವಾಯ್ಸ್ ಏಜೆಂಟ್ ಸಿದ್ಧವಾಗಿದೆ. ಮಾತನಾಡಲು ಆಲ್ಟ್ ಜೊತೆಗೆ ವಿ ಒತ್ತಿರಿ.",
    listeningPrompt: "ಆಲಿಸುತ್ತಿದೆ… ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸೂಚನೆಯನ್ನು ನೀಡಿ.",
    listeningPaused: "ಆಲಿಸುವಿಕೆ ನಿಲ್ಲಿಸಲಾಗಿದೆ. ಮುಂದುವರಿಸಲು ಮೈಕ್ ಒತ್ತಿರಿ.",
    processingTask: "ನಿಮ್ಮ ಕೋರಿಕೆಯನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ…",
    taskCompleted: "ಕಾರ್ಯ ಯಶಸ್ವಿಯಾಗಿ ಪೂರ್ಣಗೊಂಡಿದೆ.",
    actionCanceled: "ಕಾರ್ಯವನ್ನು ರದ್ದುಮಾಡಲಾಗಿದೆ. ಯಾವುದೇ ಬದಲಾವಣೆ ಆಗಿಲ್ಲ.",
    actionUndone: "ಹಿಂದಿನ ಕಾರ್ಯವನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.",
    nothingToUndo: "ರದ್ದುಗೊಳಿಸಲು ಇತ್ತೀಚಿನ ಯಾವುದೇ ಕಾರ್ಯವಿಲ್ಲ.",
    permissionRequired: (actionDesc) =>
      `ಈ ಕಾರ್ಯಕ್ಕೆ ನಿಮ್ಮ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ: ${actionDesc}. ದೃಢೀಕರಿಸಲು 'ದೃಢೀಕರಿಸಿ' ಅಥವಾ 'ರದ್ದುಮಾಡು' ಎಂದು ಹೇಳಿ.`,
    confirmationAcknowledged: "ದೃಢೀಕರಿಸಲಾಗಿದೆ. ಕಾರ್ಯವನ್ನು ನಿರ್ವಹಿಸಲಾಗುತ್ತಿದೆ.",
    whatAmIDoingIdle: "ನಾನು ಸದ್ಯಕ್ಕೆ ನಿಮ್ಮ ಸೂಚನೆಗಾಗಿ ಕಾಯುತ್ತಿದ್ದೇನೆ.",
    whatAmIDoingBusy: (act) => `ನಾನು ಪ್ರಸ್ತುತ ಈ ಕಾರ್ಯದಲ್ಲಿ ತೊಡಗಿದ್ದೇನೆ: ${act}`,
    repeatPrefix: "ಹಿಂದಿನ ಸಂದೇಶವನ್ನು ಪುನರಾವರ್ತಿಸಲಾಗುತ್ತಿದೆ: ",
    nothingToRepeat: "ಪುನರಾವರ್ತಿಸಲು ಯಾವುದೇ ಸಂದೇಶವಿಲ್ಲ.",
    micPermissionDenied:
      "ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿಯನ್ನು ನಿರಾಕರಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮೈಕ್ ಅನುಮತಿ ನೀಡಿ.",
    speechError: (err) => `ಧ್ವನಿ ದೋಷ: ${err}. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.`,
    helpGeneral:
      "ನೀವು ಹೇಳಬಹುದು: 'ಈ ಪುಟವನ್ನು ಓದಿ', 'ಸ್ಟಡಿ ಕಂಪ್ಯಾನಿಯನ್ ತೆರೆ', 'ನಾಳೆ ಮಧ್ಯಾಹ್ನ 4 ಗಂಟೆಗೆ ಅಧ್ಯಯನ ನಿಗದಿಪಡಿಸು', 'ವೇಗವಾಗಿ ಮಾತನಾಡು'.",
    onboardingTitle: "ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್ ವಾಯ್ಸ್ ಏಜೆಂಟ್‌ಗೆ ಸುಸ್ವಾಗತ",
    onboardingSpokenIntro:
      "ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್ ಎ ಐ ಗೆ ಸುಸ್ವಾಗತ. ಮಾತನಾಡಲು ಆಲ್ಟ್ ಜೊತೆಗೆ ವಿ ಒತ್ತಿರಿ. ಧ್ವನಿಯನ್ನು ನಿಲ್ಲಿಸಲು ಎಸ್ಕೇಪ್ ಒತ್ತಿರಿ. ಕಾರ್ಯವನ್ನು ರದ್ದುಮಾಡಲು 'ರದ್ದುಮಾಡು' ಎಂದು ಹೇಳಿ. ಭಾಷೆ ಬದಲಾಯಿಸಲು 'ಕನ್ನಡ' ಅಥವಾ 'ಇಂಗ್ಲಿಷ್' ಎಂದು ಹೇಳಿ. ಸಹಾಯಕ್ಕಾಗಿ 'ಸಹಾಯ' ಎಂದು ಹೇಳಿ.",
    welcomeTour:
      "ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್ ಎ ಐ ಗೆ ಸುಸ್ವಾಗತ. ಇದು ನಿಮ್ಮ ಧ್ವನಿ ಆಧಾರಿತ ಸುಲಭ ಅಧ್ಯಯನ ಸಂಗಾತಿ. ನಿಮ್ಮ ಉಳಿಸಿದ ಟಿಪ್ಪಣಿಗಳು, ಸೂಚನೆಗಳು ಮತ್ತು ಬ್ರೈಲ್ ಪ್ರಗತಿಯನ್ನು ನೋಡಲು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ತೆರೆಯಿರಿ; ಇಂಗ್ಲಿಷ್ ಅಥವಾ ಭಾರತಿ ಬ್ರೈಲ್‌ಗೆ ಅನುವಾದಿಸಿ; ಪಿಡಿಎಫ್ ಅಥವಾ ಚಿತ್ರಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಕೇಳಿ; ಅಥವಾ ಮಾರ್ಗದರ್ಶನಕ್ಕಾಗಿ ಆಲ್ಟ್ ವಿ ಒತ್ತಿರಿ.",
    voiceSwitched: (name) => `ಧ್ವನಿಯ ಭಾಷೆಯನ್ನು ${name}ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.`,
  },
  ta: {
    agentGreeting: "வணக்கம்! பிரெய்ல் பிரிட்ஜ் ஏஜென்ட் தயாராக உள்ளது. பேச ஆல்ட் உடன் வி அழுத்தவும்.",
    listeningPrompt: "கேட்கிறது… தயவுசெய்து உங்கள் கட்டளையைக் கூறவும்.",
    listeningPaused: "கேட்பது நிறுத்தப்பட்டது. தொடர மைக்கை அழுத்தவும்.",
    processingTask: "உங்கள் கட்டளையை ஆய்வு செய்கிறது…",
    taskCompleted: "பணி வெற்றிகரமாக முடிந்தது.",
    actionCanceled: "செயல் ரத்து செய்யப்பட்டது. மாற்றங்கள் எதுவும் செய்யப்படவில்லை.",
    actionUndone: "முந்தைய செயல் திரும்பப் பெறப்பட்டது.",
    nothingToUndo: "திரும்பப் பெற எந்த செயலும் இல்லை.",
    permissionRequired: (actionDesc) =>
      `இந்தச் செயலுக்கு உங்கள் அனுமதி தேவை: ${actionDesc}. உறுதிப்படுத்த 'உறுதி செய்' அல்லது 'ரத்து செய்' என கூறவும்.`,
    confirmationAcknowledged: "உறுதிப்படுத்தப்பட்டது. செயல் தொடங்குகிறது.",
    whatAmIDoingIdle: "நான் உங்கள் கட்டளைக்காக காத்திருக்கிறேன்.",
    whatAmIDoingBusy: (act) => `நான் தற்போது இதில் பணியாற்றுகிறேன்: ${act}`,
    repeatPrefix: "முந்தைய செய்தி மீண்டும் கூறப் படுகிறது: ",
    nothingToRepeat: "மீண்டும் கூற எந்த செய்தியும் இல்லை.",
    micPermissionDenied: "மைக்ரோஃபோன் அனுமதி மறுக்கப்பட்டது. தயவுசெய்து உலாவியில் அனுமதி வழங்கவும்.",
    speechError: (err) => `பேச்சு அடையாளம் காணல் பிழை: ${err}.`,
    helpGeneral: "நீங்கள் கூறலாம்: 'பக்கத்தைப் படி', 'காலெண்டர் திற', 'வேகமாகப் பேசு'.",
    onboardingTitle: "பிரெய்ல்பிரிட்ஜ் வாய்ஸ் ஏஜெண்டிற்கு நல்வரவு",
    onboardingSpokenIntro:
      "பிரெய்ல் பிரிட்ஜ் ஏ ஐ க்கு நல்வரவு. பேச ஆல்ட் உடன் வி அழுத்தவும். ஆடியோவை நிறுத்த எஸ்கேப் அழுத்தவும். செயலை ரத்து செய்ய 'ரத்து செய்' என்று கூறவும்.",
    welcomeTour:
      "பிரெய்ல் பிரிட்ஜ் ஏ ஐ க்கு நல்வரவு. இது உங்கள் குரல் வழி கற்றல் துணை. சேமிக்கப்பட்ட குறிப்புகள் மற்றும் பிரெய்ல் முன்னேற்றத்தைக் காண டாஷ்போர்டைத் திறக்கவும்; ஆங்கிலம் அல்லது பாரதி பிரெய்லுக்கு மொழிபெயர்க்கவும்; பிடிஎஃப் குறிப்புகளைப் பதிவேற்றி கேட்கவும்; அல்லது ஆல்ட் வி அழுத்தி குரல் உதவியாளரிடம் கேட்கவும்.",
    voiceSwitched: (name) => `மொழி ${name} ஆக மாற்றப்பட்டது.`,
  },
  bn: {
    agentGreeting: "নমস্কার! ব্রেইল ব্রিজ ভয়েস এজেন্ট প্রস্তুত। কথা বলতে অল্ট প্লাস ভি টিপুন।",
    listeningPrompt: "শুনছি… অনুগ্রহ করে আপনার নির্দেশ বলুন।",
    listeningPaused: "শোনা স্থগিত করা হয়েছে। আবার শুরু করতে মাইক টিপুন।",
    processingTask: "আপনার নির্দেশ বোঝা হচ্ছে…",
    taskCompleted: "কাজ সফলভাবে সম্পন্ন হয়েছে।",
    actionCanceled: "কাজ বাতিল করা হয়েছে। কোনো পরিবর্তন করা হয়নি।",
    actionUndone: "পূর্ববর্তী কাজটি পূর্বাবস্থায় ফিরিয়ে আনা হয়েছে।",
    nothingToUndo: "পূর্বাবস্থায় ফেরানোর মতো কোনো সাম্প্রতিক কাজ নেই।",
    permissionRequired: (actionDesc) =>
      `এই কাজের জন্য আপনার অনুমতি প্রয়োজন: ${actionDesc}। নিশ্চিত করতে 'নিশ্চিত করুন' অথবা 'বাতিল করুন' বলুন।`,
    confirmationAcknowledged: "অনুমতি নিশ্চিত করা হয়েছে। কাজ শুরু হচ্ছে।",
    whatAmIDoingIdle: "আমি বর্তমানে আপনার নির্দেশের অপেক্ষায় আছি।",
    whatAmIDoingBusy: (act) => `আমি বর্তমানে এই কাজটি করছি: ${act}`,
    repeatPrefix: "আগের বার্তাটি পুনরাবৃত্তি করা হচ্ছে: ",
    nothingToRepeat: "পুনরাবৃত্তি করার মতো কোনো বার্তা নেই।",
    micPermissionDenied: "মাইক্রোফোনের অনুমতি প্রত্যাখ্যান করা হয়েছে। ব্রাউজারে অনুমতি দিন।",
    speechError: (err) => `শব্দ শনাক্তকরণ বিজ্ঞপ্তি: ${err}।`,
    helpGeneral: "আপনি বলতে পারেন: 'পাতাটি পড়ুন', 'স্টাডি সঙ্গী খুলুন', 'দ্রুত কথা বলুন'।",
    onboardingTitle: "ব্রেইলব্রিজ ভয়েস এজেন্টে স্বাগতম",
    onboardingSpokenIntro:
      "ব্রেইল ব্রিজ এ আই-তে স্বাগতম। কথা বলতে অল্ট প্লাস ভি টিপুন। ভয়েস থামাতে এস্কেপ টিপুন। কোনো কাজ বাতিল করতে 'বাতিল করো' বলুন।",
    welcomeTour:
      "ব্রেইল ব্রিজ এ আই-তে স্বাগতম। এটি আপনার ভয়েস-ভিত্তিক সহজ শিক্ষার সঙ্গী। সংরক্ষিত নোট, নোটিশ এবং ব্রেইল অগ্রগতি দেখতে ড্যাশবোর্ড খুলুন; ইংরেজি বা ভারতী ব্রেইলে অনুবাদ করুন; পিডিএফ বা হাতে লেখা নোট আপলোড করে শুনুন; বা সাহায্যের জন্য যেকোনো সময় অল্ট ভি টিপুন।",
    voiceSwitched: (name) => `ভয়েস ভাষা ${name}-তে পরিবর্তন করা হয়েছে।`,
  },
};

/**
 * Get localized phrases for the specified language
 */
export function getPhrases(langCode: string): I18nPhrases {
  const primaryLang = langCode.split("-")[0].toLowerCase();
  return PHRASES[primaryLang] || PHRASES.en;
}

/**
 * Resolve display name for language code
 */
export function getLanguageName(code: string): string {
  const match = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return match ? `${match.name} (${match.nativeName})` : code;
}
