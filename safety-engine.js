/* Deterministic safety gate. It runs before any knowledge, catalog, calculation or future AI provider. */
(function () {
  "use strict";
  const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const emergency = /(?:dor|pressao|aperto)(?: forte)? (?:no|do) peito|chest (?:pain|pressure|tightness)|dolor (?:fuerte )?(?:en el )?pecho|(?:starke )?(?:brustschmerzen|druck auf der brust)|desmai|faint|desmay|ohnmacht|confusao repentina|sudden confusion|confusion repentina|plotzliche verwirrung|falta de ar (?:intensa|subita)|(?:severe|sudden) shortness of breath|falta de aire (?:intensa|repentina)|plotzliche starke atemnot|rosto caido|fala enrolada|face droop|slurred speech|cara caida|habla arrastrada|hangender mundwinkel|fraqueza (?:em um lado|repentina)|one-sided weakness|debilidad repentina|einseitige schwache|reacao alergica grave|severe allergic reaction|reaccion alergica grave|schwere allergische reaktion|nao consigo respirar|cannot breathe|no puedo respirar|kann nicht atmen|sangramento (?:forte|intenso)|severe bleeding|sangrado intenso|starke blutung|pensamentos? de (?:me machucar|suicidio|autolesao)|thoughts? of (?:suicide|self-harm)|pensamientos? de (?:suicidio|autolesion)|suizidgedanken/;
  const urgentInjury = /dor (?:subita|muito forte|aguda)|sudden severe pain|dolor (?:repentino|muy fuerte|agudo)|plotzliche starke schmerzen|nao consigo apoiar|cannot bear weight|no puedo apoyar|nicht belasten|deformidade|deformity|deformidad|fehlstellung|trauma (?:forte|grave)|major trauma|trauma grave|schweres trauma|perda de forca repentina|sudden loss of strength|perdida repentina de fuerza|plotzlicher kraftverlust|(?:calor|heat|calor extremo|hitze).*(?:confus|desmai|faint|vomit|erbrech)/;
  const professional = /gravida|gestante|pos parto|pos-parto|pregnant|pregnancy|postpartum|embarazada|embarazo|posparto|schwanger|schwangerschaft|nach der geburt|cirurgia recente|pos operatorio|recent surgery|postoperative|cirugia reciente|postoperatorio|kurzliche operation|doenca renal|kidney disease|enfermedad renal|nierenerkrankung|diabetes|hipertensao|hypertension|hipertension|bluthochdruck|doenca cardi|heart disease|enfermedad cardi|herzerkrankung|transtorno alimentar|eating disorder|trastorno alimentario|essstorung|anorexia|bulimia|compulsao frequente|binge eating|atracones|essanfalle|medicamento|medication|medicacion|medikament|quimioterapia|chemotherapy|quimioterapia/;
  const unsafe = /esteroide|anabolizante|ciclo de testo|clembuterol|steroid|anabolic|testosterone cycle|clenbuterol|esteroide|anabolico|ciclo de testosterona|anabolika|steroidzyklus|vomitar para emagrecer|vomit to lose weight|vomitar para adelgazar|erbrechen.*abnehmen|desidratar|dehydrate|deshidratar|entwassern|jejum de \d{2,} dias|fast for \d{2,} days|ayuno de \d{2,} dias|\d{2,} tage fasten|perder \d{2,} kg em (?:uma|1) semana|lose \d{2,} kg in (?:one|1) week|perder \d{2,} kg en (?:una|1) semana|\d{2,} kg in einer woche/;

  const messages = {
    emergency: {
      pt: "Isso pode representar uma situação urgente. Interrompa o exercício e procure atendimento de emergência local agora. Se estiver no Brasil, considere o SAMU (192) ou o serviço de emergência da sua região. Não vou tentar diagnosticar nem continuar montando um treino diante desses sinais.",
      en: "This may be an emergency. Stop exercising and seek local emergency care now. I cannot diagnose this or continue planning a workout while these warning signs are present.",
      es: "Esto puede ser una urgencia. Suspende el ejercicio y busca atención de emergencia local ahora. No puedo diagnosticarlo ni continuar preparando un entrenamiento ante estas señales.",
      de: "Dies kann ein Notfall sein. Beende das Training und suche jetzt den örtlichen Notdienst auf. Ich kann dies nicht diagnostizieren oder unter diesen Warnzeichen weitertrainieren lassen."
    },
    urgent: {
      pt: "Interrompa o treino e procure avaliação profissional antes de retomar. Dor súbita intensa, trauma relevante ou incapacidade de apoiar um membro não devem ser tratados com uma adaptação genérica de exercícios.",
      en: "Stop training and seek professional assessment before resuming. Sudden severe pain, major trauma, or inability to bear weight should not be handled with a generic exercise modification.",
      es: "Suspende el entrenamiento y busca una evaluación profesional antes de retomarlo.",
      de: "Beende das Training und lasse dich vor der Fortsetzung fachlich untersuchen."
    },
    professional: {
      pt: "Posso oferecer informações educativas gerais, mas essa condição exige individualização por um profissional habilitado que conheça seu histórico. Não altere medicamentos nem use este bot como diagnóstico. Se você já recebeu liberação e orientações, informe apenas os limites do treino que devem ser respeitados.",
      en: "I can provide general educational information, but this situation requires individual guidance from a qualified professional familiar with your history. Do not change medication or use this bot as a diagnosis.",
      es: "Puedo ofrecer información educativa general, pero esta situación requiere orientación individual de un profesional cualificado.",
      de: "Ich kann allgemeine Informationen geben, aber diese Situation erfordert individuelle fachliche Betreuung."
    },
    caution: {
      pt: "Não consigo identificar a causa da dor pelo chat. Evite os movimentos que reproduzem ou pioram o sintoma e não use um treino genérico para testar a articulação dolorida. Se houver inchaço, instabilidade, perda de força, trauma, dor persistente ou piora, procure avaliação profissional. Posso ajudar a organizar atividades indolores que já estejam liberadas para você.",
      en: "I cannot determine the cause of pain in chat. Avoid movements that reproduce or worsen it, and do not use a generic workout to test a painful joint. Seek professional assessment for swelling, instability, weakness, trauma, persistent pain, or worsening symptoms.",
      es: "No puedo determinar la causa del dolor por chat. Evita movimientos que lo reproduzcan o empeoren y no uses un entrenamiento genérico para probar una articulación dolorida. Busca evaluación profesional si persiste o empeora.",
      de: "Die Ursache von Schmerzen lässt sich im Chat nicht feststellen. Vermeide Bewegungen, die den Schmerz auslösen oder verstärken, und teste ein schmerzendes Gelenk nicht mit einem allgemeinen Trainingsplan. Bei anhaltenden oder zunehmenden Beschwerden ist eine fachliche Untersuchung nötig."
    },
    unsafe: {
      pt: "Não posso orientar práticas perigosas, uso não supervisionado de substâncias ou métodos extremos de perda de peso. Posso ajudar com uma alternativa segura baseada em treino progressivo, alimentação adequada e recuperação.",
      en: "I cannot guide dangerous practices, unsupervised drug use, or extreme weight-loss methods. I can help with a safer training, nutrition, and recovery approach.",
      es: "No puedo orientar prácticas peligrosas, uso no supervisado de sustancias ni métodos extremos.",
      de: "Ich kann keine gefährlichen Praktiken, unbeaufsichtigte Substanzen oder extreme Methoden anleiten."
    }
  };

  function classify(text, profile = {}) {
    const t = normalize(text);
    const withoutExplicitDenials = t
      .replace(/(?:nao (?:tenho|sinto|estou com|apresento)\s+(?:dor|pressao|aperto)[^,.;]*(?:peito)|i (?:do not|don't) have\s+(?:chest (?:pain|pressure|tightness)|(?:pain|pressure)[^,.;]*chest)|no (?:tengo|siento)\s+(?:dolor|presion)[^,.;]*pecho|ich habe keine?\s+(?:brustschmerzen|druck auf der brust))/g, " ")
      .replace(/(?:nao estou com|nao tenho|i (?:do not|don't) have|no tengo|ich habe keine?)\s+(?:falta de ar|shortness of breath|falta de aire|atemnot)/g, " ");
    if (emergency.test(withoutExplicitDenials)) return { level: "emergency", blocksAnswer: true, confidence: "high" };
    if (urgentInjury.test(withoutExplicitDenials)) return { level: "urgent", blocksAnswer: true, confidence: "high" };
    if (unsafe.test(withoutExplicitDenials)) return { level: "unsafe", blocksAnswer: true, confidence: "high" };
    if (professional.test(t)) return { level: "professional", blocksAnswer: false, confidence: "medium", profileCaution: false };
    if (profile.age && (profile.age < 18 || profile.age >= 70)) return { level: "professional", blocksAnswer: false, confidence: "medium", profileCaution: true };
    if (/dor|lesao|alergia|doenca|sintoma|pain|injury|allerg|disease|symptom|dolor|lesion|enfermedad|sintoma|schmerz|verletzung|krankheit/.test(withoutExplicitDenials)) return { level: "caution", blocksAnswer: false, confidence: "medium" };
    return { level: "low", blocksAnswer: false, confidence: "high" };
  }
  function response(result, language = "pt") { return messages[result.level]?.[language] || messages[result.level]?.en || null; }
  window.FitnessSafetyEngine = { classify, response };
})();

