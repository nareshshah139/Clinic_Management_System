import type { Lang } from './client';

export const LANG_NAMES: Record<Lang, string> = { EN: 'English', TE: 'తెలుగు', HI: 'हिन्दी' };

const S = {
  hello: { EN: 'Hello {name}', TE: 'నమస్తే {name}', HI: 'नमस्ते {name}' },
  intro: { EN: '{doctor} asked how you are doing. Please answer these questions.', TE: '{doctor} మీరు ఎలా ఉన్నారో అడిగారు. దయచేసి ఈ ప్రశ్నలకు జవాబు ఇవ్వండి.', HI: '{doctor} ने आपका हाल पूछा है। कृपया इन सवालों के जवाब दें।' },
  loading: { EN: 'Loading your questions…', TE: 'మీ ప్రశ్నలు లోడ్ అవుతున్నాయి…', HI: 'आपके सवाल लोड हो रहे हैं…' },
  inactive: { EN: 'This link is no longer active. Please contact the clinic.', TE: 'ఈ లింక్ ఇప్పుడు పనిచేయదు. దయచేసి క్లినిక్‌ను సంప్రదించండి.', HI: 'यह लिंक अब सक्रिय नहीं है। कृपया क्लिनिक से संपर्क करें।' },
  network: { EN: 'Could not reach the clinic. Your answers are kept on this page. Please try again.', TE: 'క్లినిక్‌ను చేరుకోలేకపోయాం. మీ జవాబులు ఈ పేజీలోనే ఉన్నాయి. మళ్లీ ప్రయత్నించండి.', HI: 'क्लिनिक तक नहीं पहुँच सके। आपके जवाब इस पेज पर रखे हैं। कृपया फिर से कोशिश करें।' },
  invalid: { EN: 'Please answer every required question.', TE: 'దయచేసి అవసరమైన ప్రతి ప్రశ్నకు జవాబు ఇవ్వండి.', HI: 'कृपया हर ज़रूरी सवाल का जवाब दें।' },
  submit: { EN: 'Send answers', TE: 'జవాబులు పంపండి', HI: 'जवाब भेजें' },
  sending: { EN: 'Sending…', TE: 'పంపుతున్నాం…', HI: 'भेज रहे हैं…' },
  addPhoto: { EN: 'Add photo', TE: 'ఫోటో జోడించండి', HI: 'फ़ोटो जोड़ें' },
  removePhoto: { EN: 'Remove', TE: 'తొలగించండి', HI: 'हटाएँ' },
  photoTooLarge: { EN: 'This photo could not be used. Please try another.', TE: 'ఈ ఫోటోను ఉపయోగించలేకపోయాం. మరొకటి ప్రయత్నించండి.', HI: 'यह फ़ोटो इस्तेमाल नहीं हो सकी। कृपया दूसरी आज़माएँ।' },
  required: { EN: 'Required', TE: 'తప్పనిసరి', HI: 'ज़रूरी' },
  thanks: { EN: 'Thank you. The clinic has your answers.', TE: 'ధన్యవాదాలు. మీ జవాబులు క్లినిక్‌కు చేరాయి.', HI: 'धन्यवाद। आपके जवाब क्लिनिक को मिल गए हैं।' },
  sentOne: { EN: 'Sent. The clinic has these answers.', TE: 'పంపాం. ఈ జవాబులు క్లినిక్‌కు చేరాయి.', HI: 'भेज दिया। ये जवाब क्लिनिक को मिल गए हैं।' },
  already: { EN: 'This check-in was already answered. We passed your new message to the clinic.', TE: 'ఈ చెక్-ఇన్‌కు ఇప్పటికే జవాబు ఇచ్చారు. మీ కొత్త సందేశాన్ని క్లినిక్‌కు పంపాం.', HI: 'इस चेक-इन का जवाब पहले ही दिया जा चुका है। आपका नया संदेश क्लिनिक को भेज दिया गया है।' },
  urgent: { EN: 'Please call the clinic now about your answer.', TE: 'మీ జవాబు గురించి దయచేసి ఇప్పుడే క్లినిక్‌కు కాల్ చేయండి.', HI: 'अपने जवाब के बारे में कृपया अभी क्लिनिक को फ़ोन करें।' },
  call: { EN: 'Call {phone}', TE: '{phone} కు కాల్ చేయండి', HI: '{phone} पर कॉल करें' },
  records: { EN: 'See my records', TE: 'నా రికార్డులు చూడండి', HI: 'मेरे रिकॉर्ड देखें' },
  recordsSoon: { EN: 'Signing in to see your records is coming soon. For now, please ask at reception.', TE: 'మీ రికార్డులు చూడటానికి సైన్ ఇన్ త్వరలో వస్తుంది. ప్రస్తుతానికి రిసెప్షన్‌లో అడగండి.', HI: 'अपने रिकॉर्ड देखने के लिए साइन-इन जल्द आ रहा है। अभी के लिए रिसेप्शन पर पूछें।' },
  language: { EN: 'Language', TE: 'భాష', HI: 'भाषा' },
} as const satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof S;

export function t(lang: Lang, key: StringKey, vars: Record<string, string> = {}): string {
  return S[key][lang].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
